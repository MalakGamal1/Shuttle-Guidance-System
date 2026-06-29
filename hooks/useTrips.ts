'use client'

import { useEffect, useState, useCallback } from 'react'
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore'
import { ref, onValue, off } from 'firebase/database'
import { db, rtdb } from '@/lib/firebase'
import type { Trip, TripFilters, ShuttleTripGroup, TripDashboardStats } from '@/types/trip-types'

// ─────────────────────────────────────────────────────────────
//  Helper — parse Firestore timestamp to ISO string
// ─────────────────────────────────────────────────────────────
function parseTimestamp(ts: any): string | null {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseDate(ts: any): string | null {
  const iso = parseTimestamp(ts)
  return iso ? iso.split('T')[0] : null
}

// ─────────────────────────────────────────────────────────────
//  Types for internal use
// ─────────────────────────────────────────────────────────────
interface ShuttleData {
  id: string
  plateNumber: string
  model?: string
  isActive: boolean
}

interface DriverSessionData {
  driverId: string
  shuttleId: string
  isOnline: boolean
  plateNumber?: string
  driverName?: string
  driverEmployeeId?: string
}

// ─────────────────────────────────────────────────────────────
//  useTrips — Real-time trip listener with filtering & grouping
// ─────────────────────────────────────────────────────────────
export function useTrips(filters?: TripFilters) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'trips'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let data: Trip[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            shuttleId: d.shuttleId || '',
            plateNumber: d.plateNumber || d.shuttleNumber || '',
            driverId: d.driverId || '',
            driverName: d.driverName || '',
            driverEmployeeId: d.driverEmployeeId || '',
            startTime: d.startTime,
            startDate: d.startDate || parseDate(d.startTime) || '',
            endTime: d.endTime || null,
            endDate: d.endDate || parseDate(d.endTime),
            duration: d.duration ?? null,
            status: d.status || 'in-progress',
            startStationId: d.startStationId || null,
            startStationName: d.startStationName || null,
            startLat: d.startLat ?? null,
            startLng: d.startLng ?? null,
            endStationId: d.endStationId || null,
            endStationName: d.endStationName || null,
            endLat: d.endLat ?? null,
            endLng: d.endLng ?? null,
            totalPassengers: d.totalPassengers ?? 0,
            totalRequests: d.totalRequests ?? 0,
            totalDistance: d.totalDistance ?? 0,
            createdAt: d.createdAt,
          }
        })

        // Apply client-side filters
        if (filters) {
          if (filters.shuttleId) {
            data = data.filter(t => t.shuttleId === filters.shuttleId)
          }
          if (filters.driverId) {
            data = data.filter(t => t.driverId === filters.driverId)
          }
          if (filters.status && filters.status !== 'all') {
            data = data.filter(t => t.status === filters.status)
          }
          if (filters.date) {
            data = data.filter(t => t.startDate === filters.date)
          }
          if (filters.dateFrom) {
            data = data.filter(t => t.startDate >= filters.dateFrom!)
          }
          if (filters.dateTo) {
            data = data.filter(t => t.startDate <= filters.dateTo!)
          }
          if (filters.search) {
            const q = filters.search.toLowerCase()
            data = data.filter(t =>
              t.plateNumber.toLowerCase().includes(q) ||
              t.driverName.toLowerCase().includes(q) ||
              t.driverEmployeeId.toLowerCase().includes(q) ||
              t.id.toLowerCase().includes(q)
            )
          }
        }

        setTrips(data)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('[useTrips] Firestore listener error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [filters?.shuttleId, filters?.driverId, filters?.status, filters?.date, filters?.dateFrom, filters?.dateTo, filters?.search])

  return { trips, loading, error }
}

// ─────────────────────────────────────────────────────────────
//  useGroupedTrips — Group trips by shuttle for shuttle-centric view
// ─────────────────────────────────────────────────────────────
export function useGroupedTrips(trips: Trip[]): ShuttleTripGroup[] {
  const [shuttleMap, setShuttleMap] = useState<Map<string, ShuttleData>>(new Map())

  // Load shuttle metadata
  useEffect(() => {
    const q = query(collection(db, 'shuttles'))
    const unsub = onSnapshot(q, (snap) => {
      const map = new Map<string, ShuttleData>()
      snap.docs.forEach(d => {
        const data = d.data()
        map.set(d.id, {
          id: d.id,
          plateNumber: data.plateNumber || '',
          model: data.model || '',
          isActive: data.isActive ?? true,
        })
      })
      setShuttleMap(map)
    })
    return () => unsub()
  }, [])

  // Group trips by shuttleId
  const grouped: ShuttleTripGroup[] = []
  const groupMap = new Map<string, Trip[]>()

  trips.forEach(trip => {
    const key = trip.shuttleId || 'unknown'
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(trip)
  })

  groupMap.forEach((tripList, shuttleId) => {
    const shuttle = shuttleMap.get(shuttleId)
    grouped.push({
      shuttleId,
      plateNumber: shuttle?.plateNumber || tripList[0]?.plateNumber || 'Unknown',
      shuttleModel: shuttle?.model || '',
      trips: tripList,
      totalTrips: tripList.length,
      totalPassengers: tripList.reduce((sum, t) => sum + t.totalPassengers, 0),
    })
  })

  // Sort by shuttle number
  grouped.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber))

  return grouped
}

// ─────────────────────────────────────────────────────────────
//  useTripDashboardStats — Compute dashboard KPI stats
// ─────────────────────────────────────────────────────────────
export function useTripDashboardStats(trips: Trip[]): TripDashboardStats {
  const [activeDrivers, setActiveDrivers] = useState(0)

  // Listen to driver_sessions for active drivers count
  useEffect(() => {
    const sessionsRef = ref(rtdb, 'driver_sessions')
    const handler = onValue(sessionsRef, (snapshot) => {
      const val = snapshot.val()
      if (!val) { setActiveDrivers(0); return }
      let count = 0
      Object.values(val).forEach((session: any) => {
        if (session?.isOnline) count++
      })
      setActiveDrivers(count)
    }, () => { setActiveDrivers(0) })

    return () => off(sessionsRef, 'value', handler)
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const activeShuttles = new Set(
    trips.filter(t => t.status === 'in-progress').map(t => t.shuttleId)
  ).size

  const todayTrips = trips.filter(t => t.startDate === today)
  const completedTripsToday = todayTrips.filter(t => t.status === 'completed').length
  const totalPassengersToday = todayTrips.reduce((sum, t) => sum + t.totalPassengers, 0)

  const weekTrips = trips.filter(t => t.startDate >= weekAgo && t.status === 'completed')
  const totalTripsThisWeek = weekTrips.length

  const completedWithDuration = trips.filter(t => t.status === 'completed' && t.duration != null && t.duration > 0)
  const averageTripDuration = completedWithDuration.length > 0
    ? Math.round(completedWithDuration.reduce((sum, t) => sum + (t.duration || 0), 0) / completedWithDuration.length)
    : 0

  return {
    activeShuttles,
    completedTripsToday,
    totalPassengersToday,
    totalTripsThisWeek,
    averageTripDuration,
    activeDrivers,
  }
}

// ─────────────────────────────────────────────────────────────
//  Legacy compat: formatTimestamp
// ─────────────────────────────────────────────────────────────
export function formatTimestamp(ts: any): string {
  if (!ts) return 'N/A'
  if (typeof ts === 'string') {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    return 'N/A'
  }
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  }
  const d = new Date(ts)
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return 'N/A'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return 'N/A'
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}
