'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { STATIONS, getOptimalRoute, buildCampusRoute, buildGraph } from '@/lib/university-graph'
import { useShuttleRequests, type ShuttleRequest } from '@/hooks/useShuttleRequests'
import { useLiveShuttles, type LiveShuttle } from '@/hooks/useLiveShuttles'
import { useFirebaseStations } from '@/hooks/useFirebaseStations'
import { useTrips, createTrip, updateTripStatus, type TripStop } from '@/hooks/useTrips'
import { rtdb } from '@/lib/firebase'
import { createShuttleIcon } from '@/lib/leaflet-icons'
import { ref, update } from 'firebase/database'
import { useNearestStations } from '@/hooks/useNearestStations'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Bus, Navigation, MapPin, Users, ChevronRight,
  Loader2, AlertCircle, Route, Plus, Minus,
} from 'lucide-react'

// ─── pure helpers ────────────────────────────────────────────────

interface RouteStopInfo {
  stationId: string
  stationName: string
  type: 'pickup' | 'dropoff' | 'waypoint'
  passengers: number
  order: number
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

function calcBearing(from: [number, number], to: [number, number]): number {
  const dLng = ((to[1] - from[1]) * Math.PI) / 180
  const lat1 = (from[0] * Math.PI) / 180
  const lat2 = (to[0] * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}



function makeCircleStyle(color: string) {
  return { radius: 7, color, fillColor: color, fillOpacity: 1, weight: 2.5 }
}

const ENGINEERING_LOCATION = {
  lat: 27.18760,
  lng: 31.17228,
  zoom: 15,
}

// ─── component ──────────────────────────────────────────────────

export default function AdminMapClient() {
  // map state
  const [mapReady, setMapReady]         = useState(false)
  const [error, setError]               = useState('')
  const [activeRequest, setActiveRequest] = useState<ShuttleRequest | null>(null)
  const [continuousRoute, setContinuousRoute] = useState<{ lat: number; lng: number }[]>([])
  const [routeStops, setRouteStops]     = useState<RouteStopInfo[]>([])
  const [isMounted, setIsMounted]       = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // refs
  const mapDivRef        = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<any>(null)
  const stationMarkersRef = useRef<Record<string, any>>({})
  const shuttleMarkersRef = useRef<Record<string, any>>({})
  const prevShuttlePos   = useRef<Record<string, [number, number]>>({})
  const polylineGroupRef = useRef<any[]>([])
  const shuttleRoutePolylineRef = useRef<any>(null)
  const hasAutoSelected  = useRef(false)
  const lastShuttleBearingsRef = useRef<Record<string, number>>({})
  const tripCreatedForRef = useRef<Set<string>>(new Set())

  const { requests, loading: reqLoading } = useShuttleRequests()
  const { shuttles } = useLiveShuttles()
  const { stations: firestoreStations } = useFirebaseStations()

  // Rebuild routing graph dynamically whenever stations collection changes
  useEffect(() => {
    buildGraph(firestoreStations)
  }, [firestoreStations])

  const { trips } = useTrips()

  const getStationName = useCallback((id: string): string => {
    const local = STATIONS.find(s => s.id === id)
    if (local) return local.name
    const fb = firestoreStations.find(s => s.id === id)
    if (fb) return fb.name
    return id
  }, [firestoreStations])

  const getStationCoords = useCallback((id: string): { lat: number; lng: number } | null => {
    const local = STATIONS.find(s => s.id === id)
    if (local) return { lat: local.lat, lng: local.lng }
    const fb = firestoreStations.find(s => s.id === id)
    if (fb && fb.lat !== 0) return { lat: fb.lat, lng: fb.lng }
    return null
  }, [firestoreStations])

  // Active shuttle
  const activeShuttle = shuttles[0] ?? null
  const {
    nearestStations,
    routeData,
    routeLoading,
    routeError,
    loading: nearestLoading
  } = useNearestStations({
    shuttleLat: activeShuttle?.lat ?? 0,
    shuttleLng: activeShuttle?.lng ?? 0,
    topN: 5,
    enabled: !!activeShuttle,
  })

  const activeCount  = shuttles.length
  const activeRoutes = requests.filter(r => r.status === 'active').length
  const pendingCount = requests.filter(r => r.status === 'pending').length

  // ── Calculate dynamic multi-stop continuous route ───────────
  useEffect(() => {
    if (!activeShuttle) {
      setContinuousRoute([])
      return
    }

    // ── Trip completion handling: when active shuttle reaches a dropoff station of an in-progress trip ──
    const inProgressTrips = trips.filter(t => t.shuttleId === activeShuttle.user_id && t.status === 'in-progress')
    inProgressTrips.forEach(trip => {
      const dropoffs = trip.stops.filter(s => s.type === 'dropoff')
      let reachedDropoff = false
      for (const stop of dropoffs) {
        const coords = getStationCoords(stop.stationId)
        if (coords) {
          const dist = getDistance([activeShuttle.lat, activeShuttle.lng], [coords.lat, coords.lng])
          if (dist < 0.00028) {
            reachedDropoff = true
            break
          }
        }
      }

      if (reachedDropoff) {
        console.log(`[TripCompletion] Shuttle reached dropoff. Marking trip ${trip.id} as completed.`)
        updateTripStatus(trip.id, 'completed').catch(err => {
          console.error('[TripCompletion] Failed to complete trip:', err)
        })
      }
    })

    const activeRequests = requests.filter(r => r.status === 'pending' || r.status === 'active')
    const uniqueFromIds = Array.from(new Set(activeRequests.map(r => r.fromId).filter(Boolean))) as string[]

    // Stop handling: mark reached requested stations as done
    const reachedStations = new Set<string>()
    activeRequests.forEach(req => {
      const coords = getStationCoords(req.fromId)
      if (coords) {
        const dist = getDistance([activeShuttle.lat, activeShuttle.lng], [coords.lat, coords.lng])
        // Serving range: ~25-30 meters
        if (dist < 0.00028) {
          reachedStations.add(req.fromId)
        }
      }
    })

    if (reachedStations.size > 0) {
      const servedRequests: ShuttleRequest[] = []
      activeRequests.forEach(req => {
        if (reachedStations.has(req.fromId)) {
          update(ref(rtdb, `shuttle_requests/${req.id}`), { status: 'done' })
          console.log(`[ShuttleRouting] Served request ${req.id} at station ${req.fromId}`)
          servedRequests.push(req)
        }
      })

      // Auto-create trip in Firestore for served requests
      if (servedRequests.length > 0 && activeShuttle) {
        const tripKey = servedRequests.map(r => r.id).sort().join('_')
        if (!tripCreatedForRef.current.has(tripKey)) {
          tripCreatedForRef.current.add(tripKey)
          const stops: TripStop[] = []
          const pickupIds = new Set(servedRequests.map(r => r.fromId))
          const dropoffIds = new Set(servedRequests.map(r => r.toId))
          pickupIds.forEach(id => {
            stops.push({
              stationId: id,
              stationName: getStationName(id),
              type: 'pickup',
              passengers: servedRequests.filter(r => r.fromId === id).length,
            })
          })
          dropoffIds.forEach(id => {
            stops.push({
              stationId: id,
              stationName: getStationName(id),
              type: 'dropoff',
              passengers: servedRequests.filter(r => r.toId === id).length,
            })
          })
          createTrip({
            shuttleId: activeShuttle.user_id,
            plateNumber: activeShuttle.plateNumber,
            driverName: activeShuttle.driverName,
            stops,
            totalPassengers: servedRequests.length,
          }).catch(err => console.error('[TripCreation] Failed:', err))
        }
      }
    }

    if (uniqueFromIds.length === 0) {
      setContinuousRoute([])
      setRouteStops([])
      // Reset station marker colors
      Object.keys(stationMarkersRef.current).forEach(id => {
        const marker = stationMarkersRef.current[id]
        if (marker) {
          const fbStation = firestoreStations.find(s => s.id === id)
          const color = fbStation ? (fbStation.isActive ? '#3b82f6' : '#94a3b8') : '#3b82f6'
          marker.setStyle(makeCircleStyle(color))
        }
      })
      return
    }

    // Step 1: Find optimal sequence of graph nodes using prioritized Dijkstra
    const optimalNodeIds = getOptimalRoute(activeShuttle.lat, activeShuttle.lng, uniqueFromIds)
    if (optimalNodeIds.length === 0) {
      setContinuousRoute([])
      return
    }

    // Step 2: Map to coordinates using detailed exact road geometry
    const shuttlePt: [number, number] = [activeShuttle.lat, activeShuttle.lng]

    // Route strictly on internal campus roads via graph waypoints (never OSRM/public roads)
    try {
      const { pathWithCoords } = buildCampusRoute(optimalNodeIds)
      const routePoints = pathWithCoords.map((c) => [c.lat, c.lng] as [number, number])
      const remainingPts = getRemainingPath(shuttlePt, routePoints)

      console.log(`[ShuttleRouting] Internal campus route: ${remainingPts.length} coords rendered`)
      setContinuousRoute(remainingPts.map((pt) => ({ lat: pt[0], lng: pt[1] })))
    } catch (err) {
      console.error('[ShuttleRouting] Failed to build internal campus route:', err)
      setContinuousRoute([])
    }

    // Step 3: Color stations dynamically (purple for requested, blue for others)
    Object.keys(stationMarkersRef.current).forEach(id => {
      const marker = stationMarkersRef.current[id]
      if (marker) {
        if (uniqueFromIds.includes(id)) {
          marker.setStyle(makeCircleStyle('#8b5cf6')) // Purple
        } else {
          const fbStation = firestoreStations.find(s => s.id === id)
          const color = fbStation ? (fbStation.isActive ? '#3b82f6' : '#94a3b8') : '#3b82f6'
          marker.setStyle(makeCircleStyle(color))
        }
      }
    })

    // Step 4: Build route stops info for the details panel
    const stopsInfo: RouteStopInfo[] = []
    let order = 1
    for (const nodeId of optimalNodeIds) {
      const isHelper = ['guest_house', 'roundabout', 'surgery', 'hospital'].includes(nodeId)
      if (isHelper) continue

      const pickupCount = activeRequests.filter(r => r.fromId === nodeId).length
      const dropoffCount = activeRequests.filter(r => r.toId === nodeId).length

      if (pickupCount > 0) {
        stopsInfo.push({
          stationId: nodeId,
          stationName: getStationName(nodeId),
          type: 'pickup',
          passengers: pickupCount,
          order: order++,
        })
      }
      if (dropoffCount > 0) {
        stopsInfo.push({
          stationId: nodeId,
          stationName: getStationName(nodeId),
          type: 'dropoff',
          passengers: dropoffCount,
          order: order++,
        })
      }
    }
    setRouteStops(stopsInfo)

  }, [activeShuttle?.lat, activeShuttle?.lng, requests, getStationCoords, firestoreStations, getStationName, trips])

  // ── 1. load Leaflet CDN ─────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('leaflet-css')) {
      if ((window as any).L) {
        setMapReady(true)
      } else {
        const check = setInterval(() => {
          if ((window as any).L) {
            setMapReady(true)
            clearInterval(check)
          }
        }, 100)
        return () => clearInterval(check)
      }
      return
    }
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

  // ── 2. init map + station markers ───────────────────────────
  useEffect(() => {
    if (!mapReady || !mapDivRef.current || mapRef.current) return
    const L = (window as any).L

    const map = L.map(mapDivRef.current, { zoomControl: false })
      .setView([27.18, 31.1735], 16)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map


    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [mapReady])

  // ── 2b. Sync station markers from Firestore (realtime) ──────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    const currentIds = new Set(firestoreStations.map(s => s.id))

    firestoreStations.forEach((station) => {
      if (station.lat === 0 && station.lng === 0) return
      const color = station.isActive ? '#3b82f6' : '#94a3b8'

      if (stationMarkersRef.current[station.id]) {
        const marker = stationMarkersRef.current[station.id]
        marker.setLatLng([station.lat, station.lng])
        marker.setStyle(makeCircleStyle(color))
        marker.unbindTooltip()
        marker.bindTooltip(station.name, { permanent: false, direction: 'top' })
      } else {
        const m = L.circleMarker([station.lat, station.lng], makeCircleStyle(color))
          .addTo(map)
          .bindTooltip(station.name, { permanent: false, direction: 'top' })
        stationMarkersRef.current[station.id] = m
      }
    })

    // Remove markers for deleted Firestore stations
    Object.keys(stationMarkersRef.current).forEach((id) => {
      const isInFirestore = currentIds.has(id)
      if (!isInFirestore) {
        stationMarkersRef.current[id].remove()
        delete stationMarkersRef.current[id]
      }
    })
  }, [firestoreStations, mapReady])

