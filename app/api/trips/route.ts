import { NextRequest, NextResponse } from 'next/server'
import { adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

/**
 * GET /api/trips
 * Fetch trips with optional filters: shuttleId, driverId, date, dateFrom, dateTo, status, stationId
 *
 * POST /api/trips
 * Create a new trip (called automatically when driver logs in + shuttle activates)
 */

export async function GET(req: NextRequest) {
  try {
    if (!adminApp) {
      return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 })
    }
    const db = getFirestore(adminApp)
    const { searchParams } = new URL(req.url)

    const shuttleId = searchParams.get('shuttleId')
    const driverId = searchParams.get('driverId')
    const date = searchParams.get('date')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const status = searchParams.get('status')
    const stationId = searchParams.get('stationId')
    const search = searchParams.get('search')

    let query: FirebaseFirestore.Query = db.collection('trips').orderBy('createdAt', 'desc')

    if (shuttleId) query = query.where('shuttleId', '==', shuttleId)
    if (driverId) query = query.where('driverId', '==', driverId)
    if (status && status !== 'all') query = query.where('status', '==', status)

    // Date filtering
    if (date) {
      query = query.where('startDate', '==', date)
    } else if (dateFrom && dateTo) {
      query = query.where('startDate', '>=', dateFrom).where('startDate', '<=', dateTo)
    } else if (dateFrom) {
      query = query.where('startDate', '>=', dateFrom)
    } else if (dateTo) {
      query = query.where('startDate', '<=', dateTo)
    }

    const snapshot = await query.limit(500).get()
    let trips = snapshot.docs.map(docSnap => {
      const d = docSnap.data()
      return {
        id: docSnap.id,
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
    })

    // Client-side filtering for station and search (complex queries not supported by Firestore)
    if (stationId) {
      // Filter trips that visited this station — requires checking sub-collection
      // For performance, we'll do this in a separate query if needed
      // For now, skip — the frontend handles this via useTripDetails
    }

    if (search) {
      const q = search.toLowerCase()
      trips = trips.filter(t =>
        t.plateNumber.toLowerCase().includes(q) ||
        t.driverName.toLowerCase().includes(q) ||
        t.driverEmployeeId.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ trips })
  } catch (error: any) {
    console.error('[GET /api/trips] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch trips.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!adminApp) {
      return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 })
    }
    const db = getFirestore(adminApp)
    const body = await req.json()

    const {
      shuttleId,
      plateNumber,
      shuttleNumber,
      driverId,
      driverName,
      driverEmployeeId,
      startStationId = null,
      startStationName = null,
      startLat = null,
      startLng = null,
    } = body

    // Validation
    if (!shuttleId?.trim()) return NextResponse.json({ error: 'shuttleId is required.' }, { status: 400 })
    if (!driverId?.trim()) return NextResponse.json({ error: 'driverId is required.' }, { status: 400 })

    const now = new Date()
    const startDate = now.toISOString().split('T')[0] // YYYY-MM-DD

    const tripDoc = {
      shuttleId: shuttleId.trim(),
      plateNumber: (plateNumber || shuttleNumber || 'Unknown').trim(),
      driverId: driverId.trim(),
      driverName: driverName?.trim() || 'Unknown',
      driverEmployeeId: driverEmployeeId?.trim() || '',
      startTime: FieldValue.serverTimestamp(),
      startDate,
      endTime: null,
      endDate: null,
      duration: null,
      status: 'in-progress',
      startStationId,
      startStationName,
      startLat,
      startLng,
      endStationId: null,
      endStationName: null,
      endLat: null,
      endLng: null,
      totalPassengers: 0,
      totalRequests: 0,
      totalDistance: 0,
      createdAt: FieldValue.serverTimestamp(),
    }

    const docRef = await db.collection('trips').add(tripDoc)

    // ── Sync shuttle document ─────────────────────────────────────
    // Ensure the shuttle reflects an active trip so the Web Dashboard
    // can display it (filter: isActive == true).
    try {
      const shuttleRef = db.collection('shuttles').doc(shuttleId.trim())
      const shuttleSnap = await shuttleRef.get()
      if (shuttleSnap.exists) {
        await shuttleRef.update({
          status: 'active',
          tripStatus: 'in_progress',
          isActive: true,
          currentTripId: docRef.id,
        })
        console.log(`[POST /api/trips] Shuttle ${shuttleId} updated for trip ${docRef.id}`)
      }
    } catch (shuttleErr) {
      // Non-critical — trip was already created
      console.error('[POST /api/trips] Failed to sync shuttle:', shuttleErr)
    }

    return NextResponse.json({
      success: true,
      tripId: docRef.id,
      message: 'Trip created successfully.',
    })
  } catch (error: any) {
    console.error('[POST /api/trips] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create trip.' }, { status: 500 })
  }
}
