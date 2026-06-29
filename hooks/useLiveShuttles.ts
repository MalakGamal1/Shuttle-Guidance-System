'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface LiveShuttle {
  user_id:    string
  lat:        number
  lng:        number
  updated_at: string
  plateNumber: string
  driverName: string
  status:     string
  model?:     string
  capacity?:  number
}

// ─────────────────────────────────────────────────────────────
//  Hook — listens to Firestore shuttles & driver users in real time
// ─────────────────────────────────────────────────────────────
export function useLiveShuttles(intervalMs?: number) {
  const [shuttles, setShuttles] = useState<LiveShuttle[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    // 1. Listen to active shuttles in Firestore
    const shuttlesQuery = query(collection(db, 'shuttles'), where('isActive', '==', true))
    
    // 2. Listen to driver profile metadata in users collection
    const driversQuery = query(collection(db, 'users'), where('role', '==', 'driver'))

    let rawShuttles: any[] = []
    let rawDrivers: any[] = []

    const mergeAndSet = () => {
      const merged: LiveShuttle[] = rawShuttles
        .map((shuttle) => {
          if (shuttle.lat == null || shuttle.lng == null) {
            return null
          }

          // Cross-reference driver name from users collection
          const assignedDriver = rawDrivers.find((d) => d.vehicleAssigned === shuttle.id)
          const driverName = assignedDriver?.fullName || assignedDriver?.name || 'Unknown Driver'

          // Get last location timestamp
          let updated_at = new Date().toISOString()
          const ts = shuttle.updatedAt ?? shuttle.lastUpdated
          if (ts) {
            const date = ts.toDate ? ts.toDate() : new Date(ts)
            updated_at = date.toISOString()
          }

          return {
            user_id: shuttle.id,
            lat: shuttle.lat,
            lng: shuttle.lng,
            updated_at,
            plateNumber: shuttle.plateNumber || 'Unknown',
            driverName,
            status: shuttle.status || 'active',
            model: shuttle.model,
            capacity: shuttle.capacity,
          }
        })
        .filter((s) => s !== null) as LiveShuttle[]

      setShuttles(merged)
      setLoading(false)
    }

    const unsubShuttles = onSnapshot(shuttlesQuery, (snapshot) => {
      rawShuttles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      mergeAndSet()
    }, (err) => {
      console.error('[useLiveShuttles] Shuttles listener error:', err)
      setError(err.message)
      setLoading(false)
    })

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      rawDrivers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      mergeAndSet()
    }, (err) => {
      console.error('[useLiveShuttles] Drivers listener error:', err)
    })

    return () => {
      unsubShuttles()
      unsubDrivers()
    }
  }, [])

  return { shuttles, loading, error }
}
