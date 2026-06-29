'use client'

import { useState, useEffect } from 'react'
import { doc, collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Trip, TripStationHistory, TripLocationHistory, TripStatistics } from '@/types/trip-types'

export interface TripDetailsData {
  trip: Trip | null
  stationHistory: TripStationHistory[]
  locationHistory: TripLocationHistory[]
  statistics: TripStatistics | null
}

export function useTripDetails(tripId: string | null) {
  const [data, setData] = useState<TripDetailsData>({
    trip: null,
    stationHistory: [],
    locationHistory: [],
    statistics: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) {
      setData({ trip: null, stationHistory: [], locationHistory: [], statistics: null })
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Listen to main trip doc
    const tripRef = doc(db, 'trips', tripId)
    const unsubTrip = onSnapshot(
      tripRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setError('Trip not found')
          setLoading(false)
          return
        }

        const d = docSnap.data()
        const trip: Trip = {
          id: docSnap.id,
          shuttleId: d.shuttleId || '',
          plateNumber: d.plateNumber || d.shuttleNumber || '',
          driverId: d.driverId || '',
          driverName: d.driverName || '',
          driverEmployeeId: d.driverEmployeeId || '',
          startTime: d.startTime,
          startDate: d.startDate || '',
          endTime: d.endTime || null,
          endDate: d.endDate || null,
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

        setData((prev) => {
          // Recalculate statistics using updated trip doc and stationHistory
          const stats: TripStatistics = {
            tripId,
            totalPassengers: trip.totalPassengers,
            uniquePassengers: trip.totalPassengers, // approximation
            totalRequests: trip.totalRequests,
            acceptedRequests: trip.totalRequests,
            completedRequests: trip.status === 'completed' ? trip.totalRequests : 0,
            stationsVisited: prev.stationHistory.length,
            totalDistance: trip.totalDistance,
            avgStopDuration: prev.stationHistory.length > 0
              ? prev.stationHistory.reduce((sum, s) => {
                  if (s.arrivalTime && s.departureTime) {
                    const start = typeof s.arrivalTime.toDate === 'function' ? s.arrivalTime.toDate().getTime() : new Date(s.arrivalTime).getTime()
                    const end = typeof s.departureTime.toDate === 'function' ? s.departureTime.toDate().getTime() : new Date(s.departureTime).getTime()
                    if (!isNaN(start) && !isNaN(end)) {
                      return sum + (end - start) / 1000
                    }
                  }
                  return sum
                }, 0) / prev.stationHistory.length
              : 0,
          }

          return {
            ...prev,
            trip,
            statistics: stats,
          }
        })
        setLoading(false)
      },
      (err) => {
        console.error('[useTripDetails] Trip doc error:', err)
        setError(err.message)
        setLoading(false)
      }
    )

    // Listen to station_history sub-collection
    const stationRef = query(
      collection(db, 'trips', tripId, 'station_history'),
      orderBy('arrivalTime', 'asc')
    )
    const unsubStation = onSnapshot(
      stationRef,
      (snap) => {
        const stationHistory = snap.docs.map((s) => {
          const sd = s.data()
          return {
            id: s.id,
            tripId,
            stationId: sd.stationId || '',
            stationName: sd.stationName || '',
            arrivalTime: sd.arrivalTime,
            departureTime: sd.departureTime || null,
            passengersBoarded: sd.passengersBoarded ?? 0,
            passengersDropped: sd.passengersDropped ?? 0,
            lat: sd.lat ?? 0,
            lng: sd.lng ?? 0,
          }
        })

        setData((prev) => {
          const trip = prev.trip
          const stats = trip ? {
            tripId,
            totalPassengers: trip.totalPassengers,
            uniquePassengers: trip.totalPassengers,
            totalRequests: trip.totalRequests,
            acceptedRequests: trip.totalRequests,
            completedRequests: trip.status === 'completed' ? trip.totalRequests : 0,
            stationsVisited: stationHistory.length,
            totalDistance: trip.totalDistance,
            avgStopDuration: stationHistory.length > 0
              ? stationHistory.reduce((sum, s) => {
                  if (s.arrivalTime && s.departureTime) {
                    const start = typeof s.arrivalTime.toDate === 'function' ? s.arrivalTime.toDate().getTime() : new Date(s.arrivalTime).getTime()
                    const end = typeof s.departureTime.toDate === 'function' ? s.departureTime.toDate().getTime() : new Date(s.departureTime).getTime()
                    if (!isNaN(start) && !isNaN(end)) {
                      return sum + (end - start) / 1000
                    }
                  }
                  return sum
                }, 0) / stationHistory.length
              : 0,
          } : null

          return {
            ...prev,
            stationHistory,
            statistics: stats,
          }
        })
      },
      (err) => {
        console.error('[useTripDetails] Station history error:', err)
      }
    )

    // Listen to location_history sub-collection
    const locationRef = query(
      collection(db, 'trips', tripId, 'location_history'),
      orderBy('timestamp', 'asc')
    )
    const unsubLocation = onSnapshot(
      locationRef,
      (snap) => {
        const locationHistory = snap.docs.map((l) => {
          const ld = l.data()
          return {
            id: l.id,
            tripId,
            lat: ld.lat ?? 0,
            lng: ld.lng ?? 0,
            timestamp: ld.timestamp,
          }
        })

        setData((prev) => ({
          ...prev,
          locationHistory,
        }))
      },
      (err) => {
        console.error('[useTripDetails] Location history error:', err)
      }
    )

    return () => {
      unsubTrip()
      unsubStation()
      unsubLocation()
    }
  }, [tripId])

  // Keep a dummy refresh function for compatibility with the Page's "Refresh Data" button
  const refresh = () => {}

  return { ...data, loading, error, refresh }
}
