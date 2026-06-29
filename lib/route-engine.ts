import { STATIONS, NODES, EDGES, getHaversineDistance, getBearing, getNearestNode, getNearestStation, COMPONENTS, getComponentsTraversed, findNearestEdge, findNearbyEdges, NearbyEdge, ADJ } from './university-graph'

type AdjList = Record<string, { to: string; cost: number }[]>

export interface RoutePoint {
  lat: number
  lng: number
}

export interface SnapCandidate {
  fromId: string
  toId: string
  distance: number
  featureIdx: number
  edgeCost: number
}

export interface SnapInfo {
  shuttleLat: number
  shuttleLng: number
  projectedLat: number
  projectedLng: number
  distance: number
  featureIdx: number
  edgeFrom: string
  edgeTo: string
  edgeFromLat: number
  edgeFromLng: number
  edgeToLat: number
  edgeToLng: number
  candidates: SnapCandidate[]
}

export interface RouteResult {
  path: RoutePoint[]
  distance: number
  duration: number
  nodePath: string[]
  validated: boolean
  componentsTraversed: number
  snap?: SnapInfo
}

interface CacheEntry {
  result: RouteResult
  timestamp: number
}

const routeCache = new Map<string, CacheEntry>()
const CACHE_TTL = 30_000

export function clearRouteCache(): void {
  routeCache.clear()
  console.log('[ROUTE] cache=cleared')
}

function getInitialHeadingDesc(nodePath: string[], coordMap: Record<string, { lat: number; lng: number }>): string {
  if (nodePath.length < 2) return 'N/A'
  const a = coordMap[nodePath[0]]
  const b = coordMap[nodePath[1]]
  if (!a || !b) return 'N/A'
  const bearing = getBearing(a.lat, a.lng, b.lat, b.lng)
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(bearing / 45) % 8
  return `${Math.round(bearing)}° ${dirs[idx]}`
}

function aStarCustom(
  startId: string,
  goalId: string,
  adj: AdjList,
  coordMap: Record<string, { lat: number; lng: number }>
): { path: string[]; cost: number } {
  if (startId === goalId) return { path: [startId], cost: 0 }

  const goalCoord = coordMap[goalId]
  if (!goalCoord) return { path: [], cost: Infinity }

  const openSet = new Set<string>([startId])
  const cameFrom: Record<string, string> = {}
  const gScore: Record<string, number> = {}
  const fScore: Record<string, number> = {}

  gScore[startId] = 0
  const startCoord = coordMap[startId]
  if (!startCoord) return { path: [], cost: Infinity }
  fScore[startId] = getHaversineDistance(startCoord.lat, startCoord.lng, goalCoord.lat, goalCoord.lng)

  while (openSet.size > 0) {
    let currentId = ''
    let minF = Infinity
    openSet.forEach(id => {
      const f = fScore[id] ?? Infinity
      if (f < minF) { minF = f; currentId = id }
    })

    if (currentId === goalId) {
      const path: string[] = []
      let cur = currentId
      while (cameFrom[cur]) {
        path.unshift(cur)
        cur = cameFrom[cur]
      }
      path.unshift(startId)
      return { path, cost: gScore[goalId] ?? Infinity }
    }

    openSet.delete(currentId)

    for (const nb of adj[currentId] || []) {
      const tg = (gScore[currentId] ?? Infinity) + nb.cost
      if (tg < (gScore[nb.to] ?? Infinity)) {
        cameFrom[nb.to] = currentId
        gScore[nb.to] = tg
        const nn = coordMap[nb.to]
        if (nn) {
          fScore[nb.to] = tg + getHaversineDistance(nn.lat, nn.lng, goalCoord.lat, goalCoord.lng)
          openSet.add(nb.to)
        }
      }
    }
  }
  return { path: [], cost: Infinity }
}

