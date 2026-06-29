import { NextRequest, NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * GET /api/trips/[tripId]
 * Fetch complete trip details including station_history and location_history sub-collections.
 *
 * PATCH /api/trips/[tripId]
 * Update trip fields (e.g. increment passengers, update distance).
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    if (!adminApp) {
      return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 })
    }
    const db = getFirestore(adminApp)
    const { tripId } = await params

    // Fetch trip document
    const tripDoc = await db.collection('trips').doc(tripId).get()
    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
    }
    const d = tripDoc.data()!

    const trip = {
      id: tripDoc.id,
      shuttleId: d.shuttleId || '',
      plateNumber: d.plateNumber || d.shuttleNumber || '',
      driverId: d.driverId || '',
      driverName: d.driverName || '',
      driverEmployeeId: d.driverEmployeeId || '',
      startTime: d.startTime?.toDate?.()?.toISOString() || null,
      startDate: d.startDate || '',
      endTime: d.endTime?.toDate?.()?.toISOString() || null,
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
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
    }

    // Fetch station history sub-collection
    const stationSnap = await db
      .collection('trips').doc(tripId)
      .collection('station_history')
      .orderBy('arrivalTime', 'asc')
      .get()

    const stationHistory = stationSnap.docs.map(s => {
      const sd = s.data()
      return {
        id: s.id,
        tripId,
        stationId: sd.stationId || '',
        stationName: sd.stationName || '',
        arrivalTime: sd.arrivalTime?.toDate?.()?.toISOString() || null,
        departureTime: sd.departureTime?.toDate?.()?.toISOString() || null,
        passengersBoarded: sd.passengersBoarded ?? 0,
        passengersDropped: sd.passengersDropped ?? 0,
        lat: sd.lat ?? 0,
        lng: sd.lng ?? 0,
      }
    })

    // Fetch location history sub-collection
    const locationSnap = await db
      .collection('trips').doc(tripId)
      .collection('location_history')
      .orderBy('timestamp', 'asc')
      .get()

    const locationHistory = locationSnap.docs.map(l => {
      const ld = l.data()
      return {
        id: l.id,
        tripId,
        lat: ld.lat ?? 0,
        lng: ld.lng ?? 0,
        timestamp: ld.timestamp?.toDate?.()?.toISOString() || null,
      }
    })

    // Compute statistics
    const statistics = {
      tripId,
      totalPassengers: trip.totalPassengers,
      uniquePassengers: trip.totalPassengers, // approximation
      totalRequests: trip.totalRequests,
      acceptedRequests: trip.totalRequests,
      completedRequests: trip.status === 'completed' ? trip.totalRequests : 0,
      stationsVisited: stationHistory.length,
      totalDistance: trip.totalDistance,
      avgStopDuration: stationHistory.length > 0
        ? stationHistory.reduce((sum, s) => {
            if (s.arrivalTime && s.departureTime) {
              return sum + (new Date(s.departureTime).getTime() - new Date(s.arrivalTime).getTime()) / 1000
            }
            return sum
          }, 0) / stationHistory.length
        : 0,
    }

    return NextResponse.json({ trip, stationHistory, locationHistory, statistics })
  } catch (error: any) {
    console.error('[GET /api/trips/[tripId]] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    if (!adminApp) {
      return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 })
    }
    const db = getFirestore(adminApp)
    const { tripId } = await params
    const body = await req.json()

    const tripRef = db.collection('trips').doc(tripId)
    const tripDoc = await tripRef.get()

    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
    }

    // Build update payload — only allow specific fields
    const allowedFields = [
      'totalPassengers', 'totalRequests', 'totalDistance',
      'endStationId', 'endStationName', 'endLat', 'endLng',
    ]

    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
    }

    await tripRef.update(updates)

    return NextResponse.json({ success: true, message: 'Trip updated.' })
  } catch (error: any) {
    console.error('[PATCH /api/trips/[tripId]] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
