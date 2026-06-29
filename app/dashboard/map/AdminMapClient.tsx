'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { STATIONS } from '@/lib/university-graph'
import { useShuttleRequests, type ShuttleRequest } from '@/hooks/useShuttleRequests'
import { useLiveShuttles, type LiveShuttle } from '@/hooks/useLiveShuttles'
import { useNearestStations } from '@/hooks/useNearestStations'
import { useDynamicRouting, type DynamicStop } from '@/hooks/useDynamicRouting'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Bus, Navigation, MapPin, Users, ChevronRight,
  Loader2, AlertCircle, Route, Plus, Minus, CheckCircle2,
} from 'lucide-react'

interface FirebaseStation {
  id: string
  name: string
  lat: number
  lng: number
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

function makeTriangleIcon(L: any, bearing: number) {
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

export default function AdminMapClient() {
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState('')
  const [activeRequest, setActiveRequest] = useState<ShuttleRequest | null>(null)
  const [firebaseStations, setFirebaseStations] = useState<FirebaseStation[]>([])

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const stationMarkersRef = useRef<Record<string, any>>({})
  const shuttleMarkersRef = useRef<Record<string, any>>({})
  const prevShuttlePos = useRef<Record<string, [number, number]>>({})
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
    error: routeError,
  } = useDynamicRouting()

  const activeShuttle = shuttles[0] ?? null

  const {
    nearestStations,
    loading: nearestLoading,
  } = useNearestStations({
    shuttleLat: activeShuttle?.lat ?? 0,
    shuttleLng: activeShuttle?.lng ?? 0,
    topN: 5,
    enabled: !!activeShuttle,
  })

  useEffect(() => {
    async function loadStations() {
      try {
        const { collection, getDocs } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        const snap = await getDocs(collection(db, 'stations'))
        const list = snap.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            name: data.name || doc.id,
            lat: typeof data.lat === 'number' ? data.lat : 0,
            lng: typeof data.lng === 'number' ? data.lng : 0,
          }
        })
        setFirebaseStations(list)
      } catch (err) {
        console.error('[Leaflet] Failed to load firebase stations:', err)
      }
    }
    loadStations()
  }, [])

  const getStationName = useCallback((id: string): string => {
    const local = STATIONS.find(s => s.id === id)
    if (local) return local.name
    const fb = firebaseStations.find(s => s.id === id)
    if (fb) return fb.name
    return id
  }, [firebaseStations])

  const activeCount = shuttles.length
  const waitingCount = requests.filter(r => r.status === 'pending' || r.status === 'active').length
  const onboardCount = requests.filter(r => r.status === 'onboard').length
  const doneCount = requests.filter(r => r.status === 'done' || r.status === 'completed').length

  const requestedStationIds = new Set(stopQueue.map(s => s.stationId))

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

  useEffect(() => {
    if (!mapReady) return
    if (!mapDivRef.current) return
    if (mapRef.current) return
    const L = (window as any).L

    const map = L.map(mapDivRef.current, { zoomControl: false })
      .setView([27.18, 31.1735], 16)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    STATIONS.forEach(s => {
      if (s.id === 'guest_house' || s.id === 'roundabout' || s.id === 'surgery' || s.id === 'hospital') {
        return
      }
      const m = L.circleMarker([s.lat, s.lng], makeCircleStyle('#3b82f6'))
        .addTo(map)
        .bindTooltip(s.name, { permanent: false, direction: 'top' })
      stationMarkersRef.current[s.id] = m
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [mapReady])

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const L = (window as any).L
    const map = mapRef.current

    shuttles.forEach((shuttle: LiveShuttle) => {
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
        const m = L.marker(cur, { icon: makeTriangleIcon(L, bearing) })
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

  function handleSelect(req: ShuttleRequest) {
    setActiveRequest(req)
  }

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

  const goToEngineering = useCallback(() => {
    if (!mapRef.current) return
    mapRef.current.flyTo([27.18760, 31.17228], 15, { animate: true, duration: 2 })
  }, [])

  const followShuttle = useCallback(() => {
    if (!mapRef.current || shuttles.length === 0) return
    const s = shuttles[0]
    mapRef.current.flyTo([s.lat, s.lng], 18, { animate: true, duration: 1.5 })
  }, [shuttles])

  return (
    <div className="flex flex-row h-screen overflow-hidden">
      <div className="w-[300px] shrink-0 bg-card border-r border-border flex flex-col overflow-hidden">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-0.5">
            <Bus className="h-5 w-5 text-primary" />
            <span className="text-base font-bold text-foreground">Shuttle Tracker</span>
          </div>
          <p className="text-xs text-muted-foreground text-right">Assiut University</p>
        </div>

        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Bus className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
            <div className="text-lg font-bold text-foreground leading-none">{activeCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Shuttles</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Route className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <div className="text-lg font-bold text-foreground leading-none">{stopQueue.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Stops</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <div className="text-lg font-bold text-foreground leading-none">{waitingCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Waiting</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-purple-500" />
            <div className="text-lg font-bold text-foreground leading-none">{onboardCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Onboard</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
            <div className="text-lg font-bold text-foreground leading-none">{doneCount}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Completed</div>
          </div>
        </div>

        {currentStop && (
          <div className="p-4 border-b border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Active Destination
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0" />
              <span className="text-xs text-foreground font-medium truncate">
                {currentStop.stationName}
              </span>
              {distanceToCurrentStop > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {Math.round(distanceToCurrentStop)}m away
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{currentStop.requestCount} active request{currentStop.requestCount !== 1 ? 's' : ''}</span>
              {isRouteLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 border-b border-border">
            <Alert className="py-1.5 px-2 border-destructive/40 bg-destructive/10">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <AlertDescription className="text-xs ml-1">{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {routeError && (
          <div className="p-4 border-b border-border">
            <Alert className="py-1.5 px-2 border-amber-500/40 bg-amber-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <AlertDescription className="text-xs ml-1">Route: {routeError}</AlertDescription>
            </Alert>
          </div>
        )}

        {(stopQueue.length > 0 || isRouteLoading) && (
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 text-purple-500" />
                Stop Queue
                {isRouteLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {stopQueue.length}
              </Badge>
            </div>

            {stopQueue.map((s, idx) => (
              <div
                key={s.stationId}
                className={`flex items-center justify-between bg-muted/50 rounded-lg px-2.5 py-2 ${
                  idx === 0 ? 'ring-1 ring-purple-500/50' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    idx === 0 ? 'bg-purple-500' : 'bg-muted-foreground'
                  }`} />
                  <span className="text-xs text-foreground truncate">
                    {idx === 0 ? '→ ' : ''}{s.stationName}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {s.requestCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-yellow-500/20 text-yellow-600">
                      {s.requestCount}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {s.distanceFromShuttle < 1000
                      ? `${s.distanceFromShuttle}m`
                      : `${(s.distanceFromShuttle / 1000).toFixed(1)}km`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {completedStopIds.length > 0 && (
          <div className="p-3 border-b border-border space-y-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Completed Stops
            </span>
            {completedStopIds.map(id => {
              const s = STATIONS.find(st => st.id === id)
              return (
                <div key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {s?.name || id}
                </div>
              )
            })}
          </div>
        )}

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
                    <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                      {timeAgo(req.createdAt)} · {req.userId.slice(0, 8)}…
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span
                      className={[
                        'text-[10px] font-medium',
                        req.status === 'active' ? 'text-green-500' :
                        req.status === 'pending' ? 'text-yellow-500' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {req.status === 'active' ? 'Active' : req.status === 'pending' ? 'Pending' : 'Done'}
                    </span>
                    <span
                      className={[
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        req.status === 'active' ? 'bg-green-500' :
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

      <div className="flex-1 relative">
        {routePath.length > 0 && currentStop && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <Card className="bg-card/95 backdrop-blur-sm shadow-lg border-border">
              <CardContent className="px-4 py-2">
                <p className="text-xs font-semibold text-foreground text-center">
                  Routing to: {currentStop.stationName}
                </p>
                <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                  {Math.round(distanceToCurrentStop)}m away · {stopQueue.length} stop{stopQueue.length !== 1 ? 's' : ''} in queue
                </p>
              </CardContent>
            </Card>
          </div>
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

        <div className="absolute bottom-6 left-4 z-[1000]">
          <Card className="bg-card/95 backdrop-blur-sm shadow-lg border-border">
            <CardContent className="px-3 py-2.5 space-y-1.5">
              {[
                { color: '#3b82f6', label: 'Station' },
                { color: '#8b5cf6', label: 'Requested' },
                { color: '#22c55e', label: 'Completed' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2 text-[11px] text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
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

        {!mapReady && (
          <div className="absolute inset-0 bg-background flex flex-col items-center justify-center gap-3 z-50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}

        <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-2">
          <button
            onClick={followShuttle}
            className="w-12 h-12 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white rounded-full shadow-lg transition-all border border-green-500/20 hover:scale-105 active:scale-95"
            title="Follow Shuttle"
          >
            <Bus className="h-6 w-6" />
          </button>

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