  // ── 3. update shuttle triangle markers ──────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L   = (window as any).L
    const map = mapRef.current

    shuttles.forEach((shuttle: LiveShuttle) => {
      let cur: [number, number] = [shuttle.lat, shuttle.lng]

      // Snap active shuttle exactly on the road/route line
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
        const m = L.marker(cur, { icon: createShuttleIcon(L, bearing, map.getZoom()) })
          .addTo(map)
          .bindTooltip(`Shuttle: ${shuttle.plateNumber}`, { direction: 'top' })
          .bindPopup(popupContent)
        shuttleMarkersRef.current[shuttle.user_id] = m
      }
      prevShuttlePos.current[shuttle.user_id] = cur
    })

    Object.keys(shuttleMarkersRef.current).forEach(id => {
      if (!shuttles.find((s: LiveShuttle) => s.user_id === id)) {
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

  // ── 4. Map Helpers for Shuttle Route Polyline ──────────────────
  const clearShuttleRoute = useCallback(() => {
    if (shuttleRoutePolylineRef.current) {
      console.log('[Leaflet] Clearing previous shuttle route polyline')
      shuttleRoutePolylineRef.current.remove()
      shuttleRoutePolylineRef.current = null
    }
  }, [])

  const drawShuttleRoute = useCallback((L: any, map: any, points: [number, number][]) => {
    clearShuttleRoute()
    const validPoints = points.filter(p => p && typeof p[0] === 'number' && typeof p[1] === 'number' && p[0] !== 0)
    if (validPoints.length < 2) {
      console.log('[Leaflet] Not enough points to draw shuttle route', validPoints.length)
      return
    }

    console.log('[Leaflet] Drawing shuttle route polyline. Points count:', validPoints.length)
    const poly = L.polyline(validPoints, {
      color: '#ef4444',
      weight: 5,
      opacity: 0.9,
    }).addTo(map)

    shuttleRoutePolylineRef.current = poly
    map.fitBounds(poly.getBounds(), { padding: [60, 60] })
  }, [clearShuttleRoute])

  // ── 5. Draw dynamic/sliced displayedRoute on map ────────────────
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

  // ── 7. handle request select ─────────────────────────────────
  function handleSelect(req: ShuttleRequest) {
    setActiveRequest(req)
  }

  // ── 8. auto-select on load ───────────────────────────────────
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

  // ── 9. map navigation controls ───────────────────────────────
  const goToEngineering = useCallback(() => {
    if (!mapRef.current) return
    mapRef.current.flyTo(
      [ENGINEERING_LOCATION.lat, ENGINEERING_LOCATION.lng],
      ENGINEERING_LOCATION.zoom,
      { animate: true, duration: 2 },
    )
  }, [])

  const followShuttle = useCallback(() => {
    if (!mapRef.current || shuttles.length === 0) return
    const activeShuttleInstance = shuttles[0]
    mapRef.current.flyTo([activeShuttleInstance.lat, activeShuttleInstance.lng], 18, {
      animate: true,
      duration: 1.5,
    })
  }, [shuttles])

  // ─── render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-row h-screen overflow-hidden">

      {/* ════ SIDEBAR ════ */}
      <div className="w-[300px] shrink-0 bg-card border-r border-border flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-0.5">
            <Bus className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Shuttle Tracker</span>
          </div>
          <p className="text-xs text-muted-foreground text-right">Assiut University</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Bus className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
            <div className="text-lg font-bold text-foreground leading-none">{activeCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Shuttles</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Route className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-lg font-bold text-foreground leading-none">{activeRoutes}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Active</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <div className="text-lg font-bold text-foreground leading-none">{pendingCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Pending</div>
          </div>
        </div>

        {/* Selected request panel + Route Stops */}
        {activeRequest && (
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Selected Request Details
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-xs text-foreground font-medium truncate">
                  From: {getStationName(activeRequest.fromId)}
                </span>
              </div>
              <div className="ml-1 text-muted-foreground text-xs">│</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-xs text-foreground font-medium truncate">
                  To: {getStationName(activeRequest.toId)}
                </span>
              </div>
            </div>

            {/* Route Stops — Pickup & Drop-off */}
            {routeStops.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Route Stops
                </p>
                {routeStops.map((stop, idx) => (
                  <div key={`${stop.stationId}-${stop.type}-${idx}`}
                    className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {stop.order}
                    </span>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: stop.type === 'pickup' ? '#22c55e' : '#ef4444' }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-foreground font-medium truncate block">
                        {stop.stationName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4"
                        style={{
                          background: stop.type === 'pickup' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: stop.type === 'pickup' ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {stop.type === 'pickup' ? 'Pickup' : 'Drop-off'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />
                        {stop.passengers}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <Alert className="py-1.5 px-2 border-destructive/40 bg-destructive/10">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <AlertDescription className="text-xs ml-1">{error}</AlertDescription>
              </Alert>
            )}

            {routeError && (
              <Alert className="py-1.5 px-2 border-amber-500/40 bg-amber-500/10">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                <AlertDescription className="text-xs ml-1">Route function: {routeError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Nearest Stations */}
        {(nearestStations.length > 0 || nearestLoading) && (
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 text-orange-500" />
                Nearest Stations
                {nearestLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {nearestStations.length}
              </Badge>
            </div>

            {nearestStations.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-muted/50 rounded-lg px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                  <span className="text-xs text-foreground truncate">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {s.pendingRequests > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-yellow-500/20 text-yellow-600">
                      {s.pendingRequests} req
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {s.distance_meters < 1000
                      ? `${s.distance_meters}m`
                      : `${s.distance_km}km`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Requests list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
              User Requests
              {reqLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {requests.length}
            </Badge>
          </div>

          {requests.length === 0 && !reqLoading && (
            <div className="flex items-center justify-center py-10">
              <p className="text-xs text-muted-foreground">No requests yet</p>
            </div>
          )}

          {requests.map(req => {
            const isActive = req.id === activeRequest?.id
            return (
              <button
                key={req.id}
                onClick={() => handleSelect(req)}
                className={[
                  'w-full text-right p-3 rounded-lg transition-colors flex items-center gap-2',
                  isActive
                    ? 'bg-primary/10 border border-primary/40'
                    : 'hover:bg-muted/70 border border-transparent',
                ].join(' ')}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs text-foreground font-medium truncate">
                      {getStationName(req.fromId)}
                    </span>
                    <MapPin className="h-3 w-3 text-green-500 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs text-foreground font-medium truncate">
                      {getStationName(req.toId)}
                    </span>
                    <Navigation className="h-3 w-3 text-red-500 flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-0.5">
                    <div style={{ fontSize:10, color:'hsl(var(--muted-foreground))' }}>
                      {isMounted ? timeAgo(req.createdAt) : ''} · {req.userId.slice(0, 8)}…
                    </div>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span
                      className={[
                        'text-[10px] font-medium',
                        req.status === 'active'  ? 'text-green-500' :
                        req.status === 'pending' ? 'text-yellow-500' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {req.status === 'active' ? 'Active' : req.status === 'pending' ? 'Pending' : 'Done'}
                    </span>
                    <span
                      className={[
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        req.status === 'active'  ? 'bg-green-500' :
                        req.status === 'pending' ? 'bg-yellow-500' : 'bg-muted-foreground',
                      ].join(' ')}
                    />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            )
          })}
        </div>
      </div>

      {/* ════ MAP ════ */}
      <div className="flex-1 relative">

        {/* floating info card */}
        {continuousRoute.length > 0 && activeShuttle && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <Card className="bg-card/95 backdrop-blur-sm shadow-lg border-border">
              <CardContent className="px-4 py-2">
                <p className="text-xs font-semibold text-foreground text-center">
                  Smart Shuttle Continuous Route
                </p>
                <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                  Serving all active requested stops turn-by-turn
                </p>
              </CardContent>
            </Card>
          </div>
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

        {/* legend */}
        <div className="absolute bottom-6 left-4 z-[1000]">
          <Card className="bg-card/95 backdrop-blur-sm shadow-lg border-border">
            <CardContent className="px-3 py-2.5 space-y-1.5">
              {[
                { color: '#3b82f6', label: 'Normal Station' },
                { color: '#8b5cf6', label: 'Requested Station' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2 text-[11px] text-foreground">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  {label}
                </div>
              ))}
              <div className="flex items-center gap-2 text-[11px] text-foreground">
                <span className="text-red-500 text-xs leading-none">▲</span>
                Shuttle
              </div>
            </CardContent>
          </Card>
        </div>

        {/* loading overlay */}
        {!mapReady && (
          <div className="absolute inset-0 bg-background flex flex-col items-center justify-center gap-3 z-50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}

        {/* floating map controls */}
        <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-2">
          {/* Follow Shuttle Button */}
          <button
            onClick={followShuttle}
            className="w-12 h-12 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg transition-all border border-green-500/20 hover:scale-105 active:scale-95"
            title="Follow Shuttle"
          >
            <Bus className="h-6 w-6" />
          </button>

          {/* Go to Engineering Button */}
          <button
            onClick={goToEngineering}
            className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 text-slate-700 rounded-full shadow-lg transition-all border border-slate-200 hover:scale-105 active:scale-95"
            title="Go to Engineering Faculty"
          >
            <MapPin className="h-6 w-6" />
          </button>
        </div>

        <div ref={mapDivRef} className="w-full h-full" />
      </div>
    </div>
  )
}
