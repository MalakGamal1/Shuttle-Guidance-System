'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Navigation, Plus, Search, CheckCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { useTrips, createTrip } from '@/hooks/useTrips'
import { useFirebaseStations } from '@/hooks/useFirebaseStations'
import { useToast } from '@/components/ui/use-toast'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'

const statusColors = {
  completed: 'bg-primary text-primary-foreground',
  'in-progress': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  scheduled: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

const statusIcons = {
  completed: CheckCircle,
  'in-progress': Clock,
  scheduled: Clock,
  cancelled: AlertTriangle,
}

function formatTimestamp(ts: any): string {
  if (!ts) return 'N/A'
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  }
  const d = new Date(ts)
  if (!isNaN(d.getTime())) {
    return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  }
  return 'N/A'
}

export default function TripsPage() {
  const { toast } = useToast()
  const { trips, loading: tripsLoading } = useTrips()
  const { stations } = useFirebaseStations()

  const [shuttles, setShuttles] = useState<any[]>([])
  const [drivers, setDrivers] = useState<any[]>([])
  const [loadingExtras, setLoadingExtras] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Schedule dialog form state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [selectedShuttleId, setSelectedShuttleId] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedStartStationId, setSelectedStartStationId] = useState('')
  const [selectedEndStationId, setSelectedEndStationId] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Load shuttles and drivers
  useEffect(() => {
    async function loadExtras() {
      setLoadingExtras(true)
      try {
        const shuttleSnap = await getDocs(collection(db, 'shuttles'))
        setShuttles(shuttleSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((s: any) => s.isActive))

        const driverSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'driver')))
        setDrivers(driverSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.error('Failed to load shuttles/drivers:', err)
      } finally {
        setLoadingExtras(false)
      }
    }
    loadExtras()
  }, [])

  const handleScheduleTrip = async () => {
    if (!selectedShuttleId || !selectedDriverId || !selectedStartStationId || !selectedEndStationId) {
      toast({ title: 'Validation Error', description: 'All fields are required.', variant: 'destructive' })
      return
    }

    const shuttle = shuttles.find(s => s.id === selectedShuttleId)
    const driver = drivers.find(d => d.id === selectedDriverId)
    const startStation = stations.find(s => s.id === selectedStartStationId)
    const endStation = stations.find(s => s.id === selectedEndStationId)

    if (!shuttle || !driver || !startStation || !endStation) {
      toast({ title: 'Error', description: 'Invalid shuttle, driver, or station selection.', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      await createTrip({
        shuttleId: shuttle.id,
        plateNumber: shuttle.plateNumber || 'Unknown',
        driverName: driver.name || 'Unknown',
        stops: [
          { stationId: startStation.id, stationName: startStation.name, type: 'pickup', passengers: 0 },
          { stationId: endStation.id, stationName: endStation.name, type: 'dropoff', passengers: 0 }
        ],
        totalPassengers: 0,
        status: 'scheduled'
      })
      toast({ title: 'Trip Scheduled', description: 'Successfully scheduled the new trip.' })
      setIsScheduleOpen(false)
      setSelectedShuttleId('')
      setSelectedDriverId('')
      setSelectedStartStationId('')
      setSelectedEndStationId('')
    } catch (err: any) {
      console.error(err)
      toast({ title: 'Error', description: err.message || 'Failed to schedule trip.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const filteredTrips = trips.filter((trip) => {
    const matchesSearch =
      (trip.plateNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (trip.driverName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (trip.stops || []).some(s => s.stationName.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Realtime Stats
  const completedTrips = trips.filter((t) => t.status === 'completed').length
  const inProgressTrips = trips.filter((t) => t.status === 'in-progress').length
  const scheduledTrips = trips.filter((t) => t.status === 'scheduled').length
  const totalPassengers = trips.reduce((sum, t) => sum + (t.totalPassengers || 0), 0)

  if (tripsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trip Management</h1>
          <p className="text-muted-foreground">Monitor and manage shuttle trips in real-time</p>
        </div>
        <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Schedule Trip
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">Schedule New Trip</DialogTitle>
              <DialogDescription>Assign a shuttle and driver to a scheduled route</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-foreground">Select Shuttle</Label>
                <Select value={selectedShuttleId} onValueChange={setSelectedShuttleId}>
                  <SelectTrigger className="border-border bg-input text-foreground">
                    <SelectValue placeholder="Select shuttle" />
                  </SelectTrigger>
                  <SelectContent>
                    {shuttles.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.plateNumber} ({s.model})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Select Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger className="border-border bg-input text-foreground">
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Start Station</Label>
                  <Select value={selectedStartStationId} onValueChange={setSelectedStartStationId}>
                    <SelectTrigger className="border-border bg-input text-foreground">
                      <SelectValue placeholder="Select start" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map(st => (
                        <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">End Station</Label>
                  <Select value={selectedEndStationId} onValueChange={setSelectedEndStationId}>
                    <SelectTrigger className="border-border bg-input text-foreground">
                      <SelectValue placeholder="Select end" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map(st => (
                        <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-border" onClick={() => setIsScheduleOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleScheduleTrip} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Schedule Trip
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{completedTrips}</div>
            <p className="text-xs text-primary">Total completed trips</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{inProgressTrips}</div>
            <p className="text-xs text-blue-400">Active right now</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">{scheduledTrips}</div>
            <p className="text-xs text-yellow-400">Upcoming trips</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Passengers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalPassengers}</div>
            <p className="text-xs text-muted-foreground">Transported total</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by bus, driver, or station..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-input text-foreground border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 border-border bg-card text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trips Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Navigation className="h-5 w-5 text-primary" />
            Live &amp; Historical Trips
          </CardTitle>
          <CardDescription>{filteredTrips.length} trips total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-3 text-left font-medium">Trip ID</th>
                  <th className="py-3 text-left font-medium">Shuttle</th>
                  <th className="py-3 text-left font-medium">Driver</th>
                  <th className="py-3 text-left font-medium">Route Stops</th>
                  <th className="py-3 text-left font-medium">Passengers</th>
                  <th className="py-3 text-left font-medium">Status</th>
                  <th className="py-3 text-left font-medium">Start Time</th>
                  <th className="py-3 text-left font-medium">End Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No trips found
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip) => {
                    const Icon = statusIcons[trip.status as keyof typeof statusIcons]
                    const routeText = trip.stops && trip.stops.length >= 2
                      ? `${trip.stops[0].stationName} → ${trip.stops[trip.stops.length - 1].stationName}`
                      : 'Custom Route'

                    return (
                      <tr
                        key={trip.id}
                        className="border-b border-border/50 hover:bg-sidebar-accent/50 transition-colors text-foreground"
                      >
                        <td className="py-3 font-mono text-xs text-muted-foreground">{trip.id.substring(0, 8)}...</td>
                        <td className="py-3 font-semibold">{trip.plateNumber}</td>
                        <td className="py-3 text-muted-foreground">{trip.driverName}</td>
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{routeText}</span>
                            <span className="text-xs text-muted-foreground">{trip.stops?.length || 0} stops</span>
                          </div>
                        </td>
                        <td className="py-3 font-medium">{trip.totalPassengers}</td>
                        <td className="py-3">
                          <Badge className={statusColors[trip.status as keyof typeof statusColors]}>
                            {Icon && <Icon className="mr-1 h-3 w-3" />}
                            {trip.status.charAt(0).toUpperCase() + trip.status.slice(1).replace('-', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">{formatTimestamp(trip.startTime)}</td>
                        <td className="py-3 text-muted-foreground">{formatTimestamp(trip.endTime)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
