import { NextRequest, NextResponse } from 'next/server'
import { buildCampusRoute, syncGraphWithFirestore } from '@/lib/university-graph'

interface CacheEntry {
  path: any[]
  pathWithCoords: { lat: number; lng: number }[]
  cost: number
  source: string
  cachedAt: number
}

// In-memory cache for calculated routes with TTL
const routeCache = new Map<string, CacheEntry>()

export async function POST(req: NextRequest) {
  try {
    // Rebuild the in-memory graph using dynamic Firestore data
    await syncGraphWithFirestore()

    const body = await req.json()
    const { start, goal, waypoints } = body

    const pathIds: string[] =
      waypoints && Array.isArray(waypoints) && waypoints.length > 0
        ? waypoints
        : [start?.id, goal?.id].filter(Boolean)

    if (pathIds.length < 2) {
      console.warn('[CalculateRoute] Invalid input received')
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input. Missing start, goal, or waypoints.',
          path: [],
          cost: 0,
        },
        { status: 400 }
      )
    }

    const cacheKey = pathIds.join('_to_')
    const cached = routeCache.get(cacheKey)
    if (cached && Date.now() - cached.cachedAt <= 5 * 60 * 1000) {
      const { cachedAt, ...rest } = cached
      return NextResponse.json({ success: true, ...rest })
    }

    const result = buildCampusRoute(pathIds)
    routeCache.set(cacheKey, { ...result, cachedAt: Date.now() })

    console.log(
      `[CalculateRoute] Internal campus route: ${pathIds.length} waypoints, ${result.pathWithCoords.length} coords, ${result.cost}m`
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error calculating route'
    console.error('[CalculateRoute] Error in API:', err)
    
    const outOfBounds = err instanceof Error && err.message.includes('exits campus boundary')
    
    return NextResponse.json(
      {
        success: false,
        error: message,
        outOfBounds,
        path: [],
        cost: 0,
      },
      { status: outOfBounds ? 422 : 400 }
    )
  }
}
