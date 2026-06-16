'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface FirebaseStation {
  id: string
  name: string
  lat: number
  lng: number
  isActive: boolean
  expectedPassengersPerDay: number
}

// ─────────────────────────────────────────────────────────────
//  Hook — realtime Firestore listener on stations collection
// ─────────────────────────────────────────────────────────────
export function useFirebaseStations() {
  const [stations, setStations] = useState<FirebaseStation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'stations'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: FirebaseStation[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            name: d.name || '',
            lat: typeof d.lat === 'number' ? d.lat : 0,
            lng: typeof d.lng === 'number' ? d.lng : 0,
            isActive: d.isActive ?? true,
            expectedPassengersPerDay: d.expectedPassengersPerDay ?? 0,
          }
        })
        setStations(data)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('[useFirebaseStations] Firestore listener error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  return { stations, loading, error }
}
