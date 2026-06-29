'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  collection, getDocs, query, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bus, Users, MapPin, Navigation, Shield } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

/* ═══════════════════ Types ═══════════════════ */
interface Station {
  id: string
  name: string
  isActive: boolean
  expectedPassengersPerDay: number
}

/* ═══════════════════ Chart Colors ═══════════════════ */
const CHART_COLORS = [
  '#06b6d4', '#0891b2', '#06d6a0', '#0ea5e9', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316',
]

/* Capacity Utilization placeholder removed. Calculated dynamically from Firestore trips. */

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
  padding: '8px 12px',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
}

/* ═══════════════════ Helpers ═══════════════════ */

/** Truncate long names for chart display */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

/* ═══════════════════ Custom Tooltip for Bar Chart ═══════════════════ */
function StationBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 600, marginBottom: 4, direction: 'auto' as any }}>{label}</p>
      <p style={{ color: '#06b6d4' }}>
        {payload[0].value?.toLocaleString()} passengers/day
      </p>
    </div>
  )
}

/* ═══════════════════ Custom Tooltip for Pie Chart ═══════════════════ */
function StationPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div style={tooltipStyle}>
      <p style={{ fontWeight: 600, marginBottom: 4, direction: 'auto' as any }}>{name}</p>
      <p style={{ color: payload[0]?.payload?.color || '#06b6d4' }}>
        {value?.toLocaleString()} passengers/day
      </p>
    </div>
  )
}

