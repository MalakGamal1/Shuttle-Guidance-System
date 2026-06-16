'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { STATIONS, getOptimalRoute, buildCampusRoute, buildGraph } from '@/lib/university-graph'
import { useShuttleRequests, type ShuttleRequest } from '@/hooks/useShuttleRequests'
import { useLiveShuttles, type LiveShuttle } from '@/hooks/useLiveShuttles'
import { useFirebaseStations, type FirebaseStation } from '@/hooks/useFirebaseStations'
import { rtdb } from '@/lib/firebase'
import { createShuttleIcon } from '@/lib/leaflet-icons'
import { ref, update } from 'firebase/database'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Bus, MapPin, Users,
  Loader2, AlertCircle, Plus, Minus,
} from 'lucide-react'

// ─── Pure Helpers ────────────────────────────────────────────────

function stationName(id: string, firestoreStations: FirebaseStation[]): string {
  const local = STATIONS.find(s => s.id === id)
  if (local) return local.name
  const fb = firestoreStations.find(s => s.id === id)
  if (fb) return fb.name
  return id
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return s <= 5 ? 'just now' : `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function getDistance(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function projectPointOnSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const atob = [b[0] - a[0], b[1] - a[1]];
  const atop = [p[0] - a[0], p[1] - a[1]];
  const lenSq = atob[0] * atob[0] + atob[1] * atob[1];
  if (lenSq === 0) return a;
  
  let t = (atop[0] * atob[0] + atop[1] * atob[1]) / lenSq;
  t = Math.max(0, Math.min(1, t)); // clamp to segment
  
  return [a[0] + t * atob[0], a[1] + t * atob[1]];
}

function getRemainingPath(shuttlePt: [number, number], path: [number, number][]): [number, number][] {
  if (path.length < 2) return [shuttlePt];

  let minDistance = Infinity;
  let nearestPoint: [number, number] = shuttlePt;
  let segmentIndex = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i+1];
    const projected = projectPointOnSegment(shuttlePt, a, b);
    const dist = getDistance(shuttlePt, projected);
    if (dist < minDistance) {
      minDistance = dist;
      nearestPoint = projected;
      segmentIndex = i;
    }
  }

  return [nearestPoint, ...path.slice(segmentIndex + 1)];
}

const calcBearing = (from: [number, number], to: [number, number]): number => {
  const dLng = ((to[1] - from[1]) * Math.PI) / 180
  const lat1 = (from[0] * Math.PI) / 180
  const lat2 = (to[0] * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180) / Math.PI
}



function makeCircleStyle(color: string) {
  return { radius: 7, color, fillColor: color, fillOpacity: 1, weight: 2.5 }
}

// ─────────────────────────────────────────────────────────────────

export default function MapClient() {
  const [mapReady, setMapReady]           = useState(false)
  const [activeRequest, setActiveRequest] = useState<ShuttleRequest | null>(null)
  const [continuousRoute, setContinuousRoute] = useState<{ lat: number; lng: number }[]>([])
  const [error, setError]                 = useState('')
  const [routeLoading, setRouteLoading]   = useState(false)

  const fullRouteRef     = useRef<{ lat: number; lng: number }[]>([])
  const mapDivRef        = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<any>(null)
  const stationMarkersRef = useRef<Record<string, any>>({})
  const shuttleMarkersRef = useRef<Record<string, any>>({})
  const prevShuttlePos   = useRef<Record<string, any>>({})
  const polylineGroupRef = useRef<any[]>([])
  const hasAutoSelected  = useRef(false)
  const lastShuttleBearingsRef = useRef<Record<string, number>>({})

  const { requests, loading: reqLoading } = useShuttleRequests()
  const { shuttles } = useLiveShuttles()
  const { stations: firestoreStations } = useFirebaseStations()

  // Rebuild routing graph dynamically whenever stations collection changes
  useEffect(() => {
    buildGraph(firestoreStations)
  }, [firestoreStations])

  const activeShuttle = shuttles[0] ?? null

  const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'active')
  const uniqueFromIds = Array.from(new Set(activeRequests.map(r => r.fromId).filter(Boolean))) as string[]

  const stopCount  = uniqueFromIds.length

  const getStationCoords = useCallback((id: string): { lat: number; lng: number } | null => {
    const local = STATIONS.find(s => s.id === id)
    if (local) return { lat: local.lat, lng: local.lng }
    const fb = firestoreStations.find(s => s.id === id)
    if (fb && fb.lat !== 0) return { lat: fb.lat, lng: fb.lng }
    return null
  }, [firestoreStations])

  // Compute total distance of continuousRoute in meters
  let totalDistance = 0
  for (let i = 0; i < continuousRoute.length - 1; i++) {
    totalDistance += getDistance(
      [continuousRoute[i].lat, continuousRoute[i].lng],
      [continuousRoute[i+1].lat, continuousRoute[i+1].lng]
    )
  }
  const routeCost = Math.round(totalDistance * 111000)
  const estMinutes = Math.round(routeCost / 60)

  // ── 1. Leaflet Script & CSS Injection ────────────────────────
  useEffect(() => {
    if (document.getElementById('leaflet-css')) { setMapReady(true); return }
    const css = document.createElement('link')
    css.id = 'leaflet-css'
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    js.onload = () => setMapReady(true)
    document.head.appendChild(js)
  }, [])

  // ── 2. Initialize Map (without station markers — they come from Firestore effect) ──
  useEffect(() => {
    if (!mapReady || !mapDivRef.current || mapRef.current) return
    const L = (window as any).L

    mapRef.current = L.map(mapDivRef.current, {
      center: [27.18725, 31.17010],
      zoom: 17,
      zoomControl: false,
      maxBounds: [[27.180, 31.162], [27.196, 31.182]],
      maxBoundsViscosity: 0.8,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [mapReady])

  // ── 2b. Render station markers from Firestore (realtime) ─────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    // Build a set of current Firestore station IDs
    const currentIds = new Set(firestoreStations.map(s => s.id))

    // Add or update markers for each Firestore station
    firestoreStations.forEach((station) => {
      if (station.lat === 0 && station.lng === 0) return // skip stations without coords

      const color = station.isActive ? '#3b82f6' : '#94a3b8'

      if (stationMarkersRef.current[station.id]) {
        // Update existing marker position and style
        const marker = stationMarkersRef.current[station.id]
        marker.setLatLng([station.lat, station.lng])
        marker.setStyle(makeCircleStyle(color))
        marker.unbindTooltip()
        marker.bindTooltip(station.name, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-tooltip-custom',
        })
      } else {
        // Create new marker
        const m = L.circleMarker([station.lat, station.lng], makeCircleStyle(color))
          .addTo(map)
          .bindTooltip(station.name, {
            permanent: false,
            direction: 'top',
            className: 'leaflet-tooltip-custom',
          })
        stationMarkersRef.current[station.id] = m
      }
    })

    // Remove markers for deleted stations
    Object.keys(stationMarkersRef.current).forEach((id) => {
      const isInFirestore = currentIds.has(id)
      if (!isInFirestore) {
        stationMarkersRef.current[id].remove()
        delete stationMarkersRef.current[id]
      }
    })
  }, [firestoreStations, mapReady])

  // ── 3. Render live shuttles ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    shuttles.forEach((shuttle: LiveShuttle) => {
      let cur: [number, number] = [shuttle.lat, shuttle.lng]
      if (shuttle.user_id === activeShuttle?.user_id && continuousRoute.length > 0) {
        cur = [continuousRoute[0].lat, continuousRoute[0].lng]
      }

      let bearing = lastShuttleBearingsRef.current[shuttle.user_id] ?? 0

      // Calculate bearing pointing to next route point
      if (shuttle.user_id === activeShuttle?.user_id && continuousRoute.length >= 2) {
        let lookaheadPt = continuousRoute[1]
        for (let i = 1; i < Math.min(15, continuousRoute.length); i++) {
          if (getDistance(cur, [continuousRoute[i].lat, continuousRoute[i].lng]) > 0.00005) {
            lookaheadPt = continuousRoute[i]
            break
          }
        }
        const nextPt: [number, number] = [lookaheadPt.lat, lookaheadPt.lng]
        const dist = getDistance(cur, nextPt)
        if (dist > 0.00001) {
          bearing = calcBearing(cur, nextPt)
          lastShuttleBearingsRef.current[shuttle.user_id] = bearing
        }
      } else {
        const prev = prevShuttlePos.current[shuttle.user_id]
        if (prev) {
          const dist = getDistance(prev, cur)
          if (dist > 0.00001) {
            bearing = calcBearing(prev, cur)
            lastShuttleBearingsRef.current[shuttle.user_id] = bearing
          }
        }
      }

      const popupContent = `
        <div style="font-family: inherit; padding: 4px; min-width: 160px; text-align: left;">
          <h4 style="margin: 0 0 6px 0; font-weight: 700; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">
            🚌 Shuttle: ${shuttle.plateNumber}
          </h4>
          <div style="font-size: 11px; line-height: 1.4;">
            <div><b>Driver:</b> ${shuttle.driverName}</div>
            <div><b>Status:</b> <span style="text-transform: capitalize; font-weight: 600; color: ${shuttle.status === 'on_trip' ? '#22c55e' : '#f59e0b'}">${shuttle.status}</span></div>
            <div style="margin-top: 4px; font-size: 10px; color: #888;"><b>Updated:</b> ${new Date(shuttle.updated_at).toLocaleTimeString()}</div>
          </div>
        </div>
      `

      if (shuttleMarkersRef.current[shuttle.user_id]) {
        const marker = shuttleMarkersRef.current[shuttle.user_id]
        marker.setLatLng(cur)
        marker.setIcon(createShuttleIcon(L, bearing, map.getZoom()))
        marker.bindPopup(popupContent)
      } else {
        const marker = L.marker(cur, {
          icon: createShuttleIcon(L, bearing, map.getZoom()),
        }).addTo(map)
          .bindTooltip(`Shuttle: ${shuttle.plateNumber}`, { permanent: false, direction: 'top' })
          .bindPopup(popupContent)
        shuttleMarkersRef.current[shuttle.user_id] = marker
      }
      prevShuttlePos.current[shuttle.user_id] = cur
    })

    // Remove stale shuttles
    Object.keys(shuttleMarkersRef.current).forEach((id) => {
      if (!shuttles.find((s) => s.user_id === id)) {
        shuttleMarkersRef.current[id].remove()
        delete shuttleMarkersRef.current[id]
        delete prevShuttlePos.current[id]
        delete lastShuttleBearingsRef.current[id]
      }
    })

    const handleZoom = () => {
      shuttles.forEach((shuttle: LiveShuttle) => {
        const marker = shuttleMarkersRef.current[shuttle.user_id]
        if (marker) {
          const bearing = lastShuttleBearingsRef.current[shuttle.user_id] ?? 0
          marker.setIcon(createShuttleIcon(L, bearing, map.getZoom()))
        }
      })
    }
    map.on('zoomend', handleZoom)

    return () => {
      map.off('zoomend', handleZoom)
    }
  }, [shuttles, mapReady, continuousRoute, activeShuttle])

  // ── 4. Fetch route from API when active request changes ───────────
  useEffect(() => {
    if (!activeRequest) {
      setContinuousRoute([])
      fullRouteRef.current = []
      setError('')
      return
    }

    let isMounted = true
    setRouteLoading(true)
    setError('')

    const fetchRoute = async () => {
      try {
        const res = await fetch('/api/calculate-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waypoints: [activeRequest.fromId, activeRequest.toId],
          }),
        })
        const data = await res.json()
        if (!isMounted) return

        if (data.success) {
          const pathWithCoords = data.pathWithCoords as { lat: number; lng: number }[]
          fullRouteRef.current = pathWithCoords
          
          if (activeShuttle) {
            const shuttlePt: [number, number] = [activeShuttle.lat, activeShuttle.lng]
            const routePoints = pathWithCoords.map((c) => [c.lat, c.lng] as [number, number])
            const remainingPts = getRemainingPath(shuttlePt, routePoints)
            setContinuousRoute(remainingPts.map((pt) => ({ lat: pt[0], lng: pt[1] })))
          } else {
            setContinuousRoute(pathWithCoords)
          }
        } else {
          setContinuousRoute([])
          fullRouteRef.current = []
          if (data.outOfBounds) {
            setError('outOfBounds')
          } else {
            setError(data.error || 'Unknown error')
          }
        }
      } catch (err: any) {
        if (!isMounted) return
        setContinuousRoute([])
        fullRouteRef.current = []
        setError(err.message || 'Unknown error')
      } finally {
        if (isMounted) {
          setRouteLoading(false)
        }
      }
    }

    fetchRoute()

    return () => {
      isMounted = false
    }
  }, [activeRequest])

  // Project shuttle onto the route when shuttle position changes
  useEffect(() => {
    if (fullRouteRef.current.length > 0 && activeShuttle) {
      const shuttlePt: [number, number] = [activeShuttle.lat, activeShuttle.lng]
      const routePoints = fullRouteRef.current.map((c) => [c.lat, c.lng] as [number, number])
      const remainingPts = getRemainingPath(shuttlePt, routePoints)
      setContinuousRoute(remainingPts.map((pt) => ({ lat: pt[0], lng: pt[1] })))
    }
  }, [activeShuttle?.lat, activeShuttle?.lng])

  // Stop handling and station marker coloring
  useEffect(() => {
    if (!activeShuttle) return

    const reachedStations = new Set<string>()
    activeRequests.forEach(req => {
      const coords = getStationCoords(req.fromId)
      if (coords) {
        const dist = getDistance([activeShuttle.lat, activeShuttle.lng], [coords.lat, coords.lng])
        if (dist < 0.00028) {
          reachedStations.add(req.fromId)
        }
      }
    })

    if (reachedStations.size > 0) {
      activeRequests.forEach(req => {
        if (reachedStations.has(req.fromId)) {
          update(ref(rtdb, `shuttle_requests/${req.id}`), { status: 'done' })
          console.log(`[ShuttleRouting] Served request ${req.id} at station ${req.fromId}`)
        }
      })
    }

    // Color stations dynamically
    Object.keys(stationMarkersRef.current).forEach(id => {
      const marker = stationMarkersRef.current[id]
      if (marker) {
        if (uniqueFromIds.includes(id)) {
          marker.setStyle(makeCircleStyle('#8b5cf6')) // Purple — on route
        } else {
          const fbStation = firestoreStations.find(s => s.id === id)
          const color = fbStation ? (fbStation.isActive ? '#3b82f6' : '#94a3b8') : '#3b82f6'
          marker.setStyle(makeCircleStyle(color))
        }
      }
    })
  }, [activeShuttle?.lat, activeShuttle?.lng, requests, getStationCoords, firestoreStations, uniqueFromIds])

  // ── 5. Draw dynamic/sliced continuousRoute on map ────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    polylineGroupRef.current.forEach(l => l.remove())
    polylineGroupRef.current = []

    if (continuousRoute.length < 2) return

    const latlngs = continuousRoute.map(p => [p.lat, p.lng] as [number, number])
    const poly = L.polyline(latlngs, {
      color: '#60a5fa', weight: 5, opacity: 0.9,
    }).addTo(map)
    polylineGroupRef.current.push(poly)


    // Green start marker at the first coordinate (shuttle current position)
    const startMarker = L.circleMarker(latlngs[0], {
      radius: 9,
      color: '#ffffff',
      fillColor: '#22c55e',
      fillOpacity: 1,
      weight: 3,
    })
    .addTo(map)
    .bindTooltip("Route Start", { permanent: false, direction: 'top' })
    startMarker.bringToFront()
    polylineGroupRef.current.push(startMarker)

    // Red end marker at the last coordinate (destination)
    const endMarker = L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 9,
      color: '#ffffff',
      fillColor: '#ef4444',
      fillOpacity: 1,
      weight: 3,
    })
    .addTo(map)
    .bindTooltip("Route End", { permanent: false, direction: 'top' })
    endMarker.bringToFront()
    polylineGroupRef.current.push(endMarker)

    map.fitBounds(poly.getBounds(), { padding: [60, 60] })
  }, [continuousRoute, mapReady])

  // ── 6. Auto-select active/pending request on load ───────────
  useEffect(() => {
    if (hasAutoSelected.current || requests.length === 0 || !mapReady) return
    const pick =
      requests.find(r => r.status === 'active') ??
      requests.find(r => r.status === 'pending') ??
      requests[0]
    if (pick) {
      hasAutoSelected.current = true
      setActiveRequest(pick)
    }
  }, [requests, mapReady])

  return (
    <div className="h-screen w-full relative overflow-hidden">
      <style>{`
        .leaflet-tooltip-custom {
          background-color: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: var(--radius) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          padding: 4px 8px !important;
        }
      `}
      </style>

      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] w-96 max-w-[90vw] pointer-events-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-right font-medium">
              {error === 'outOfBounds'
                ? 'المسار يخرج من حدود الجامعة — يرجى مراجعة البيانات'
                : `تعذّر حساب المسار: ${error}`}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {routeLoading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm shadow-lg border border-border px-4 py-2 rounded-xl pointer-events-auto flex items-center gap-2 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs font-semibold text-foreground">جاري حساب المسار...</span>
        </div>
      )}

      {/* TOP-LEFT STATS CARD */}
      <Card className="absolute top-4 left-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 w-64 pointer-events-auto">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Shuttle Tracker</span>
          </div>
          <div className="flex items-center gap-1.5">
            {routeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-none">
                  Live
                </Badge>
              </>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 text-right">Assiut University</p>
        <div className="text-xs font-medium">
          {shuttles.length > 0 ? (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">
              Shuttle online 🚌
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1 justify-end">
              No shuttle 🚌
            </span>
          )}
        </div>
      </Card>

      {/* TOP-RIGHT ACTIVE ROUTE CARD */}
      {activeShuttle && (
        <Card className="absolute top-4 right-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 min-w-[220px] max-w-[300px] pointer-events-auto text-right">
          <p className="text-[11px] text-muted-foreground mb-2">Smart Shuttle Route</p>
          <div className="space-y-1.5 mb-2.5">
            <div className="flex items-center gap-2 justify-end text-xs font-semibold">
              <span>Status: <span className="text-green-600 dark:text-green-400 capitalize">{activeShuttle.status}</span></span>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {stopCount > 0 ? `Serving ${stopCount} stations dynamically` : 'No active requests, patrolling campus'}
            </div>
          </div>

          {continuousRoute.length > 0 && (
            <div className="border-t border-border/60 pt-2 flex flex-row-reverse justify-between text-[11px] text-muted-foreground gap-2">
              <span>📏 {routeCost} m</span>
              <span>🟣 {stopCount} stops</span>
              <span>⏱️ {estMinutes} min</span>
            </div>
          )}
        </Card>
      )}

      {/* custom zoom control */}
      {mapReady && (
        <div className="absolute top-20 right-4 z-[1000]">
          <div className="flex flex-col rounded-xl overflow-hidden shadow-lg border border-border">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="w-10 h-10 bg-card hover:bg-muted flex items-center justify-center text-foreground transition-colors border-b border-border"
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="w-10 h-10 bg-card hover:bg-muted flex items-center justify-center text-foreground transition-colors"
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM-RIGHT FLOATING REQUESTS LIST */}
      <Card className="absolute bottom-6 right-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border w-72 max-h-[250px] flex flex-col pointer-events-auto">
        <div className="p-2.5 border-b border-border/60 flex items-center justify-between text-xs font-semibold text-foreground">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {requests.length}
          </Badge>
          <span className="text-right">User Requests</span>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {requests.length === 0 && !reqLoading && (
            <p className="text-xs text-muted-foreground text-center py-6">No requests yet</p>
          )}
          {requests.map(req => {
            const isActive = req.id === activeRequest?.id
            return (
              <button
                key={req.id}
                onClick={() => setActiveRequest(req)}
                className={[
                  'w-full text-right p-2 rounded-md transition-colors text-xs flex items-center gap-2 justify-between border',
                  isActive
                    ? 'bg-primary/10 border-primary/30'
                    : 'hover:bg-muted/50 border-transparent',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={[
                      'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                      req.status === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                      req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                      'bg-muted text-muted-foreground border-transparent',
                    ].join(' ')}
                  >
                    {req.status === 'active' ? 'Active' : req.status === 'pending' ? 'Pending' : 'Done'}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{timeAgo(req.createdAt)}</span>
                </div>
                <span className="font-medium text-foreground truncate max-w-[150px]">
                  {stationName(req.fromId, firestoreStations)} ← {stationName(req.toId, firestoreStations)}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* BOTTOM-LEFT LEGEND CARD */}
      <Card className="absolute bottom-6 left-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 pointer-events-auto">
        <div className="space-y-1.5">
          {[
            { color: '#3b82f6', label: 'Station' },
            { color: '#94a3b8', label: 'Inactive' },
            { color: '#22c55e', label: 'Start' },
            { color: '#ef4444', label: 'End' },
            { color: '#8b5cf6', label: 'On route' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center justify-end gap-2 text-[11px] text-foreground">
              <span>{label}</span>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 text-[11px] text-foreground">
            <span>Shuttle</span>
            <span className="text-red-500 text-xs font-bold leading-none shrink-0">▲</span>
          </div>
        </div>
      </Card>

      {/* LOADING OVERLAY */}
      {!mapReady && (
        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center gap-3 z-[2000]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      )}

      {/* Leaflet map container */}
      <div ref={mapDivRef} className="w-full h-full" />
    </div>
  )
}
