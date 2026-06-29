import { NextRequest, NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/trips/[tripId]/end
 * End a trip — sets endTime, calculates duration, updates status to 'completed'.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    if (!adminApp) {
      return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 })
    }
    const db = getFirestore(adminApp)
    const { tripId } = await params
    const body = await req.json().catch(() => ({}))

    const tripRef = db.collection('trips').doc(tripId)
    const tripDoc = await tripRef.get()

    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
    }

    const tripData = tripDoc.data()!

    if (tripData.status === 'completed') {
      return NextResponse.json({ error: 'Trip is already completed.' }, { status: 400 })
    }

    // Calculate duration
    const startTime = tripData.startTime?.toDate?.()
    const now = new Date()
    const duration = startTime ? Math.round((now.getTime() - startTime.getTime()) / 1000) : 0

    // Get total distance from location history
    const locationSnap = await db
      .collection('trips').doc(tripId)
      .collection('location_history')
      .orderBy('timestamp', 'asc')
      .get()

    let totalDistance = tripData.totalDistance || 0
    if (locationSnap.docs.length >= 2) {
      let dist = 0
      for (let i = 1; i < locationSnap.docs.length; i++) {
        const prev = locationSnap.docs[i - 1].data()
        const curr = locationSnap.docs[i].data()
        dist += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)
      }
      totalDistance = Math.round(dist)
    }

    // Get last station visited
    const lastStationSnap = await db
      .collection('trips').doc(tripId)
      .collection('station_history')
      .orderBy('arrivalTime', 'desc')
      .limit(1)
      .get()

    const lastStation = lastStationSnap.docs[0]?.data()

    const endDate = now.toISOString().split('T')[0]

    await tripRef.update({
      endTime: FieldValue.serverTimestamp(),
      endDate,
      duration,
      status: 'completed',
      totalDistance,
      endStationId: body.endStationId || lastStation?.stationId || null,
      endStationName: body.endStationName || lastStation?.stationName || null,
      endLat: body.endLat ?? lastStation?.lat ?? null,
      endLng: body.endLng ?? lastStation?.lng ?? null,
    })

    // ── Sync shuttle document ─────────────────────────────────────
    // Mark the shuttle as idle so the Web Dashboard hides it
    // (filter: isActive == true) and clears its current trip.
    const shuttleId = tripData.shuttleId
    if (shuttleId) {
      try {
        const shuttleRef = db.collection('shuttles').doc(shuttleId)
        const shuttleSnap = await shuttleRef.get()
        if (shuttleSnap.exists) {
          await shuttleRef.update({
            status: 'idle',
            tripStatus: 'completed',
            isActive: false,
            currentTripId: null,
            'lastLocation.updatedAt': FieldValue.serverTimestamp(),
          })
          console.log(`[POST /api/trips/${tripId}/end] Shuttle ${shuttleId} set to idle`)
        }
      } catch (shuttleErr) {
        console.error('[POST /api/trips/${tripId}/end] Failed to sync shuttle:', shuttleErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Trip ended successfully.',
      duration,
      totalDistance,
    })
  } catch (error: any) {
    console.error('[POST /api/trips/[tripId]/end] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Haversine formula to calculate distance between two GPS points in meters.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
