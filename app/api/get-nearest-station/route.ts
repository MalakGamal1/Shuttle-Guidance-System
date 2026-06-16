import { NextRequest, NextResponse } from 'next/server'
import { getNearestStation, isSupabaseConfigured } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase غير متاح' },
      { status: 503 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const lat   = parseFloat(searchParams.get('lat')   ?? '')
    const lng   = parseFloat(searchParams.get('lng')   ?? '')
    const limit = parseInt(searchParams.get('limit')   ?? '1', 10)

    // Validation
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'lat و lng مطلوبين كـ query params (أرقام)' },
        { status: 400 }
      )
    }

    const { data, error } = await getNearestStation({ lat, lng, limit })

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
