'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { STATIONS } from '@/lib/university-graph'
import { useShuttleRequests, type ShuttleRequest } from '@/hooks/useShuttleRequests'
import { useLiveShuttles, type LiveShuttle } from '@/hooks/useLiveShuttles'
import { useDynamicRouting } from '@/hooks/useDynamicRouting'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Bus, Navigation, MapPin, Users, ChevronRight,
  Loader2, ArrowLeft, ArrowDown, Plus, Minus, CheckCircle2,
} from 'lucide-react'

function stationName(id: string): string {
  return STATIONS.find(s => s.id === id)?.name ?? id
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return s <= 5 ? 'just now' : `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function getDistance(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0]
  const dy = p1[1] - p2[1]
  return Math.sqrt(dx * dx + dy * dy)
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

const makeTriangleIcon = (L: any, bearing: number) => {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:0;height:0;
      border-left:10px solid transparent;
      border-right:10px solid transparent;
      border-bottom:26px solid #ef4444;
      filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));
      transform:rotate(${bearing}deg);
      transform-origin:center 17px;
    "></div>`,
    iconSize: [20, 26],
    iconAnchor: [10, 13],
  })
}

function makeCircleStyle(color: string) {
  return { radius: 7, color, fillColor: color, fillOpacity: 1, weight: 2.5 }
}

const inCampus = (lat: number, lng: number) => {
  return lat >= 27.183 && lat <= 27.193 && lng >= 31.165 && lng <= 31.180
}

