'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { STATIONS } from '@/lib/university-graph'
import { getHaversineDistance } from '@/lib/university-graph'
import { useShuttleRequests, type RequestStatus } from './useShuttleRequests'
import { useLiveShuttles, type LiveShuttle } from './useLiveShuttles'
import { rtdb } from '@/lib/firebase'
import { ref, update } from 'firebase/database'
import { calculateRoute, type RoutePoint, type SnapInfo } from '@/lib/route-engine'

export interface DynamicStop {
  stationId: string
  stationName: string
  lat: number
  lng: number
  distanceFromShuttle: number
  type: 'pickup' | 'dropoff' | 'both'
  requestCount: number
}

export interface UseDynamicRoutingReturn {
  stopQueue: DynamicStop[]
  currentStop: DynamicStop | null
  routePath: RoutePoint[]
  distanceToCurrentStop: number
  completedStopIds: string[]
  isRouteLoading: boolean
  error: string | null
  routeSnapInfo: SnapInfo | null
}

const ARRIVAL_THRESHOLD = 20

function isWaiting(status: string): boolean {
  return status === 'pending' || status === 'active'
}

function isOnboard(status: string): boolean {
  return status === 'onboard'
}

function buildCandidates(
  shuttleLat: number,
  shuttleLng: number,
  requests: { fromId?: string; toId?: string; status: string }[],
): DynamicStop[] {
  const stationInfo = new Map<string, { pickupCount: number; dropoffCount: number }>()

  requests.filter(r => isWaiting(r.status)).forEach(req => {
    if (req.fromId) {
      const info = stationInfo.get(req.fromId) ?? { pickupCount: 0, dropoffCount: 0 }
      info.pickupCount++
      stationInfo.set(req.fromId, info)
    }
  })

  requests.filter(r => isOnboard(r.status)).forEach(req => {
    if (req.toId) {
      const info = stationInfo.get(req.toId) ?? { pickupCount: 0, dropoffCount: 0 }
      info.dropoffCount++
      stationInfo.set(req.toId, info)
    }
  })

  if (stationInfo.size === 0) return []

  const stops: DynamicStop[] = []
  stationInfo.forEach((info, stationId) => {
    const station = STATIONS.find(s => s.id === stationId)
    if (!station) return

    const distance = getHaversineDistance(shuttleLat, shuttleLng, station.lat, station.lng)

    let type: DynamicStop['type'] = 'pickup'
    if (info.pickupCount > 0 && info.dropoffCount > 0) type = 'both'
    else if (info.dropoffCount > 0) type = 'dropoff'

    stops.push({
      stationId,
      stationName: station.name,
      lat: station.lat,
      lng: station.lng,
      distanceFromShuttle: Math.round(distance),
      type,
      requestCount: info.pickupCount + info.dropoffCount,
    })
  })

  stops.sort((a, b) => a.distanceFromShuttle - b.distanceFromShuttle)
  return stops
}

