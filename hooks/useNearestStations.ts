'use client'

import { useEffect, useState, useRef } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { supabase } from '@/lib/supabase'
import { useShuttleRequests } from './useShuttleRequests'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface NearestStation {
  id:               string
  name:             string
  lat:              number
  lng:              number
  distance_km:      number
  distance_meters:  number
  pendingRequests:  number  // number of requests on this station
}

export interface RoutePoint {
  lat: number
  lng: number
}

export interface ShuttleRoute {
  pathWithCoords: RoutePoint[]
}

export interface CalcRouteResponse {
  pathWithCoords: RoutePoint[]
}

interface UseNearestStationsOptions {
  shuttleLat: number
  shuttleLng: number
  topN?:      number
  enabled?:   boolean  // enable when shuttle is active
}

export interface UseNearestStationsReturn {
  nearestStations: NearestStation[]
  routeData: ShuttleRoute | null
  loading: boolean
  routeLoading: boolean
  error: string | null
  routeError: string | null
}

// ─────────────────────────────────────────────────────────────
//  Hook
// ─────────────────────────────────────────────────────────────
export function useNearestStations({
  shuttleLat,
  shuttleLng,
  topN    = 5,
  enabled = true,
}: UseNearestStationsOptions): UseNearestStationsReturn {
  const [nearestStations, setNearestStations] = useState<NearestStation[]>([])
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)

  const [routeData, setRouteData]             = useState<ShuttleRoute | null>(null)
  const [routeLoading, setRouteLoading]       = useState(false)
  const [routeError, setRouteError]           = useState<string | null>(null)

  const { requests, loading: requestsLoading } = useShuttleRequests()
  
  // Ref to track the last payload sent to prevent duplicate calls
  const lastPayloadRef = useRef<string>('')

  // 1. Fetch nearest stations
  useEffect(() => {
    const supabaseClient = supabase
    if (!enabled || requestsLoading) return
    if (!shuttleLat || !shuttleLng) return
    
    if (!supabaseClient) {
      setError('Supabase is not configured')
      return
    }

    // Filter active requests
    const activeRequests = requests.filter(
      (r) => r.status === 'pending' || r.status === 'active',
    )
    if (activeRequests.length === 0) {
      setNearestStations([])
      return
    }

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch all stations from Firestore
        const snapshot = await getDocs(collection(db, 'stations'))
        const allStations = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as { id: string; name: string; lat: number; lng: number }[]

        const stationIdsWithRequests = new Set<string>()
        const requestCountPerStation: Record<string, number> = {}

        activeRequests.forEach((req) => {
          if (req.fromId) {
            stationIdsWithRequests.add(req.fromId)
            requestCountPerStation[req.fromId] =
              (requestCountPerStation[req.fromId] || 0) + 1
          }
        })

        const stationsWithRequests = allStations.filter(
          (s) =>
            stationIdsWithRequests.has(s.id) &&
            typeof s.lat === 'number' &&
            typeof s.lng === 'number',
        )

        if (stationsWithRequests.length === 0) {
          setNearestStations([])
          return
        }

        // Call Supabase function to get nearest stations
        console.log('[NearestStations] Shuttle coordinates:', { lat: shuttleLat, lng: shuttleLng })
        const { data, error: fnError } = await supabaseClient.functions.invoke<{
          success: boolean
          message?: string
          data: Omit<NearestStation, 'pendingRequests'>[]
        }>('get-nearest-station', {
          body: {
            lat:      shuttleLat,
            lng:      shuttleLng,
            stations: stationsWithRequests.map((s) => ({
              id:   s.id,
              name: s.name,
              lat:  s.lat,
              lng:  s.lng,
            })),
            top_n: topN,
          },
        })

        if (fnError) {
          throw new Error(fnError.message)
        }
        if (!data?.success) {
          throw new Error(data?.message || 'Supabase function error')
        }

        const rawList = Array.isArray(data.data) ? data.data : [data.data]
        const results: NearestStation[] = rawList.map((s) => ({
          ...s,
          pendingRequests: requestCountPerStation[s.id] || 0,
        }))

        console.log('[NearestStations] Nearest station count:', results.length)
        setNearestStations(results)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong'
        console.error('[NearestStations] error:', errMsg)
        setError(errMsg)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [shuttleLat, shuttleLng, requests, requestsLoading, topN, enabled])

  // 2. Fetch shuttle route when shuttle position or nearestStations changes
  useEffect(() => {
    const supabaseClient = supabase
    if (!supabaseClient) return
    if (!shuttleLat || !shuttleLng || nearestStations.length === 0) {
      setRouteData(null)
      return
    }

    const payload = {
      shuttle: {
        lat: shuttleLat,
        lng: shuttleLng,
      },
      stations: nearestStations.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
      })),
    }

    const payloadStr = JSON.stringify(payload)
    if (payloadStr === lastPayloadRef.current) {
      return // Avoid duplicate calls
    }
    lastPayloadRef.current = payloadStr

    const calcRoute = async () => {
      setRouteLoading(true)
      setRouteError(null)

      console.log('[ShuttleRoute] Request payload sent to calc_route_for_shuttle:', payload)

      try {
        const { data, error: routeFnError } = await supabaseClient.functions.invoke<{
          success: boolean
          message?: string
          data: CalcRouteResponse
        }>('calc_route_for_shuttle', {
          body: payload,
        })

        if (routeFnError) {
          throw new Error(routeFnError.message)
        }

        if (!data?.success || !data.data) {
          throw new Error(data?.message || 'Route calculation failed')
        }

        console.log('[ShuttleRoute] Response from function:', data)
        console.log('[ShuttleRoute] Number of route points:', data.data.pathWithCoords.length)

        setRouteData({
          pathWithCoords: data.data.pathWithCoords,
        })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to calculate route'
        console.error('[ShuttleRoute] Error calculating shuttle route:', errMsg)
        setRouteError(errMsg)
      } finally {
        setRouteLoading(false)
      }
    }

    calcRoute()
  }, [shuttleLat, shuttleLng, nearestStations])

  return {
    nearestStations,
    routeData,
    loading: loading || requestsLoading,
    routeLoading,
    error,
    routeError,
  }
}
