'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Play, Pause, RotateCcw, Compass, MapPin, Loader2, Navigation, Clock
} from 'lucide-react'
import { useTripReplay } from '@/hooks/useTripReplay'
import { createShuttleIcon } from '@/lib/leaflet-icons'
import type { TripLocationHistory, TripStationHistory } from '@/types/trip-types'

interface TripReplayMapProps {
  locationHistory: TripLocationHistory[]
  stationHistory: TripStationHistory[]
  startPoint: { lat: number; lng: number } | null
  endPoint: { lat: number; lng: number } | null
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

export default function TripReplayMap({
  locationHistory,
  stationHistory,
  startPoint,
  endPoint,
}: TripReplayMapProps) {
  const [mapReady, setMapReady] = useState(false)
  const [autoCenter, setAutoCenter] = useState(true)

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const shuttleMarkerRef = useRef<any>(null)
  const stationMarkersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)

  const replay = useTripReplay(locationHistory)
  const {
    isPlaying,
    isPaused,
    currentIndex,
    speed,
    currentTimestamp,
    currentPosition,
    totalPoints,
    play,
    pause,
    resume,
    setSpeed,
    seekTo,
    reset
  } = replay

  // Load Leaflet resources (CSS & JS) dynamically
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

  // Initialize Map
  useEffect(() => {
    if (!mapReady || !mapDivRef.current || mapRef.current) return
    const L = (window as any).L

    const map = L.map(mapDivRef.current, { zoomControl: false })
      .setView([27.18, 31.1735], 16)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    // Render full route polyline if location history exists
    if (locationHistory.length >= 2) {
      const latlngs = locationHistory.map(pt => [pt.lat, pt.lng] as [number, number])
      const poly = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 5,
        opacity: 0.75,
        dashArray: '2, 5', // Show historical route path as dotted line
      }).addTo(map)
      polylineRef.current = poly

      // Fit map bounds to show full route
      map.fitBounds(poly.getBounds(), { padding: [40, 40] })
    }

    // Add green marker for start
    if (startPoint) {
      L.circleMarker([startPoint.lat, startPoint.lng], {
        radius: 8,
        color: '#ffffff',
        fillColor: '#22c55e',
        fillOpacity: 1,
        weight: 2,
      })
      .addTo(map)
      .bindTooltip('Trip Start', { direction: 'top' })
    }

    // Add red marker for end
    if (endPoint) {
      L.circleMarker([endPoint.lat, endPoint.lng], {
        radius: 8,
        color: '#ffffff',
        fillColor: '#ef4444',
        fillOpacity: 1,
        weight: 2,
      })
      .addTo(map)
      .bindTooltip('Trip End', { direction: 'top' })
    }