export function useDynamicRouting(): UseDynamicRoutingReturn {
  const { requests } = useShuttleRequests()
  const { shuttles } = useLiveShuttles()

  const [stopQueue, setStopQueue] = useState<DynamicStop[]>([])
  const [currentStop, setCurrentStop] = useState<DynamicStop | null>(null)
  const [routePath, setRoutePath] = useState<RoutePoint[]>([])
  const [completedStopIds, setCompletedStopIds] = useState<string[]>([])
  const completedRef = useRef<string[]>([])
  const [isRouteLoading, setIsRouteLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routeSnapInfo, setRouteSnapInfo] = useState<SnapInfo | null>(null)

  const lastArrivalRef = useRef<string | null>(null)
  const shuttleRef = useRef<LiveShuttle | null>(null)

  const activeShuttle: LiveShuttle | null = shuttles[0] ?? null
  shuttleRef.current = activeShuttle

  const completeTrip = useCallback((requestsToMark: typeof requests) => {
    requestsToMark.forEach(req => {
      update(ref(rtdb, `shuttle_requests/${req.id}`), { status: 'done' })
    })
  }, [])

  const boardPassengers = useCallback((requestsToMark: typeof requests) => {
    requestsToMark.forEach(req => {
      update(ref(rtdb, `shuttle_requests/${req.id}`), { status: 'onboard' })
    })
  }, [])

  const processArrival = useCallback((arrivedStop: DynamicStop, currentRequests: typeof requests) => {
    const shuttle = shuttleRef.current
    if (!shuttle) return

    const waitingAtStation = currentRequests.filter(
      r => r.fromId === arrivedStop.stationId && isWaiting(r.status)
    )
    const onboardToStation = currentRequests.filter(
      r => r.toId === arrivedStop.stationId && isOnboard(r.status)
    )

    lastArrivalRef.current = arrivedStop.stationId

    if (waitingAtStation.length > 0) {
      console.log(`[DynamicRouting] Pickup Station Reached: ${arrivedStop.stationName} (${waitingAtStation.length} passenger(s))`)
      boardPassengers(waitingAtStation)
      console.log(`[DynamicRouting] Passenger Boarded — ${waitingAtStation.length} request(s) → onboard`)
      console.log(`[DynamicRouting] Destination Activated — ${waitingAtStation.map(r => r.toId ? (STATIONS.find(s => s.id === r.toId)?.name ?? r.toId) : '?').join(', ')}`)
    }

    if (onboardToStation.length > 0) {
      console.log(`[DynamicRouting] Dropoff Reached: ${arrivedStop.stationName} (${onboardToStation.length} passenger(s))`)
      completeTrip(onboardToStation)
      console.log(`[DynamicRouting] Trip Completed — ${onboardToStation.length} request(s) → done`)
    }

    if (!completedRef.current.includes(arrivedStop.stationId)) {
      completedRef.current = [...completedRef.current, arrivedStop.stationId]
      setCompletedStopIds(completedRef.current)
    }

    const processedIds = new Set([
      ...waitingAtStation.map(r => r.id),
      ...onboardToStation.map(r => r.id),
    ])

    const effectiveRequests = currentRequests.map(r => {
      if (processedIds.has(r.id)) {
        if (waitingAtStation.some(p => p.id === r.id)) return { ...r, status: 'onboard' as const }
        if (onboardToStation.some(p => p.id === r.id)) return { ...r, status: 'done' as const }
      }
      return r
    })

    const newQueue = buildCandidates(shuttle.lat, shuttle.lng, effectiveRequests)
    setStopQueue(newQueue)

    console.log(`[DynamicRouting] Candidate Stations Updated — ${newQueue.length} candidate(s)`)

    if (newQueue.length === 0) {
      console.log(`[DynamicRouting] Queue empty — all trips completed`)
      setCurrentStop(null)
      setRoutePath([])
      return
    }

    const nextStop = newQueue[0]
    setCurrentStop(nextStop)

    const label = nextStop.type === 'pickup' ? 'Pickup' : nextStop.type === 'dropoff' ? 'Dropoff' : 'Pickup/Dropoff'
    console.log(`[DynamicRouting] Next Destination Selected — ${label}: ${nextStop.stationName} (${nextStop.distanceFromShuttle}m)`)

    setIsRouteLoading(true)
    try {
      const result = calculateRoute(shuttle.lat, shuttle.lng, nextStop.stationId)
      setRouteSnapInfo(result.snap ?? null)
      if (result.path.length > 0) {
        setRoutePath(result.path)
        console.log(`[DynamicRouting] Route Recalculated — ${nextStop.stationName}: ${result.nodePath.join(' → ')}, ${result.distance}m`)
      } else {
        setRoutePath([])
        console.warn(`[DynamicRouting] Route Recalculated — No campus path to ${nextStop.stationName}`)
      }
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Route calculation failed'
      console.error(`[DynamicRouting] Route Recalculated — Error: ${msg}`)
      setError(msg)
    } finally {
      setIsRouteLoading(false)
    }
  }, [boardPassengers, completeTrip])

  useEffect(() => {
    if (!activeShuttle) {
      setStopQueue([])
      setCurrentStop(null)
      setRoutePath([])
      setCompletedStopIds([])
      completedRef.current = []
      lastArrivalRef.current = null
      return
    }

    const sLat = activeShuttle.lat
    const sLng = activeShuttle.lng

    console.log(`[DynamicRouting] Total Requests — ${requests.length}`)
    console.log(`[DynamicRouting] Requests Loaded — ${requests.map(r => `${r.id.slice(0, 8)}(${r.status})`).join(', ')}`)

    const statusCounts: Record<string, number> = {}
    requests.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1 })
    console.log(`[DynamicRouting] Request Statuses — ${Object.entries(statusCounts).map(([s, c]) => `${s}:${c}`).join(', ')}`)

    const waiting = requests.filter(r => isWaiting(r.status))
    const onboard = requests.filter(r => isOnboard(r.status))
    console.log(`[DynamicRouting] Waiting Requests — ${waiting.length}`)
    console.log(`[DynamicRouting] Onboard Requests — ${onboard.length}`)

    const queue = buildCandidates(sLat, sLng, requests)
    setStopQueue(queue)

    console.log(`[DynamicRouting] Queue Built — ${queue.length} candidate(s)`)
    queue.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.stationName} (${s.type}) — ${s.distanceFromShuttle}m, ${s.requestCount} req(s)`)
    })

    if (queue.length === 0) {
      setCurrentStop(null)
      setRoutePath([])
      lastArrivalRef.current = null
      return
    }

    const firstStop = queue[0]
    setCurrentStop(firstStop)

    const dist = getHaversineDistance(sLat, sLng, firstStop.lat, firstStop.lng)

    if (dist <= ARRIVAL_THRESHOLD) {
      if (lastArrivalRef.current === firstStop.stationId) return
      processArrival(firstStop, requests)
      return
    }

    lastArrivalRef.current = null

    if (firstStop.stationId === currentStop?.stationId && routePath.length > 0) return

    setIsRouteLoading(true)

    const label = firstStop.type === 'pickup' ? 'Pickup' : firstStop.type === 'dropoff' ? 'Dropoff' : 'Pickup/Dropoff'
    console.log(`[DynamicRouting] Route Recalculated: ${label} → ${firstStop.stationName}`)

    try {
      const result = calculateRoute(sLat, sLng, firstStop.stationId)
      setRouteSnapInfo(result.snap ?? null)
      if (result.path.length > 0) {
        setRoutePath(result.path)
        console.log(`[DynamicRouting]   Path: ${result.nodePath.join(' → ')}, ${result.distance}m`)
      } else {
        setRoutePath([])
        console.warn(`[DynamicRouting]   No campus path to ${firstStop.stationName}`)
      }
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Route calculation failed'
      console.error(`[DynamicRouting] Route error: ${msg}`)
      setError(msg)
    } finally {
      setIsRouteLoading(false)
    }
  }, [activeShuttle?.lat, activeShuttle?.lng, activeShuttle?.user_id, requests, currentStop?.stationId, routePath.length, processArrival])

  const distanceToCurrentStop = currentStop && activeShuttle
    ? getHaversineDistance(activeShuttle.lat, activeShuttle.lng, currentStop.lat, currentStop.lng)
    : 0

  return {
    stopQueue,
    currentStop,
    routePath,
    distanceToCurrentStop,
    completedStopIds,
    isRouteLoading,
    error,
    routeSnapInfo,
  }
}
