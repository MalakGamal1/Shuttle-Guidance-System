'use client'

import { useState, useEffect } from 'react'
import {
  collection, getDocs, query, where, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download, TrendingUp, Users, MapPin, AlertTriangle, MessageSquare,
} from 'lucide-react'

import { useToast } from '@/components/ui/use-toast'

/* ═══════════════════ Types ═══════════════════ */

interface TripDoc {
  createdAt: any
  passengerCount: number
  routeId: string
  routeSnapshot?: { name?: string }
  driverSnapshot?: { name?: string; phone?: string }
  driverId?: string
  active?: boolean
}

interface RouteDoc {
  id: string
  name: string
  isActive: boolean
  distanceKm: number
  approxDurationMin: number
}

interface ReportDoc {
  id: string
  createdAt: any
  description: string
  driverId: string
  tripId: string
  type: string
}

interface ComplaintDoc {
  id: string
  createdAt: any
  description: string
  status: string
  fromUserId: string
  tripId: string
  bookingId?: string
  assignedTo?: string
  updatedAt?: any
}

/* ═══════════════════ Helpers ═══════════════════ */

type TimePeriod = 'this_month' | 'last_month' | 'last_3_months' | 'this_year'

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const now = new Date()
  const end = now
  let start: Date

  switch (period) {
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      break
    case 'last_3_months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      break
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1)
      break
  }

  return { start, end }
}

function formatDate(ts: any): string {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}



/* ═══════════════════ Component ═══════════════════ */

export default function ReportsPage() {
  const [period, setPeriod] = useState<TimePeriod>('this_month')
  const [loading, setLoading] = useState(true)
  const [trips, setTrips] = useState<TripDoc[]>([])
  const [routes, setRoutes] = useState<RouteDoc[]>([])
  const [reports, setReports] = useState<ReportDoc[]>([])
  const [complaints, setComplaints] = useState<ComplaintDoc[]>([])
  const { toast } = useToast()

  /* ── Fetch data when period changes ── */
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { start, end } = getDateRange(period)
      const startTs = Timestamp.fromDate(start)
      const endTs = Timestamp.fromDate(end)

      try {
        // 1. Trips (filtered by time)
        const tripsSnap = await getDocs(
          query(collection(db, 'trips'),
            where('createdAt', '>=', startTs),
            where('createdAt', '<=', endTs),
            orderBy('createdAt', 'desc'))
        )
        setTrips(tripsSnap.docs.map((d) => d.data() as TripDoc))

        // 2. Routes (all — for active count & efficiency)
        const routesSnap = await getDocs(collection(db, 'routes'))
        setRoutes(routesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteDoc)))

        // 3. Reports / Incidents (filtered by time)
        const reportsSnap = await getDocs(
          query(collection(db, 'reports'),
            where('createdAt', '>=', startTs),
            where('createdAt', '<=', endTs),
            orderBy('createdAt', 'desc'))
        )
        setReports(reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ReportDoc)))

        // 4. Complaints (filtered by time)
        const complaintsSnap = await getDocs(
          query(collection(db, 'complaints'),
            where('createdAt', '>=', startTs),
            where('createdAt', '<=', endTs),
            orderBy('createdAt', 'desc'))
        )
        setComplaints(complaintsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ComplaintDoc)))
      } catch (err) {
        console.error('Reports fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [period])

  /* ── Computed stats ── */
  const totalTrips = trips.length
  const totalPassengers = trips.reduce((sum, t) => sum + (Number(t.passengerCount) || 0), 0)
  const activeRoutes = routes.filter((r) => r.isActive).length



  /* ── CSV Export ── */
  function exportCSV() {
    const lines: string[] = []

    // Stats
    lines.push('=== Summary ===')
    lines.push(`Total Trips,${totalTrips}`)
    lines.push(`Total Passengers,${totalPassengers}`)
    lines.push(`Active Routes,${activeRoutes}`)
    lines.push('')



    // Incidents
    lines.push('=== Recent Incidents ===')
    lines.push('Date,Type,Description,Driver ID')
    reports.forEach((r) =>
      lines.push(`${formatDate(r.createdAt)},${r.type},"${r.description}",${r.driverId}`)
    )
    lines.push('')

    // Complaints
    lines.push('=== Complaints ===')
    lines.push('Date,Status,Description,Trip ID')
    complaints.forEach((c) =>
      lines.push(`${formatDate(c.createdAt)},${c.status},"${c.description}",${c.tripId}`)
    )

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Exported', description: 'Report downloaded as CSV.' })
  }

  /* ═══════════════════ Render ═══════════════════ */

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">
            Real-time operational reports from Firestore
          </p>
        </div>
        <Button
          onClick={exportCSV}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Time Filter */}
      <div className="flex gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <SelectTrigger className="w-48 border-border bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>
        {loading && <span className="text-sm text-muted-foreground self-center ml-2">Loading...</span>}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Total Trips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {loading ? '—' : totalTrips.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total Passengers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {loading ? '—' : totalPassengers.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Active Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {loading ? '—' : activeRoutes}
            </div>
            <p className="text-xs text-muted-foreground">{routes.length} total routes</p>
          </CardContent>
        </Card>
      </div>


      {/* Recent Incidents */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Recent Incidents
          </CardTitle>
          <CardDescription>
            From the <code className="text-xs bg-muted px-1 py-0.5 rounded">reports</code> collection
            ({reports.length} in period)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No incidents for this period</p>
          ) : (
            <div className="space-y-3">
              {reports.slice(0, 10).map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-4 rounded-lg border border-border/50 p-4 hover:bg-sidebar-accent transition-colors"
                >
                  <Badge variant="outline" className={
                    r.type === 'emergency' || r.type === 'accident'
                      ? 'bg-red-500/20 text-red-400 border-red-500/50'
                      : r.type === 'delay'
                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                        : 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  }>
                    {r.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{r.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatDate(r.createdAt)}</span>
                      {r.driverId && <span>Driver: {r.driverId.slice(0, 8)}...</span>}
                      {r.tripId && <span>Trip: {r.tripId.slice(0, 8)}...</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Complaints */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Complaints
          </CardTitle>
          <CardDescription>
            From the <code className="text-xs bg-muted px-1 py-0.5 rounded">complaints</code> collection
            ({complaints.length} in period)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complaints.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No complaints for this period</p>
          ) : (
            <div className="space-y-3">
              {complaints.slice(0, 10).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-4 rounded-lg border border-border/50 p-4 hover:bg-sidebar-accent transition-colors"
                >
                  <Badge variant="outline" className={
                    c.status === 'open' || c.status === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                      : c.status === 'resolved' || c.status === 'closed'
                        ? 'bg-green-500/20 text-green-400 border-green-500/50'
                        : 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                  }>
                    {c.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{c.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatDate(c.createdAt)}</span>
                      {c.tripId && <span>Trip: {c.tripId.slice(0, 8)}...</span>}
                      {c.assignedTo && <span>Assigned: {c.assignedTo.slice(0, 8)}...</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
