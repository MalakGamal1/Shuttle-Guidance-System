'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Calendar, Download, TrendingUp } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const tripData = [
  { day: 'Mon', completed: 38, cancelled: 2, pending: 4 },
  { day: 'Tue', completed: 42, cancelled: 1, pending: 3 },
  { day: 'Wed', completed: 35, cancelled: 3, pending: 6 },
  { day: 'Thu', completed: 45, cancelled: 2, pending: 2 },
  { day: 'Fri', completed: 48, cancelled: 1, pending: 1 },
  { day: 'Sat', completed: 28, cancelled: 2, pending: 5 },
  { day: 'Sun', completed: 20, cancelled: 1, pending: 4 },
]

const capacityData = [
  { day: 'Mon', utilization: 75 },
  { day: 'Tue', utilization: 82 },
  { day: 'Wed', utilization: 68 },
  { day: 'Thu', utilization: 88 },
  { day: 'Fri', utilization: 92 },
  { day: 'Sat', utilization: 45 },
  { day: 'Sun', utilization: 38 },
]

const routeDistribution = [
  { name: 'North Campus', value: 28, color: '#06b6d4' },
  { name: 'South Campus', value: 24, color: '#0891b2' },
  { name: 'Medical Center', value: 19, color: '#06d6a0' },
  { name: 'Athletic Complex', value: 16, color: '#0ea5e9' },
  { name: 'Library', value: 13, color: '#6366f1' },
]

const metrics = [
  { label: 'Total Trips', value: '1,456', change: '+8.2%' },
  { label: 'Total Bookings', value: '1,523', change: '+12.5%' },
  { label: 'Active Passengers', value: '1,247', change: '+5.3%' },
]

const bookingsByRoute = [
  { route: 'Route A', bookings: 345 },
  { route: 'Route B', bookings: 289 },
  { route: 'Route C', bookings: 401 },
  { route: 'Route D', bookings: 198 },
  { route: 'Route E', bookings: 234 },
]

export default function AnalyticsPage() {
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">Performance metrics and insights</p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="week">
            <SelectTrigger className="w-32 border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">This Day</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-border hover:bg-sidebar-accent bg-transparent">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{metric.value}</div>
              <p className="mt-2 text-xs text-primary">{metric.change} from last week</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trip Status Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Trip Status Overview</CardTitle>
            <CardDescription>Weekly trip completion statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tripData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="completed" stackId="a" fill="#06b6d4" />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" />
                <Bar dataKey="cancelled" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Capacity Utilization Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Capacity Utilization</CardTitle>
            <CardDescription>Average seat usage percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={capacityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line
                  type="monotone"
                  dataKey="utilization"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ fill: '#06b6d4', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bookings by Route */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Bookings by Route</CardTitle>
          <CardDescription>Distribution of bookings across routes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bookingsByRoute}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="route" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="bookings" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Distribution and Details */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Route Distribution */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Route Distribution</CardTitle>
            <CardDescription>Trips per route this week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={routeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {routeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Top Routes */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Top Performing Routes</CardTitle>
              <CardDescription>By on-time performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { route: 'Athletic Complex', onTime: '97.2%', trips: 124 },
                  { route: 'North Campus', onTime: '95.8%', trips: 156 },
                  { route: 'Medical Center', onTime: '93.5%', trips: 108 },
                  { route: 'South Campus', onTime: '92.1%', trips: 142 },
                ].map((route) => (
                  <div
                    key={route.route}
                    className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:bg-sidebar-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{route.route}</p>
                      <p className="text-xs text-muted-foreground">{route.trips} trips</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-primary">{route.onTime}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