    // Render stations visited
    const stationMarkers: any[] = []
    stationHistory.forEach(station => {
      const marker = L.circleMarker([station.lat, station.lng], makeCircleStyle('#a855f7')) // purple for station
        .addTo(map)
        .bindTooltip(`Station: ${station.stationName}`, { direction: 'top' })
      stationMarkers.push(marker)
    })
    stationMarkersRef.current = stationMarkers

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      shuttleMarkerRef.current = null
      stationMarkersRef.current = []
      polylineRef.current = null
    }
  }, [mapReady, locationHistory, stationHistory, startPoint, endPoint])

  // Update shuttle marker as replay position changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !currentPosition) return
    const L = (window as any).L
    const map = mapRef.current

    let bearing = 0
    if (currentIndex > 0 && currentIndex < locationHistory.length) {
      const prev = locationHistory[currentIndex - 1]
      const curr = locationHistory[currentIndex]
      bearing = calcBearing([prev.lat, prev.lng], [curr.lat, curr.lng])
    } else if (currentIndex === 0 && locationHistory.length > 1) {
      const curr = locationHistory[0]
      const next = locationHistory[1]
      bearing = calcBearing([curr.lat, curr.lng], [next.lat, next.lng])
    }

    if (shuttleMarkerRef.current) {
      shuttleMarkerRef.current.setLatLng([currentPosition.lat, currentPosition.lng])
      shuttleMarkerRef.current.setIcon(createShuttleIcon(L, bearing, map.getZoom()))
    } else {
      const marker = L.marker([currentPosition.lat, currentPosition.lng], {
        icon: createShuttleIcon(L, bearing, map.getZoom())
      }).addTo(map)
      shuttleMarkerRef.current = marker
    }

    if (autoCenter) {
      map.panTo([currentPosition.lat, currentPosition.lng])
    }
  }, [currentPosition, currentIndex, mapReady, autoCenter, locationHistory])

  // Format date-time for display
  const formatTime = (ts: any) => {
    if (!ts) return ''
    let date: Date
    if (ts && typeof ts.toDate === 'function') {
      date = ts.toDate()
    } else {
      date = new Date(ts)
    }
    return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const handleSliderChange = (val: number[]) => {
    seekTo(val[0])
  }

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card">
      {/* Map Container */}
      <div className="relative">
        <div ref={mapDivRef} className="w-full h-[400px] z-10" />

        {!mapReady && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-3 z-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading interactive map...</p>
          </div>
        )}

        {/* Map Legend & Floating Controls */}
        {mapReady && (
          <>
            {/* Auto center toggle */}
            <div className="absolute top-4 right-4 z-20">
              <Button
                variant={autoCenter ? 'default' : 'secondary'}
                size="icon"
                onClick={() => setAutoCenter(!autoCenter)}
                className="shadow-md h-9 w-9"
                title={autoCenter ? 'Disable Auto Center' : 'Enable Auto Center'}
              >
                <Compass className={`h-4 w-4 ${autoCenter ? 'animate-pulse' : ''}`} />
              </Button>
            </div>

            {/* Custom map zoom controls */}
            <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5 shadow-md rounded-md overflow-hidden border border-border bg-card">
              <button
                onClick={() => mapRef.current?.zoomIn()}
                className="w-8 h-8 bg-card hover:bg-muted flex items-center justify-center text-foreground transition-colors border-b border-border text-lg font-bold"
              >
                +
              </button>
              <button
                onClick={() => mapRef.current?.zoomOut()}
                className="w-8 h-8 bg-card hover:bg-muted flex items-center justify-center text-foreground transition-colors text-lg font-bold"
              >
                -
              </button>
            </div>

            {/* Mini Legend overlay */}
            <div className="absolute bottom-4 left-4 z-20 bg-card/90 backdrop-blur-sm p-2 rounded-md shadow-md border border-border flex flex-col gap-1 text-[10px] text-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Trip Start</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Trip End</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Station Visited</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Navigation className="h-3 w-3 text-green-600 rotate-45" />
                <span>Shuttle (moving)</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Replay Controls Footer */}
      <div className="p-4 border-t border-border bg-card/50 space-y-4">
        {/* Scrubber slider & Timestamp */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Slider
              value={[currentIndex]}
              min={0}
              max={totalPoints - 1}
              step={1}
              onValueChange={handleSliderChange}
              disabled={totalPoints < 2}
              className="py-2"
            />
          </div>
          <div className="text-xs font-mono text-muted-foreground w-20 text-right flex-shrink-0">
            {currentIndex + 1} / {totalPoints}
          </div>
        </div>

        {/* Action controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {/* Play/Pause/Resume */}
            {isPlaying ? (
              <Button size="sm" variant="outline" className="h-9 w-24 border-border" onClick={pause}>
                <Pause className="h-4 w-4 mr-2" /> Pause
              </Button>
            ) : isPaused ? (
              <Button size="sm" variant="default" className="h-9 w-24" onClick={resume}>
                <Play className="h-4 w-4 mr-2" /> Resume
              </Button>
            ) : (
              <Button size="sm" variant="default" className="h-9 w-24" onClick={play} disabled={totalPoints < 2}>
                <Play className="h-4 w-4 mr-2" /> Play
              </Button>
            )}

            {/* Reset */}
            <Button size="sm" variant="ghost" className="h-9 text-muted-foreground hover:text-foreground" onClick={reset} disabled={totalPoints < 2}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Reset
            </Button>
          </div>

          {/* Current GPS timestamp status */}
          {currentTimestamp && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Clock className="h-3.5 w-3.5" />
              <span>Time: {formatTime(currentTimestamp)}</span>
            </div>
          )}

          {/* Playback speed buttons */}
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border">
            {([1, 2, 5] as const).map(speedOption => (
              <Button
                key={speedOption}
                size="sm"
                variant={speed === speedOption ? 'default' : 'ghost'}
                onClick={() => setSpeed(speedOption)}
                className={`h-7 px-2.5 text-xs font-semibold rounded-md ${
                  speed === speedOption ? 'shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {speedOption}x
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
