'use client'

import { useEffect, useRef, useCallback } from 'react'
import { ref, onValue, off } from 'firebase/database'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, rtdb } from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────
//  useAutoTrips — Monitors driver sessions & shuttle status
//  to automatically create/end trips.
//
//  This hook is meant to be used in a top-level component
//  (e.g., the trips page or the layout) to enable automatic
//  trip lifecycle management.
//
//  Trip Start: Driver logs in (isOnline=true) + Shuttle active
//  Trip End: Driver logs out (isOnline=false)
// ─────────────────────────────────────────────────────────────

interface DriverSession {
  driverId: string
  shuttleId: string
  shuttleNumber?: string
  plateNumber?: string
  driverName?: string
  name?: string
  driverEmployeeId?: string
  employeeId?: string
  isOnline: boolean
  activeTripId?: string
}

export function useAutoTrips() {
  const activeTripMap = useRef<Map<string, string>>(new Map()) // driverId → tripId

  useEffect(() => {
    // Listen to driver_sessions in RTDB
    const sessionsRef = ref(rtdb, 'driver_sessions')

    const handler = onValue(sessionsRef, async (snapshot) => {
      const sessions = snapshot.val() as Record<string, DriverSession> | null
      if (!sessions) return

      for (const [driverId, session] of Object.entries(sessions)) {
        if (!session) continue

        const existingTripId = activeTripMap.current.get(driverId)

        if (session.isOnline && !existingTripId) {
          // Driver just came online — create a trip
          try {
            const res = await fetch('/api/trips', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shuttleId: session.shuttleId,
                plateNumber: session.plateNumber || session.shuttleNumber || 'Unknown',
                driverId: driverId,
                driverName: session.driverName || session.name || 'Unknown',
                driverEmployeeId: session.driverEmployeeId || session.employeeId || '',
              }),
            })
            const data = await res.json()
            if (res.ok && data.tripId) {
              activeTripMap.current.set(driverId, data.tripId)
              console.log(`[useAutoTrips] Trip started: ${data.tripId} for driver ${driverId}`)
            }
          } catch (err) {
            console.error('[useAutoTrips] Failed to create trip:', err)
          }
        } else if (!session.isOnline && existingTripId) {
          // Driver went offline — end the trip
          try {
            await fetch(`/api/trips/${existingTripId}/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
            activeTripMap.current.delete(driverId)
            console.log(`[useAutoTrips] Trip ended: ${existingTripId} for driver ${driverId}`)
          } catch (err) {
            console.error('[useAutoTrips] Failed to end trip:', err)
          }
        }
      }
    })

    return () => off(sessionsRef, 'value', handler)
  }, [])

  // Also check for active in-progress trips on mount so we don't create duplicates
  useEffect(() => {
    const q = query(collection(db, 'trips'), where('status', '==', 'in-progress'))
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        if (data.driverId && !activeTripMap.current.has(data.driverId)) {
          activeTripMap.current.set(data.driverId, doc.id)
        }
      })
    })
    return () => unsub()
  }, [])

  return null // This hook doesn't return data — it runs side effects
}
