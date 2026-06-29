'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft, Bus, User, Clock, MapPin, Users, Navigation,
  Loader2, CheckCircle, Activity, Calendar, Timer, Route,
  Play, ChevronRight, TrendingUp,
} from 'lucide-react'
import { useTripDetails } from '@/hooks/useTripDetails'
import { formatTimestamp, formatDuration, formatDistance } from '@/hooks/useTrips'
import dynamic from 'next/dynamic'

// Dynamically import the replay map to avoid SSR issues with Leaflet
const TripReplayMap = dynamic(
  () => import('@/components/trips/TripReplayMap'),
  { ssr: false, loading: () => <MapSkeleton /> }
)

function MapSkeleton() {
  return (
    <div className="w-full h-[400px] rounded-lg bg-card border border-border flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Trip Details Page
// ─────────────────────────────────────────────────────────────
export default function TripDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.tripId as string

  const { trip, stationHistory, locationHistory, statistics, loading, error, refresh } = useTripDetails(tripId)

  // Calculate live duration for in-progress trips
  const [liveDuration, setLiveDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!trip || trip.status !== 'in-progress' || !trip.startTime) return
    const update = () => {
      const startMs = new Date(trip.startTime).getTime()
      if (!isNaN(startMs)) setLiveDuration(Math.round((Date.now() - startMs) / 1000))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [trip?.startTime, trip?.status])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading trip details...</p>
        </div>
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-destructive">{error || 'Trip not found'}</p>
        <Button variant="outline" onClick={() => router.push('/trips')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Trips
        </Button>
      </div>
    )
  }

  const isActive = trip.status === 'in-progress'
  const displayDuration = isActive ? liveDuration : trip.duration

  return (
    <div className="space-y-6 p-6">
      {/* ─── Header ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/trips')}
            className="hover:bg-sidebar-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Trip Details</h1>
              <Badge className={isActive
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }>
                {isActive ? (
                  <>
                    <span className="relative flex h-1.5 w-1.5 mr-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400"></span>
                    </span>
                    In Progress
                  </>
                ) : (
                  <><CheckCircle className="mr-1 h-3 w-3" /> Completed</>
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">ID: {trip.id}</p>
          </div>
        </div>
        <Button variant="outline" onClick={refresh} className="border-border">
          Refresh Data
        </Button>
      </div>

      {/* ─── General Info + Stats ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* General Information */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              General Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InfoItem icon={<Bus className="h-4 w-4" />} label="Shuttle" value={trip.plateNumber} />
              <InfoItem icon={<User className="h-4 w-4" />} label="Driver" value={trip.driverName} />
              <InfoItem icon={<Badge variant="outline" className="font-mono text-[10px] px-1 py-0">{trip.driverEmployeeId || '—'}</Badge>} label="Employee ID" value="" />
              <InfoItem icon={<Calendar className="h-4 w-4" />} label="Date" value={trip.startDate} />
              <InfoItem icon={<Clock className="h-4 w-4" />} label="Start Time" value={formatTimestamp(trip.startTime)} />
              <InfoItem icon={<Clock className="h-4 w-4" />} label="End Time" value={formatTimestamp(trip.endTime)} />
              <InfoItem
                icon={<Timer className="h-4 w-4" />}
                label="Duration"
                value={formatDuration(displayDuration)}
                highlight={isActive}
              />
              <InfoItem icon={<MapPin className="h-4 w-4" />} label="Start Station" value={trip.startStationName || 'N/A'} />
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Trip Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-5 gap-x-6">
              <StatItem label="Total Passengers" value={statistics?.totalPassengers ?? trip.totalPassengers} color="text-violet-400" />
              <StatItem label="Total Requests" value={statistics?.totalRequests ?? trip.totalRequests} color="text-cyan-400" />
              <StatItem label="Stations Visited" value={statistics?.stationsVisited ?? stationHistory.length} color="text-amber-400" />
              <StatItem label="Total Distance" value={formatDistance(statistics?.totalDistance ?? trip.totalDistance)} color="text-emerald-400" isText />
              <StatItem label="Avg Stop Duration" value={statistics?.avgStopDuration ? formatDuration(Math.round(statistics.avgStopDuration)) : 'N/A'} color="text-rose-400" isText />
              <StatItem label="Unique Passengers" value={statistics?.uniquePassengers ?? trip.totalPassengers} color="text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Station Timeline ────────────────────────── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Station Timeline
          </CardTitle>
          <CardDescription>
            {stationHistory.length} station{stationHistory.length !== 1 ? 's' : ''} visited during this trip
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stationHistory.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MapPin className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p>No station visits recorded</p>
            </div>
          ) : (
            <div className="relative pl-8">
              {/* Vertical timeline line */}
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />

              {stationHistory.map((station, index) => {
                const isFirst = index === 0
                const isLast = index === stationHistory.length - 1

                return (
                  <div key={station.id} className="relative pb-6 last:pb-0">
                    {/* Timeline dot */}
                    <div className={`absolute -left-5 top-1 w-4 h-4 rounded-full border-2 border-card ${
                      isFirst ? 'bg-emerald-500' :
                      isLast ? 'bg-red-500' :
                      'bg-primary'
                    }`} />

                    {/* Station card */}
                    <div className="ml-4 p-4 rounded-lg border border-border/50 bg-card/50 hover:bg-sidebar-accent/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {station.stationName || `Station ${station.stationId}`}
                        </h4>
                        <div className="flex items-center gap-1">
                          {isFirst && <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px]">Start</Badge>}
                          {isLast && !isFirst && <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-[9px]">Last</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Arrival</span>
                          <p className="font-medium text-foreground">{formatTimestamp(station.arrivalTime)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Departure</span>
                          <p className="font-medium text-foreground">{formatTimestamp(station.departureTime)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Boarded</span>
                          <p className="font-semibold text-emerald-400">+{station.passengersBoarded}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Dropped Off</span>
                          <p className="font-semibold text-rose-400">-{station.passengersDropped}</p>
                        </div>
                      </div>
                    </div>

                    {/* Arrow between stations */}
                    {!isLast && (
                      <div className="absolute -left-[13px] bottom-0 text-muted-foreground">
                        <ChevronRight className="h-3 w-3 rotate-90" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Route Map & Replay ──────────────────────── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Route History & Replay
          </CardTitle>
          <CardDescription>
            {locationHistory.length > 0
              ? `${locationHistory.length} GPS points recorded — replay the shuttle's journey`
              : 'No GPS data available for this trip'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {locationHistory.length > 0 ? (
            <TripReplayMap
              locationHistory={locationHistory}
              stationHistory={stationHistory}
              startPoint={trip.startLat && trip.startLng ? { lat: trip.startLat, lng: trip.startLng } : null}
              endPoint={trip.endLat && trip.endLng ? { lat: trip.endLat, lng: trip.endLng } : null}
            />
          ) : (
            <div className="w-full h-[300px] rounded-lg bg-sidebar-accent/30 border border-border/50 flex flex-col items-center justify-center">
              <Route className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No GPS route data available</p>
              <p className="text-muted-foreground/60 text-xs mt-1">GPS breadcrumbs are recorded by the mobile app during the trip</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────
function InfoItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-medium ${highlight ? 'text-blue-400' : 'text-foreground'}`}>{value || '—'}</p>
      </div>
    </div>
  )
}

function StatItem({ label, value, color, isText }: { label: string; value: string | number; color: string; isText?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>
        {isText ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
      </p>
    </div>
  )
}
