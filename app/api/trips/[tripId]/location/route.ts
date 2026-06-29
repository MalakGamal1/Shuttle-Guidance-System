import { NextRequest, NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/trips/[tripId]/location
 * Record a GPS breadcrumb for trip route tracking and historical replay.
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

    const { lat, lng } = body

    if (lat == null || lng == null) {
      return NextResponse.json({ error: 'lat and lng are required.' }, { status: 400 })
    }

    // Verify trip exists
    const tripDoc = await db.collection('trips').doc(tripId).get()
    if (!tripDoc.exists) {
      return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
    }

    if (tripDoc.data()?.status === 'completed') {
      return NextResponse.json({ error: 'Cannot add location to completed trip.' }, { status: 400 })
    }

    const locationDoc = {
      tripId,
      lat: Number(lat),
      lng: Number(lng),
      timestamp: FieldValue.serverTimestamp(),
    }

    const docRef = await db
      .collection('trips').doc(tripId)
      .collection('location_history')
      .add(locationDoc)

    return NextResponse.json({
      success: true,
      locationId: docRef.id,
      message: 'Location recorded.',
    })
  } catch (error: any) {
    console.error('[POST /api/trips/[tripId]/location] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
