import { NextRequest, NextResponse } from 'next/server'
import { updateDriverLocation, isSupabaseConfigured } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase غير متاح' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { driverId, lat, lng, status } = body

    // Validation
    if (!driverId || lat == null || lng == null) {
      return NextResponse.json(
        { error: 'driverId و lat و lng مطلوبين' },
        { status: 400 }
      )
    }

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'lat و lng لازم يكونوا أرقام' },
        { status: 400 }
      )
    }

    const { data, error } = await updateDriverLocation({
      driverId,
      lat,
      lng,
      status: status ?? 'active',
      updatedAt: Date.now(),
    })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch {
    return NextResponse.json(
      { error: 'خطأ في الـ request' },
      { status: 400 }
    )
  }
}