export function calculateRoute(fromLat: number, fromLng: number, toStationId: string): RouteResult {
  const station = STATIONS.find(s => s.id === toStationId)
  if (!station) {
    console.error(`[ROUTE] station=not_found id=${toStationId}`)
    return { path: [], distance: 0, duration: 0, nodePath: [], validated: false, componentsTraversed: 0 }
  }

  const cacheKey = `${fromLat.toFixed(6)},${fromLng.toFixed(6)}-${toStationId}`
  const cached = routeCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[ROUTE] cache=hit key=${cacheKey}`)
    return cached.result
  }

  console.log(`[ROUTE] shuttle_coord=${fromLat.toFixed(6)},${fromLng.toFixed(6)}`)

  const startCandidates = findNearbyEdges(fromLat, fromLng, 60)
  const destCandidates = findNearbyEdges(station.lat, station.lng, 60)

  console.log(`[ROUTE] start_candidates=${startCandidates.length} dest_candidates=${destCandidates.length}`)
  startCandidates.forEach((c, i) => {
    console.log(`[ROUTE]   candidate[${i}]: edge=${c.fromId}->${c.toId} dist=${c.distance.toFixed(1)}m feature=${c.featureIdx} cost=${c.edgeCost}`)
  })

  const bestStart = startCandidates[0] || null
  const bestDest = destCandidates[0] || null

  if (!bestStart || !bestDest) {
    console.warn('[ROUTE] nearest_edge=not_found fallback=node_snapping')
    const shuttleNode = getNearestNode(fromLat, fromLng)
    const destStation = getNearestStation(toStationId)
    if (!destStation) {
      return { path: [], distance: 0, duration: 0, nodePath: [], validated: false, componentsTraversed: 0 }
    }
    const fallbackResult = calculatePathOnGraphOld(shuttleNode.id, destStation.id)
    routeCache.set(cacheKey, { result: fallbackResult, timestamp: Date.now() })
    return fallbackResult
  }

  console.log(`[ROUTE] nearest_start=${bestStart.fromId}->${bestStart.toId} dist=${Math.round(bestStart.distance)}m`)
  console.log(`[ROUTE] nearest_dest=${bestDest.fromId}->${bestDest.toId} dist=${Math.round(bestDest.distance)}m`)

  const startFromNode = NODES.find(n => n.id === bestStart.fromId)
  const startToNode = NODES.find(n => n.id === bestStart.toId)

  console.log(`[SNAP]\nshuttle=${fromLat.toFixed(6)},${fromLng.toFixed(6)}\nprojected=${bestStart.projectedLat.toFixed(6)},${bestStart.projectedLng.toFixed(6)}\ndistance=${bestStart.distance.toFixed(1)}\nfeature=${bestStart.featureIdx}`)

  const snapInfo: SnapInfo = {
    shuttleLat: fromLat,
    shuttleLng: fromLng,
    projectedLat: bestStart.projectedLat,
    projectedLng: bestStart.projectedLng,
    distance: bestStart.distance,
    featureIdx: bestStart.featureIdx,
    edgeFrom: bestStart.fromId,
    edgeTo: bestStart.toId,
    edgeFromLat: startFromNode?.y ?? 0,
    edgeFromLng: startFromNode?.x ?? 0,
    edgeToLat: startToNode?.y ?? 0,
    edgeToLng: startToNode?.x ?? 0,
    candidates: startCandidates.map(c => ({
      fromId: c.fromId,
      toId: c.toId,
      distance: c.distance,
      featureIdx: c.featureIdx,
      edgeCost: c.edgeCost,
    })),
  }

  const startEdge = bestStart
  const destEdge = bestDest

  const tempStartId = `_temp_s_${Date.now()}`
  const tempDestId = `_temp_d_${Date.now()}`

  const customAdj: AdjList = {}
  const customCoords: Record<string, { lat: number; lng: number }> = {}

  NODES.forEach(n => { customCoords[n.id] = { lat: n.y, lng: n.x } })
  Object.keys(ADJ).forEach(id => {
    customAdj[id] = ADJ[id].map(nbId => {
      const cost = getEdgeCost(id, nbId)
      return { to: nbId, cost }
    })
  })

  customCoords[tempStartId] = { lat: startEdge.projectedLat, lng: startEdge.projectedLng }
  customCoords[tempDestId] = { lat: destEdge.projectedLat, lng: destEdge.projectedLng }

  const sFrom = customCoords[startEdge.fromId]
  const sTo = customCoords[startEdge.toId]
  if (sFrom && sTo) {
    const costA = Math.round(getHaversineDistance(startEdge.projectedLat, startEdge.projectedLng, sFrom.lat, sFrom.lng))
    const costB = Math.round(getHaversineDistance(startEdge.projectedLat, startEdge.projectedLng, sTo.lat, sTo.lng))
    customAdj[tempStartId] = [
      { to: startEdge.fromId, cost: costA },
      { to: startEdge.toId, cost: costB },
    ]
    customAdj[startEdge.fromId].push({ to: tempStartId, cost: costA })
    customAdj[startEdge.toId].push({ to: tempStartId, cost: costB })
  }

  const dFrom = customCoords[destEdge.fromId]
  const dTo = customCoords[destEdge.toId]
  if (dFrom && dTo) {
    const costA = Math.round(getHaversineDistance(destEdge.projectedLat, destEdge.projectedLng, dFrom.lat, dFrom.lng))
    const costB = Math.round(getHaversineDistance(destEdge.projectedLat, destEdge.projectedLng, dTo.lat, dTo.lng))
    customAdj[tempDestId] = [
      { to: destEdge.fromId, cost: costA },
      { to: destEdge.toId, cost: costB },
    ]
    customAdj[destEdge.fromId].push({ to: tempDestId, cost: costA })
    customAdj[destEdge.toId].push({ to: tempDestId, cost: costB })
  }

  const { path: nodePath, cost } = aStarCustom(tempStartId, tempDestId, customAdj, customCoords)

  if (nodePath.length === 0 || cost === Infinity) {
    console.warn(`[ROUTE] path=not_found`)
    const result: RouteResult = {
      path: [], distance: 0, duration: 0, nodePath: [],
      validated: false, componentsTraversed: 0, snap: snapInfo,
    }
    routeCache.set(cacheKey, { result, timestamp: Date.now() })
    return result
  }

  const realPath = nodePath.filter(id => !id.startsWith('_temp_'))

  console.log(`[ROUTE]\nstart=${nodePath[0]}\nend=${nodePath[nodePath.length - 1]}\ndistance=${Math.round(cost)}\nnodes=${nodePath.length}\nvalidated=true`)

  const coords = nodePath.map(id => {
    const c = customCoords[id]
    return c ? { lat: c.lat, lng: c.lng } : null
  }).filter((c): c is { lat: number; lng: number } => c !== null)

  const path: RoutePoint[] = coords.map(c => ({ lat: c.lat, lng: c.lng }))

  const result: RouteResult = {
    path,
    distance: Math.round(cost),
    duration: Math.round(cost / 8.33),
    nodePath,
    validated: true,
    componentsTraversed: 1,
    snap: snapInfo,
  }

  routeCache.set(cacheKey, { result, timestamp: Date.now() })
  return result
}

function getEdgeCost(idA: string, idB: string): number {
  for (const edge of EDGES) {
    const ek = edge.from < edge.to ? `${edge.from}-${edge.to}` : `${edge.to}-${edge.from}`
    const k = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`
    if (ek === k) return edge.cost
  }
  return Infinity
}

