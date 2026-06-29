import { NextRequest, NextResponse } from 'next/server'
import { STATIONS } from '@/lib/university-graph'

// In-memory cache for calculated routes
const routeCache = new Map<string, { path: any[]; cost: number }>()

interface GraphNode {
  id: string
  x: number // lng
  y: number // lat
}

interface GraphEdge {
  from: string
  to: string
  cost: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { start, goal, nodes, edges } = body

    const startId = start?.id
    const goalId = goal?.id

    if (!startId || !goalId || !Array.isArray(nodes) || !Array.isArray(edges)) {
      console.warn('[CalculateRoute] Invalid input received')
      return NextResponse.json({
        success: false,
        error: 'Invalid input. Missing start, goal, nodes, or edges.',
        path: [],
        cost: 0
      }, { status: 400 })
    }

    // Graph validation
    if (nodes.length === 0 || edges.length === 0) {
      console.warn('[CalculateRoute] Empty nodes or edges')
      return NextResponse.json({
        success: false,
        error: 'Empty graph nodes or edges.',
        path: [],
        cost: 0
      }, { status: 400 })
    }

    const cacheKey = `${startId}_to_${goalId}`
    if (routeCache.has(cacheKey)) {
      const cached = routeCache.get(cacheKey)!
      return NextResponse.json({ success: true, ...cached })
    }

    // ─── Dijkstra on Campus Graph ───────────────────────────────────
    const distances: Record<string, number> = {}
    const previous: Record<string, string | null> = {}
    const queue = new Set<string>()

    nodes.forEach((node: GraphNode) => {
      distances[node.id] = Infinity
      previous[node.id] = null
      queue.add(node.id)
    })

    if (!queue.has(startId) || !queue.has(goalId)) {
      console.warn(`[CalculateRoute] Start (${startId}) or Goal (${goalId}) not found in graph`)
      return NextResponse.json({
        success: true,
        path: [],
        cost: 0,
        message: 'Start or goal node not found in graph'
      })
    }

    distances[startId] = 0

    const adj: Record<string, { to: string; cost: number }[]> = {}
    nodes.forEach((n: GraphNode) => { adj[n.id] = [] })
    edges.forEach((e: GraphEdge) => {
      if (adj[e.from] && adj[e.to]) {
        adj[e.from].push({ to: e.to, cost: e.cost })
        adj[e.to].push({ to: e.from, cost: e.cost })
      }
    })

    while (queue.size > 0) {
      let minNode: string | null = null
      let minDist = Infinity
      
      queue.forEach(nodeId => {
        if (distances[nodeId] < minDist) {
          minDist = distances[nodeId]
          minNode = nodeId
        }
      })

      if (minNode === null || minNode === goalId) {
        break
      }

      queue.delete(minNode)

      const neighbors = adj[minNode] || []
      for (const neighbor of neighbors) {
        if (!queue.has(neighbor.to)) continue
        const alt = distances[minNode] + neighbor.cost
        if (alt < distances[neighbor.to]) {
          distances[neighbor.to] = alt
          previous[neighbor.to] = minNode
        }
      }
    }

    if (distances[goalId] === Infinity) {
      console.log(`[CalculateRoute] No Dijkstra route found between ${startId} and ${goalId}`)
      return NextResponse.json({
        success: true,
        path: [],
        cost: 0,
        message: 'No route between stations'
      })
    }

    const pathIds: string[] = []
    let curr: string | null = goalId
    while (curr !== null) {
      pathIds.unshift(curr)
      curr = previous[curr]
    }

    const pathWithDetails = pathIds.map(id => {
      const station = STATIONS.find(s => s.id === id)
      return {
        id,
        name: station?.name || id,
        lat: station?.lat || 0,
        lng: station?.lng || 0,
      }
    })

    const cost = distances[goalId]
    const result = { path: pathWithDetails, cost }
    routeCache.set(cacheKey, result)

    console.log(`[CalculateRoute] Dijkstra Success: ${startId} -> ${goalId}. Points: ${pathWithDetails.length}, Cost: ${cost}m`)
    return NextResponse.json({ success: true, ...result })

  } catch (err: any) {
    console.error('[CalculateRoute] Error in API:', err)
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal error calculating route',
      path: [],
      cost: 0
    }, { status: 400 })
  }
}
