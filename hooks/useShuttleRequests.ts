'use client'

import { useEffect, useState } from 'react'
import { ref, onValue, off, getDatabase } from 'firebase/database'
import app from '@/lib/firebase'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export type RequestStatus = 'pending' | 'active' | 'done'

export interface ShuttleRequest {
  id: string
  userId: string
  fromId: string
  toId: string
  status: RequestStatus
  createdAt: number
}

// ─────────────────────────────────────────────────────────────
//  Hook
// ─────────────────────────────────────────────────────────────
export function useShuttleRequests() {
  const [requests, setRequests] = useState<ShuttleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const db = getDatabase(app)
    const requestsRef = ref(db, 'shuttle_requests')

    onValue(
      requestsRef,
      (snapshot) => {
        try {
          const raw = snapshot.val() as Record<string, Omit<ShuttleRequest, 'id'>> | null

          if (!raw) {
            setRequests([])
            setLoading(false)
            return
          }

          const parsed: ShuttleRequest[] = Object.entries(raw).map(([id, val]) => ({
            id,
            userId:    val.userId    ?? '',
            fromId:    val.fromId    ?? '',
            toId:      val.toId      ?? '',
            status:    (val.status as RequestStatus) ?? 'pending',
            createdAt: val.createdAt ?? 0,
          }))

          // Sort newest first
          parsed.sort((a, b) => b.createdAt - a.createdAt)

          setRequests(parsed)
          setError(null)
        } catch (err) {
          setError('Failed to parse shuttle requests')
          console.error('[useShuttleRequests] parse error:', err)
        } finally {
          setLoading(false)
        }
      },
      (err) => {
        setError(err.message)
        setLoading(false)
        console.error('[useShuttleRequests] Firebase error:', err)
      },
    )

    return () => off(requestsRef, 'value')
  }, [])

  return { requests, loading, error }
}