function buildFullAdj(): AdjList {
  const adj: AdjList = {}
  Object.keys(ADJ).forEach(id => {
    adj[id] = ADJ[id].map(nbId => {
      const cost = getEdgeCost(id, nbId)
      return { to: nbId, cost }
    })
  })
  return adj
}

function buildFullCoords(): Record<string, { lat: number; lng: number }> {
  const coordMap: Record<string, { lat: number; lng: number }> = {}
  NODES.forEach(n => { coordMap[n.id] = { lat: n.y, lng: n.x } })
  return coordMap
}

function calculatePathOnGraphOld(fromNodeId: string, toNodeId: string): RouteResult {
  const adj = buildFullAdj()
  const coords = buildFullCoords()
  const { path: nodePath, cost } = aStarCustom(fromNodeId, toNodeId, adj, coords)

  if (nodePath.length === 0 || cost === Infinity) {
    console.log(`[ROUTE]\nstart=${fromNodeId}\nend=${toNodeId}\ndistance=0\nnodes=0\nvalidated=false`)
    return { path: [], distance: 0, duration: 0, nodePath: [], validated: false, componentsTraversed: 0 }
  }

  const compsTraversed = getComponentsTraversed(nodePath, COMPONENTS)
  const finalDist = Math.round(cost)
  console.log(`[ROUTE]\nstart=${nodePath[0]}\nend=${nodePath[nodePath.length - 1]}\ndistance=${finalDist}\nnodes=${nodePath.length}\nvalidated=true`)

  const pathCoords = nodePath.map(id => {
    const c = coords[id]
    return c ? { lat: c.lat, lng: c.lng } : null
  }).filter((c): c is { lat: number; lng: number } => c !== null)

  return {
    path: pathCoords,
    distance: finalDist,
    duration: Math.round(finalDist / 8.33),
    nodePath,
    validated: true,
    componentsTraversed: compsTraversed,
  }
}

export function getDistanceToStation(
  shuttleLat: number, shuttleLng: number,
  stationLat: number, stationLng: number
): number {
  return getHaversineDistance(shuttleLat, shuttleLng, stationLat, stationLng)
}

export function getStationById(stationId: string): { id: string; name: string; lat: number; lng: number } | undefined {
  return STATIONS.find(s => s.id === stationId)
}
