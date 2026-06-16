'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface TripStop {
  stationId: string
  stationName: string
  type: 'pickup' | 'dropoff'
  passengers: number
}

export interface Trip {
  id: string
  shuttleId: string
  plateNumber: string
  driverName: string
  stops: TripStop[]
  totalPassengers: number
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
  startTime: any
  endTime: any
  createdAt: any
}

// ─────────────────────────────────────────────────────────────
//  Hook — realtime Firestore listener on trips collection
// ─────────────────────────────────────────────────────────────
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'trips'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: Trip[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            shuttleId: d.shuttleId || '',
            plateNumber: d.plateNumber || 'Unknown',
            driverName: d.driverName || 'Unknown',
            stops: d.stops || [],
            totalPassengers: d.totalPassengers ?? 0,
            status: d.status || 'scheduled',
            startTime: d.startTime,
            endTime: d.endTime,
            createdAt: d.createdAt,
          }
        })
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
  }, [])

  return { trips, loading, error }
}

// ─────────────────────────────────────────────────────────────
//  Helper — create a new trip document in Firestore
// ─────────────────────────────────────────────────────────────
export async function createTrip(data: {
  shuttleId: string
  plateNumber: string
  driverName: string
  stops: TripStop[]
  totalPassengers: number
  status?: string
}) {
  return addDoc(collection(db, 'trips'), {
    ...data,
    status: data.status || 'in-progress',
    startTime: serverTimestamp(),
    endTime: null,
    createdAt: serverTimestamp(),
  })
}

// ─────────────────────────────────────────────────────────────
//  Helper — update trip status
// ─────────────────────────────────────────────────────────────
export async function updateTripStatus(tripId: string, status: string) {
  const updates: Record<string, any> = { status }
  if (status === 'completed' || status === 'cancelled') {
    updates.endTime = serverTimestamp()
  } else if (status === 'in-progress') {
    updates.startTime = serverTimestamp()
  }
  return updateDoc(doc(db, 'trips', tripId), updates)
}
