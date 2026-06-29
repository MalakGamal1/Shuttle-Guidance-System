'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bus, Search, CheckCircle, Clock, Users, Navigation, Activity,
  Loader2, ChevronDown, ChevronRight, MapPin, Timer, CalendarDays,
  TrendingUp, UserCheck, Filter, X,
} from 'lucide-react'
import { useTrips, useGroupedTrips, useTripDashboardStats, formatTimestamp, formatDuration, formatDistance } from '@/hooks/useTrips'
import { useAutoTrips } from '@/hooks/useAutoTrips'
import { useFirebaseStations } from '@/hooks/useFirebaseStations'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import type { TripFilters, TripStatus } from '@/types/trip-types'

// ─────────────────────────────────────────────────────────────
//  Status styling
// ─────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  'in-progress': {
    label: 'In Progress',
    className: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    icon: Activity,
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    icon: CheckCircle,
  },
}

// ─────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────
export default function TripsPage() {
  const router = useRouter()

  // Auto-trip lifecycle management (runs side effects)
  useAutoTrips()

  // ─── Filters ───────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all')
  const [shuttleFilter, setShuttleFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [stationFilter, setStationFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const filters: TripFilters = useMemo(() => ({
    search: searchTerm || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    shuttleId: shuttleFilter !== 'all' ? shuttleFilter : undefined,
    driverId: driverFilter !== 'all' ? driverFilter : undefined,
    date: dateFilter || undefined,
    dateFrom: dateFromFilter || undefined,
    dateTo: dateToFilter || undefined,
  }), [searchTerm, statusFilter, shuttleFilter, driverFilter, dateFilter, dateFromFilter, dateToFilter])

  // ─── Data ──────────────────────────────────────────────────
  const { trips, loading: tripsLoading } = useTrips(filters)
  const grouped = useGroupedTrips(trips)
  const stats = useTripDashboardStats(trips)
  const { stations } = useFirebaseStations()

  // Load shuttle and driver options for filter dropdowns
  const [shuttleOptions, setShuttleOptions] = useState<{ id: string; plateNumber: string }[]>([])
  const [driverOptions, setDriverOptions] = useState<{ id: string; name: string; employeeId: string }[]>([])

  useEffect(() => {
    async function loadOptions() {
      try {
        const shuttleSnap = await getDocs(collection(db, 'shuttles'))
        setShuttleOptions(
          shuttleSnap.docs.map(d => ({
            id: d.id,
            plateNumber: (d.data() as any).plateNumber || d.id,
          }))
        )

        const driverSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'driver')))
        setDriverOptions(
          driverSnap.docs.map(d => {
            const data = d.data() as any
            return {
              id: d.id,
              name: data.name || data.fullName || 'Unknown',
              employeeId: data.employeeId || '',
            }
          })
        )
      } catch (err) {
        console.error('Failed to load filter options:', err)
      }
    }
    loadOptions()
  }, [])

  // ─── Expanded shuttle groups ───────────────────────────────
  const [expandedShuttles, setExpandedShuttles] = useState<Set<string>>(new Set())

  const toggleShuttle = (shuttleId: string) => {
    setExpandedShuttles(prev => {
      const next = new Set(prev)
      if (next.has(shuttleId)) next.delete(shuttleId)
      else next.add(shuttleId)
      return next
    })
  }

  // Expand all by default when data first loads
  useEffect(() => {
    if (grouped.length > 0 && expandedShuttles.size === 0) {
      setExpandedShuttles(new Set(grouped.map(g => g.shuttleId)))
    }
  }, [grouped.length])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setShuttleFilter('all')
    setDriverFilter('all')
    setDateFilter('')
    setDateFromFilter('')
    setDateToFilter('')
    setStationFilter('all')
  }

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || shuttleFilter !== 'all' ||
    driverFilter !== 'all' || dateFilter || dateFromFilter || dateToFilter || stationFilter !== 'all'

  // ─── Loading state ─────────────────────────────────────────
  if (tripsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading trips...</p>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">Trip Management</h1>
        <p className="text-muted-foreground">
          Shuttle-centric trip history — trips are created automatically when drivers log in
        </p>
      </div>

      {/* ─── Dashboard Stats ─────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Active Shuttles"
          value={stats.activeShuttles}
          subtitle="Currently operating"
          icon={<Bus className="h-4 w-4" />}
          accentColor="text-blue-400"
          accentBg="bg-blue-500/10"
        />
        <StatCard
          title="Completed Today"
          value={stats.completedTripsToday}
          subtitle="Trips finished"
          icon={<CheckCircle className="h-4 w-4" />}
          accentColor="text-emerald-400"
          accentBg="bg-emerald-500/10"
        />
        <StatCard
          title="Passengers Today"
          value={stats.totalPassengersToday}
          subtitle="Transported"
          icon={<Users className="h-4 w-4" />}
          accentColor="text-violet-400"
          accentBg="bg-violet-500/10"
        />
        <StatCard
          title="Trips This Week"
          value={stats.totalTripsThisWeek}
          subtitle="Completed"
          icon={<TrendingUp className="h-4 w-4" />}
          accentColor="text-cyan-400"
          accentBg="bg-cyan-500/10"
        />
        <StatCard
          title="Avg Duration"
          value={formatDuration(stats.averageTripDuration)}
          subtitle="Per trip"
          icon={<Timer className="h-4 w-4" />}
          accentColor="text-amber-400"
          accentBg="bg-amber-500/10"
          isText
        />
        <StatCard
          title="Active Drivers"
          value={stats.activeDrivers}
          subtitle="Logged in"
          icon={<UserCheck className="h-4 w-4" />}
          accentColor="text-rose-400"
          accentBg="bg-rose-500/10"
        />
      </div>

      {/* ─── Search & Filters ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {/* Search */}
          <div className="relative flex-1 md:max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="trip-search"
              placeholder="Search by shuttle, driver, employee ID, or trip ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-input text-foreground border-border"
            />
          </div>

          {/* Quick filters */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={`border-border gap-2 ${showFilters ? 'bg-primary/10 border-primary/30' : ''}`}
          >
            <Filter className="h-4 w-4" />
            Advanced Filters
            {hasActiveFilters && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                !
              </span>
            )}
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Specific Date</label>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => { setDateFilter(e.target.value); setDateFromFilter(''); setDateToFilter('') }}
                    className="bg-input text-foreground border-border"
                  />
                </div>

                {/* Date range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date From</label>
                  <Input
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => { setDateFromFilter(e.target.value); setDateFilter('') }}
                    className="bg-input text-foreground border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date To</label>
                  <Input
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => { setDateToFilter(e.target.value); setDateFilter('') }}
                    className="bg-input text-foreground border-border"
                  />
                </div>

                {/* Shuttle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Shuttle</label>
                  <Select value={shuttleFilter} onValueChange={setShuttleFilter}>
                    <SelectTrigger className="border-border bg-input text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shuttles</SelectItem>
                      {shuttleOptions.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.plateNumber}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Driver */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Driver</label>
                  <Select value={driverFilter} onValueChange={setDriverFilter}>
                    <SelectTrigger className="border-border bg-input text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Drivers</SelectItem>
                      {driverOptions.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Station */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Station Visited</label>
                  <Select value={stationFilter} onValueChange={setStationFilter}>
                    <SelectTrigger className="border-border bg-input text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stations</SelectItem>
                      {stations.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Shuttle-Centric Trip List ───────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Trip History by Shuttle
          </h2>
          <p className="text-sm text-muted-foreground">{trips.length} trips total</p>
        </div>

        {grouped.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <Navigation className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No trips found</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Trips are created automatically when drivers log in from the mobile app
              </p>
            </CardContent>
          </Card>
        ) : (
          grouped.map(group => (
            <Card key={group.shuttleId} className="border-border bg-card overflow-hidden">
              {/* Shuttle header (clickable to expand/collapse) */}
              <button
                onClick={() => toggleShuttle(group.shuttleId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-sidebar-accent/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <Bus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{group.plateNumber}</span>
                      {group.shuttleModel && (
                        <span className="text-xs text-muted-foreground">({group.shuttleModel})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{group.totalTrips} trip{group.totalTrips !== 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{group.totalPassengers} passengers</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.trips.some(t => t.status === 'in-progress') && (
                    <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px]">
                      <span className="relative flex h-1.5 w-1.5 mr-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400"></span>
                      </span>
                      Active
                    </Badge>
                  )}
                  {expandedShuttles.has(group.shuttleId) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Trip rows */}
              {expandedShuttles.has(group.shuttleId) && (
                <div className="border-t border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-muted-foreground bg-card/50">
                          <th className="py-2.5 px-5 text-left font-medium text-xs">Date</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Driver</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Start Time</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">End Time</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Duration</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Passengers</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Distance</th>
                          <th className="py-2.5 px-3 text-left font-medium text-xs">Status</th>
                          <th className="py-2.5 px-3 text-right font-medium text-xs"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.trips.map(trip => {
                          const cfg = statusConfig[trip.status] || statusConfig['in-progress']
                          const StatusIcon = cfg.icon

                          // Calculate live duration for in-progress trips
                          let displayDuration = trip.duration
                          if (trip.status === 'in-progress' && trip.startTime) {
                            const startMs = typeof trip.startTime.toDate === 'function'
                              ? trip.startTime.toDate().getTime()
                              : new Date(trip.startTime).getTime()
                            if (!isNaN(startMs)) {
                              displayDuration = Math.round((Date.now() - startMs) / 1000)
                            }
                          }

                          return (
                            <tr
                              key={trip.id}
                              onClick={() => router.push(`/trips/${trip.id}`)}
                              className="border-b border-border/30 hover:bg-sidebar-accent/40 transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-2">
                                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground">{trip.startDate || 'N/A'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground text-xs">{trip.driverName}</span>
                                  {trip.driverEmployeeId && (
                                    <span className="text-[10px] text-muted-foreground font-mono">{trip.driverEmployeeId}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-muted-foreground text-xs">{formatTimestamp(trip.startTime)}</td>
                              <td className="py-3 px-3 text-muted-foreground text-xs">{formatTimestamp(trip.endTime)}</td>
                              <td className="py-3 px-3">
                                <span className={`text-xs font-medium ${trip.status === 'in-progress' ? 'text-blue-400' : 'text-foreground'}`}>
                                  {formatDuration(displayDuration)}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className="text-xs font-semibold text-foreground">{trip.totalPassengers}</span>
                              </td>
                              <td className="py-3 px-3 text-xs text-muted-foreground">{formatDistance(trip.totalDistance)}</td>
                              <td className="py-3 px-3">
                                <Badge className={`text-[10px] ${cfg.className}`}>
                                  <StatusIcon className="mr-1 h-3 w-3" />
                                  {cfg.label}
                                </Badge>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Stat Card component
// ─────────────────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon, accentColor, accentBg, isText,
}: {
  title: string
  value: number | string
  subtitle: string
  icon: React.ReactNode
  accentColor: string
  accentBg: string
  isText?: boolean
}) {
  return (
    <Card className="border-border bg-card relative overflow-hidden group hover:border-border/80 transition-all duration-300">
      {/* Gradient accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentBg} opacity-60`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-4 px-4">
        <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${accentBg} ${accentColor}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={`text-2xl font-bold ${accentColor}`}>
          {isText ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  )
}
