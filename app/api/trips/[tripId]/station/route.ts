import { NextRequest, NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/trips/[tripId]/station
 * Record a station visit during an active trip.
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
    const body = await req.json()

    const {
      stationId,
      stationName,
      lat,
      lng,
      passengersBoarded = 0,
      passengersDropped = 0,
    } = body

    if (!stationId?.trim()) {
      return NextResponse.json({ error: 'stationId is required.' }, { status: 400 })
    }

    // Verify trip exists and is in-progress
    const tripRef = db.collection('trips').doc(tripId)
    const tripDoc = await tripRef.get()

    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
    }

    if (tripDoc.data()?.status === 'completed') {
      return NextResponse.json({ error: 'Cannot add station to completed trip.' }, { status: 400 })
    }

    // Set departure time on previous station if exists
    const prevStationSnap = await db
      .collection('trips').doc(tripId)
      .collection('station_history')
      .orderBy('arrivalTime', 'desc')
      .limit(1)
      .get()

    if (!prevStationSnap.empty) {
      const prevDoc = prevStationSnap.docs[0]
      if (!prevDoc.data().departureTime) {
        await prevDoc.ref.update({ departureTime: FieldValue.serverTimestamp() })
      }
    }

    // Add new station visit
    const stationDoc = {
      tripId,
      stationId: stationId.trim(),
      stationName: stationName?.trim() || '',
      arrivalTime: FieldValue.serverTimestamp(),
      departureTime: null,
      passengersBoarded: Number(passengersBoarded) || 0,
      passengersDropped: Number(passengersDropped) || 0,
      lat: Number(lat) || 0,
      lng: Number(lng) || 0,
    }

    const docRef = await db
      .collection('trips').doc(tripId)
      .collection('station_history')
      .add(stationDoc)

    // Update trip passenger counts
    const tripData = tripDoc.data()!
    await tripRef.update({
      totalPassengers: (tripData.totalPassengers || 0) + (Number(passengersBoarded) || 0),
    })

    return NextResponse.json({
      success: true,
      stationHistoryId: docRef.id,
      message: 'Station visit recorded.',
    })
  } catch (error: any) {
    console.error('[POST /api/trips/[tripId]/station] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