export default function MapClient() {
  const [mapReady, setMapReady] = useState(false)
  const [activeRequest, setActiveRequest] = useState<ShuttleRequest | null>(null)

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const stationMarkersRef = useRef<Record<string, any>>({})
  const shuttleMarkersRef = useRef<Record<string, any>>({})
  const prevShuttlePos = useRef<Record<string, any>>({})
  const polylineGroupRef = useRef<any[]>([])
  const hasAutoSelected = useRef(false)
  const lastShuttleBearingsRef = useRef<Record<string, number>>({})
  const { requests, loading: reqLoading } = useShuttleRequests()
  const { shuttles } = useLiveShuttles()
  const {
    stopQueue,
    currentStop,
    routePath,
    distanceToCurrentStop,
    completedStopIds,
    isRouteLoading,
  } = useDynamicRouting()

  const activeShuttle = shuttles[0] ?? null
  const requestedStationIds = new Set(stopQueue.map(s => s.stationId))

  let totalDistance = 0
  for (let i = 0; i < routePath.length - 1; i++) {
    totalDistance += getDistance(
      [routePath[i].lat, routePath[i].lng],
      [routePath[i + 1].lat, routePath[i + 1].lng]
    )
  }
  const routeCost = Math.round(totalDistance * 111000)
  const estMinutes = Math.max(1, Math.round(routeCost / 60))

  useEffect(() => {
    const marker = stationMarkersRef
    STATIONS.forEach(s => {
      const m = marker.current[s.id]
      if (!m) return
      if (requestedStationIds.has(s.id)) {
        m.setStyle(makeCircleStyle('#8b5cf6'))
      } else if (completedStopIds.includes(s.id)) {
        m.setStyle(makeCircleStyle('#22c55e'))
      } else {
        m.setStyle(makeCircleStyle('#3b82f6'))
      }
    })
  }, [requestedStationIds, completedStopIds])

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

    STATIONS.forEach(station => {
      if (['guest_house', 'roundabout', 'surgery', 'hospital'].includes(station.id)) return

      const m = L.circleMarker([station.lat, station.lng], makeCircleStyle('#3b82f6'))
        .addTo(mapRef.current)
        .bindTooltip(station.name, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-tooltip-custom',
        })
      stationMarkersRef.current[station.id] = m
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [mapReady])

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    shuttles.forEach((shuttle: LiveShuttle) => {
      if (!inCampus(shuttle.lat, shuttle.lng)) return

      let cur: [number, number] = [shuttle.lat, shuttle.lng]
      if (shuttle.user_id === activeShuttle?.user_id && routePath.length > 0) {
        cur = [routePath[0].lat, routePath[0].lng]
      }

      let bearing = lastShuttleBearingsRef.current[shuttle.user_id] ?? 0

      if (shuttle.user_id === activeShuttle?.user_id && routePath.length >= 2) {
        let nearestIdx = 0
        let minDist = Infinity
        for (let i = 0; i < routePath.length; i++) {
          const d = getDistance([shuttle.lat, shuttle.lng], [routePath[i].lat, routePath[i].lng])
          if (d < minDist) { minDist = d; nearestIdx = i }
        }
        const segIdx = nearestIdx >= routePath.length - 1 ? nearestIdx - 1 : nearestIdx
        const segStart: [number, number] = [routePath[segIdx].lat, routePath[segIdx].lng]
        const segEnd: [number, number] = [routePath[segIdx + 1].lat, routePath[segIdx + 1].lng]
        const targetBearing = calcBearing(segStart, segEnd)
        let diff = targetBearing - bearing
        while (diff > 180) diff -= 360
        while (diff < -180) diff += 360
        bearing += diff * 0.3
        lastShuttleBearingsRef.current[shuttle.user_id] = bearing
        console.log(`[SHUTTLE]\nsegmentStart=${segStart[0].toFixed(6)},${segStart[1].toFixed(6)}\nsegmentEnd=${segEnd[0].toFixed(6)},${segEnd[1].toFixed(6)}\nbearing=${Math.round(targetBearing)}\nrotation=${Math.round(bearing)}`)
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

      console.log(`[SHUTTLE] markerRotation=${Math.round(bearing)}`)
      if (shuttleMarkersRef.current[shuttle.user_id]) {
        const marker = shuttleMarkersRef.current[shuttle.user_id]
        marker.setLatLng(cur)
        marker.setIcon(makeTriangleIcon(L, bearing))
        marker.bindPopup(popupContent)
      } else {
        const marker = L.marker(cur, {
          icon: makeTriangleIcon(L, bearing),
        }).addTo(map)
          .bindTooltip(`Shuttle: ${shuttle.plateNumber}`, { permanent: false, direction: 'top' })
          .bindPopup(popupContent)
        shuttleMarkersRef.current[shuttle.user_id] = marker
      }
      prevShuttlePos.current[shuttle.user_id] = cur
    })

    Object.keys(shuttleMarkersRef.current).forEach((id) => {
      if (!shuttles.find((s) => s.user_id === id)) {
        shuttleMarkersRef.current[id].remove()
        delete shuttleMarkersRef.current[id]
        delete prevShuttlePos.current[id]
        delete lastShuttleBearingsRef.current[id]
      }
    })
  }, [shuttles, mapReady, routePath, activeShuttle])

  useEffect(() => {
    console.log(`[MAP] redDebugLinesFound=0`)
    console.log(`[POLYLINE] length=${routePath.length}`)
    if (!mapRef.current || !mapReady) {
      console.log(`[POLYLINE] skipped — no map or not ready`)
      return
    }
    const L = (window as any).L
    const map = mapRef.current

    polylineGroupRef.current.forEach(l => l.remove())
    polylineGroupRef.current = []

    if (routePath.length < 2) {
      console.log(`[POLYLINE] rendered=false (length ${routePath.length} < 2)`)
      return
    }

    if (routePath.length > 0) {
      console.log(`[POLYLINE] first=${routePath[0].lat.toFixed(6)},${routePath[0].lng.toFixed(6)} last=${routePath[routePath.length - 1].lat.toFixed(6)},${routePath[routePath.length - 1].lng.toFixed(6)}`)
    }

    const latlngs = routePath.map(p => [p.lat, p.lng] as [number, number])
    const poly = L.polyline(latlngs, {
      color: '#60a5fa', weight: 5, opacity: 0.9,
    }).addTo(map)
    polylineGroupRef.current.push(poly)

    const startMarker = L.circleMarker(latlngs[0], {
      radius: 9,
      color: '#ffffff',
      fillColor: '#22c55e',
      fillOpacity: 1,
      weight: 3,
    })
    .addTo(map)
    .bindTooltip('Route Start', { permanent: false, direction: 'top' })
    startMarker.bringToFront()
    polylineGroupRef.current.push(startMarker)

    const endMarker = L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 9,
      color: '#ffffff',
      fillColor: '#ef4444',
      fillOpacity: 1,
      weight: 3,
    })
    .addTo(map)
    .bindTooltip('Route End', { permanent: false, direction: 'top' })
    endMarker.bringToFront()
    polylineGroupRef.current.push(endMarker)

    map.fitBounds(poly.getBounds(), { padding: [60, 60] })
    console.log(`[POLYLINE] rendered=true points=${latlngs.length} format=[lat,lng]`)
  }, [routePath, mapReady])

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
      `}</style>

      <Card className="absolute top-4 left-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 w-64 pointer-events-auto">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Shuttle Tracker</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-none">
              Live
            </Badge>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 text-right">Assiut University</p>
        <div className="text-xs font-medium">
          {shuttles.length > 0 ? (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">
              Shuttle online
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1 justify-end">
              No shuttle
            </span>
          )}
        </div>
      </Card>

      {activeShuttle && (
        <Card className="absolute top-4 right-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 min-w-[220px] max-w-[300px] pointer-events-auto text-right">
          <p className="text-[11px] text-muted-foreground mb-2">
            {currentStop ? `Routing to: ${currentStop.stationName}` : 'Smart Shuttle Route'}
          </p>
          <div className="space-y-1.5 mb-2.5">
            <div className="flex items-center gap-2 justify-end text-xs font-semibold">
              <span>Status: <span className="text-green-600 dark:text-green-400 capitalize">{activeShuttle.status}</span></span>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {stopQueue.length > 0
                ? `${stopQueue.length} stop${stopQueue.length !== 1 ? 's' : ''} in queue`
                : 'No active requests, patrolling campus'}
            </div>
          </div>

          {routePath.length > 0 && (
            <div className="border-t border-border/60 pt-2 flex flex-row-reverse justify-between text-[11px] text-muted-foreground gap-2">
              <span>{routeCost} m</span>
              <span>{stopQueue.length} stops</span>
              <span>{estMinutes} min</span>
            </div>
          )}

          {distanceToCurrentStop > 0 && currentStop && (
            <div className="border-t border-border/60 pt-2 mt-2 text-[11px] text-muted-foreground">
              Distance: {Math.round(distanceToCurrentStop)}m to {currentStop.stationName}
            </div>
          )}
        </Card>
      )}

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
                  {stationName(req.fromId)} ← {stationName(req.toId)}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="absolute bottom-6 left-4 z-[1000] bg-card/90 backdrop-blur-sm shadow-md border-border p-3 pointer-events-auto">
        <div className="space-y-1.5">
          {[
            { color: '#3b82f6', label: 'Station' },
            { color: '#22c55e', label: 'Start' },
            { color: '#ef4444', label: 'End' },
            { color: '#8b5cf6', label: 'Requested' },
            { color: '#22c55e', label: 'Completed' },
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

      {!mapReady && (
        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center gap-3 z-[2000]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      )}

      <div ref={mapDivRef} className="w-full h-full" />
    </div>
  )
}