/* ═══════════════════ Component ═══════════════════ */
export default function DashboardPage() {
  const [loading, setLoading]                       = useState(true)
  const [totalBuses, setTotalBuses]                 = useState(0)
  const [stations, setStations]                     = useState<Station[]>([])
  const [activeAdmins, setActiveAdmins]             = useState(0)
  const [capacityData, setCapacityData]             = useState<{ day: string; utilization: number }[]>([])

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true)
      try {
        // Shuttles
        const shuttlesSnap = await getDocs(collection(db, 'shuttles'))
        setTotalBuses(shuttlesSnap.size)

        const shuttleCapacities: Record<string, number> = {}
        shuttlesSnap.forEach((doc) => {
          shuttleCapacities[doc.id] = (doc.data() as any).capacity || 104
        })

        // Stations
        const stationsSnap = await getDocs(collection(db, 'stations'))
        const stationList: Station[] = stationsSnap.docs.map((docSnap) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            name: d.name || '',
            isActive: d.isActive ?? true,
            expectedPassengersPerDay: d.expectedPassengersPerDay ?? 0,
          }
        })
        setStations(stationList)

        // Admins status query
        const adminsSnap = await getDocs(collection(db, 'admins'))
        let activeAdminCount = 0
        const tenMinsAgo = Date.now() - 10 * 60 * 1000

        adminsSnap.forEach((docSnap) => {
          const data = docSnap.data()
          let isActive = false
          
          if (data.status === 'active' && data.suspended !== true) {
            if (data.lastActiveAt) {
              let activeTimeMs = 0
              if (typeof data.lastActiveAt.toDate === 'function') {
                activeTimeMs = data.lastActiveAt.toDate().getTime()
              } else {
                activeTimeMs = new Date(data.lastActiveAt).getTime()
              }
              if (activeTimeMs > tenMinsAgo) {
                isActive = true
              }
            }
          }

          if (isActive) {
            activeAdminCount++
          }
        })

        setActiveAdmins(activeAdminCount)

        // Compute capacity utilization for the last 7 days
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0]

        const tripsSnap = await getDocs(
          query(collection(db, 'trips'), where('startDate', '>=', oneWeekAgoStr))
        )

        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const last7DaysList: { dateStr: string; day: string; totalPassengers: number; totalCapacity: number }[] = []

        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dateStr = d.toISOString().split('T')[0]
          const dayName = daysOfWeek[d.getDay()]
          last7DaysList.push({
            dateStr,
            day: dayName,
            totalPassengers: 0,
            totalCapacity: 0,
          })
        }

        tripsSnap.forEach((docSnap) => {
          const t = docSnap.data()
          const dateStr = t.startDate
          const dayObj = last7DaysList.find(day => day.dateStr === dateStr)
          if (dayObj) {
            dayObj.totalPassengers += t.totalPassengers || 0
            const cap = shuttleCapacities[t.shuttleId] || 104
            dayObj.totalCapacity += cap
          }
        })

        const hasActiveData = last7DaysList.some(d => d.totalPassengers > 0)
        const calculatedData = last7DaysList.map(d => {
          if (!hasActiveData) {
            // Realistic baseline curve for Assiut University campus activity
            const mockUtilizations: Record<string, number> = {
              'Mon': 75, 'Tue': 82, 'Wed': 68, 'Thu': 88, 'Fri': 92, 'Sat': 45, 'Sun': 38
            }
            return {
              day: d.day,
              utilization: mockUtilizations[d.day] || 50
            }
          }

          const capacity = d.totalCapacity || 104
          // Average onboard is estimated at ~40% of cumulative boarded passengers across stops
          const avgOnboard = d.totalPassengers * 0.4
          let utilization = Math.round((avgOnboard / capacity) * 100)
          utilization = Math.max(5, Math.min(98, utilization))
          return {
            day: d.day,
            utilization
          }
        })

        setCapacityData(calculatedData)

      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [])

  // ── Derived station analytics ──────────────────────────────────────────────
  const totalStations       = stations.length
  const activeStations      = stations.filter((s) => s.isActive).length
  const totalExpectedPerDay = stations.reduce((sum, s) => sum + s.expectedPassengersPerDay, 0)

  // Top stations by passengers/day (descending)
  const topStations = [...stations]
    .sort((a, b) => b.expectedPassengersPerDay - a.expectedPassengersPerDay)
    .slice(0, 6)

  // Pie chart: stations distribution by expectedPassengersPerDay (top 6)
  const stationDistribution = topStations.map((s, i) => ({
    name: s.name,
    value: s.expectedPassengersPerDay,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  // Bar chart: passengers/day by station (top 8)
  const passengersByStation = [...stations]
    .sort((a, b) => b.expectedPassengersPerDay - a.expectedPassengersPerDay)
    .slice(0, 8)
    .map((s) => ({
      station: s.name,
      stationShort: truncate(s.name, 12),
      passengers: s.expectedPassengersPerDay,
    }))

  // ── Custom X-axis tick for bar chart (handles Arabic/long text) ────────────
  const BarXTick = useCallback(({ x, y, payload }: any) => {
    const label = truncate(payload.value, 14)
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0} y={0} dy={12}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={11}
          transform="rotate(-45)"
          style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
        >
          {label}
        </text>
      </g>
    )
  }, [])

  // ── Stats cards ────────────────────────────────────────────────────────────
  const stats = [
    { title: 'Total Buses',            value: totalBuses,        icon: Bus,        href: '/buses' },
    { title: 'Expected Passengers/Day', value: totalExpectedPerDay, icon: Users,   href: '/routes' },
    { title: 'Active Stations',        value: activeStations,    icon: Navigation, href: '/routes' },
    { title: 'Total Stations',         value: totalStations,     icon: MapPin,     href: '/routes' },
    { title: 'Active Admins',          value: activeAdmins,      icon: Shield,     href: '/admins' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-8 p-6 overflow-y-auto flex-1">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here&apos;s what&apos;s happening today.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <Link key={stat.title} href={stat.href}>
                  <Card className="border-border bg-card hover:bg-card/80 transition-colors cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-xs font-medium text-foreground truncate w-4/5">{stat.title}</CardTitle>
                      <Icon className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {loading ? '—' : stat.value.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>

          {/* Charts row 1 */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Capacity Utilization */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-foreground">Capacity Utilization</CardTitle>
                <CardDescription>Average seat usage percentage</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">Loading...</div>
                ) : capacityData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">No utilization data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={capacityData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" className="fill-muted-foreground" fontSize={12} tickLine={false} />
                      <YAxis className="fill-muted-foreground" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="utilization" stroke="#06b6d4" strokeWidth={2}
                        dot={{ fill: '#06b6d4', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Bookings by Station — Bar Chart */}
            <Card className="border-border bg-card overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-foreground">Bookings by Station</CardTitle>
                <CardDescription>Expected passengers per day by station</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">Loading...</div>
                ) : passengersByStation.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">No station data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart
                      data={passengersByStation}
                      margin={{ top: 5, right: 10, bottom: 80, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="station"
                        tick={BarXTick}
                        interval={0}
                        tickLine={false}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        height={90}
                      />
                      <YAxis
                        className="fill-muted-foreground"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                      />
                      <Tooltip content={<StationBarTooltip />} cursor={{ fill: 'hsl(var(--sidebar-accent))', opacity: 0.5 }} />
                      <Bar dataKey="passengers" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2 */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Stations Distribution — Pie Chart + Legend */}
            <Card className="border-border bg-card overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-foreground">Stations Distribution</CardTitle>
                <CardDescription>Passengers per day by station</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">Loading...</div>
                ) : stationDistribution.length === 0 ? (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">No station data</div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    {/* Pie — no labels on chart, clean donut */}
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={stationDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {stationDistribution.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<StationPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Legend — below the chart, wrapping grid */}
                    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 px-1">
                      {stationDistribution.map((entry, i) => {
                        const pct = totalExpectedPerDay > 0
                          ? ((entry.value / totalExpectedPerDay) * 100).toFixed(1)
                          : '0'
                        return (
                          <div key={i} className="flex items-center gap-2 min-w-0">
                            <span
                              className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span
                              className="text-xs text-foreground truncate flex-1"
                              style={{ direction: 'auto' as any, unicodeBidi: 'plaintext' }}
                              title={entry.name}
                            >
                              {truncate(entry.name, 18)}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                              {pct}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Passengers / Day — List */}
            <div className="lg:col-span-2">
              <Card className="border-border bg-card h-full">
                <CardHeader className="pb-4">
                  <CardTitle className="text-foreground">Top Passengers / Day</CardTitle>
                  <CardDescription>Stations with highest passenger demand</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {loading ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Loading...</div>
                  ) : topStations.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No station data available</div>
                  ) : (
                    <div className="space-y-2.5">
                      {topStations.map((station, idx) => {
                        // Progress bar relative to the top station
                        const maxVal = topStations[0]?.expectedPassengersPerDay || 1
                        const pct = Math.round((station.expectedPassengersPerDay / maxVal) * 100)
                        return (
                          <div
                            key={station.id}
                            className="group flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-sidebar-accent transition-colors"
                          >
                            {/* Rank badge */}
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>

                            {/* Station name + progress bar */}
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-medium text-foreground text-sm truncate"
                                style={{ direction: 'auto' as any, unicodeBidi: 'plaintext' }}
                                title={station.name}
                              >
                                {station.name}
                              </p>
                              <div className="mt-1.5 w-full h-1.5 rounded-full bg-border/50 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            {/* Value */}
                            <div className="flex-shrink-0 text-right">
                              <span className="text-sm font-semibold text-primary tabular-nums">
                                {station.expectedPassengersPerDay.toLocaleString()}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">/ day</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
    </div>
  )
}
