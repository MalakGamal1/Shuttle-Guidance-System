import campusRoads from './campus-roads.json'

export interface Station {
  id: string
  name: string
  lat: number
  lng: number
}

export interface GraphNode {
  id: string
  x: number
  y: number
}

export interface GraphEdge {
  from: string
  to: string
  cost: number
  featureIdx: number
}

const SNAP_METERS = 2

interface GeoJSONFeature {
  type: string
  properties: Record<string, unknown>
  geometry: {
    type: string
    coordinates: number[][] | number[]
  }
}

interface GeoJSONData {
  type: string
  features: GeoJSONFeature[]
}

export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type AdjList = Record<string, string[]>

function findConnectedComponents(adj: AdjList, allIds: string[]): string[][] {
  const visited = new Set<string>()
  const components: string[][] = []

  for (const id of allIds) {
    if (visited.has(id)) continue
    const component: string[] = []
    const stack = [id]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      component.push(cur)
      for (const nb of adj[cur] || []) {
        if (!visited.has(nb)) stack.push(nb)
      }
    }
    components.push(component)
  }
  return components
}

function buildGraph() {
  const data = campusRoads as unknown as GeoJSONData
  const nodeMap = new Map<string, { lat: number; lng: number }>()
  const edgeSet = new Set<string>()
  const edgeMeta = new Map<string, { originalFrom?: string; originalTo?: string; featureIdx: number }>()
  const nodeToFeatures: Map<string, Set<number>> = new Map()
  let lineStringsLoaded = 0
  let mergedCount = 0

  // Collect all GeoJSON coordinates for validation
  const allGeoCoords: string[] = []

  // Grid spatial index: cell ≈ 2.2m at lat 27° (1/50000 deg)
  const grid = new Map<string, string>()

  function gridKey(lat: number, lng: number): string {
    return `${Math.round(lat * 50000)}_${Math.round(lng * 50000)}`
  }

  function findOrCreateNode(lat: number, lng: number): string {
    const key = gridKey(lat, lng)

    if (grid.has(key)) {
      const nodeId = grid.get(key)!
      const existing = nodeMap.get(nodeId)!
      if (getHaversineDistance(existing.lat, existing.lng, lat, lng) < SNAP_METERS) {
        mergedCount++
        return nodeId
      }
    }

    const parts = key.split('_').map(Number)
    const rLat = parts[0]
    const rLng = parts[1]

    for (let dl = -1; dl <= 1; dl++) {
      for (let dg = -1; dg <= 1; dg++) {
        if (dl === 0 && dg === 0) continue
        const nk = `${rLat + dl}_${rLng + dg}`
        if (grid.has(nk)) {
          const nodeId = grid.get(nk)!
          const existing = nodeMap.get(nodeId)!
          if (getHaversineDistance(existing.lat, existing.lng, lat, lng) < SNAP_METERS) {
            mergedCount++
            return nodeId
          }
        }
      }
    }

    const id = `n_${nodeMap.size}`
    nodeMap.set(id, { lat, lng })
    grid.set(key, id)
    return id
  }

  data.features.forEach((feature, featureIdx) => {
    if (feature.geometry.type !== 'LineString') return
    const coords = feature.geometry.coordinates as number[][]
    if (coords.length < 2) return
    lineStringsLoaded++

    coords.forEach(([lng, lat]) => {
      allGeoCoords.push(`${lat},${lng}`)
    })

    const nodeIds: string[] = []
    coords.forEach(([lng, lat]) => {
      const nid = findOrCreateNode(lat as number, lng as number)
      nodeIds.push(nid)
      if (!nodeToFeatures.has(nid)) nodeToFeatures.set(nid, new Set())
      nodeToFeatures.get(nid)!.add(featureIdx)
    })

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const id1 = nodeIds[i]
      const id2 = nodeIds[i + 1]
      if (id1 === id2) continue
      const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`
      edgeSet.add(key)
      edgeMeta.set(key, { originalFrom: id1, originalTo: id2, featureIdx })
    }
  })

  const nodes: GraphNode[] = []
  const nodeCoords: Record<string, { lat: number; lng: number }> = {}

  nodeMap.forEach((coords, id) => {
    nodes.push({ id, x: coords.lng, y: coords.lat })
    nodeCoords[id] = coords
  })

  let edges: GraphEdge[] = []
  edgeSet.forEach(key => {
    const [id1, id2] = key.split('-')
    const c1 = nodeMap.get(id1)
    const c2 = nodeMap.get(id2)
    if (!c1 || !c2) return
    const cost = Math.round(getHaversineDistance(c1.lat, c1.lng, c2.lat, c2.lng))
    const meta = edgeMeta.get(key)
    edges.push({ from: meta?.originalFrom || id1, to: meta?.originalTo || id2, cost, featureIdx: meta?.featureIdx ?? -1 })
  })

  // ── Junction Detection & Road Splitting ──
  let junctionsDetected = 0
  let roadsSplit = 0

  const splitsByEdge = new Map<string, Array<{
    nodeId: string; projLat: number; projLng: number; t: number
  }>>()

  edgeSet.forEach(edgeKey => {
    const [idA, idB] = edgeKey.split('-')
    const cA = nodeMap.get(idA)
    const cB = nodeMap.get(idB)
    if (!cA || !cB) return

    for (const [nodeId, coord] of Object.entries(nodeCoords)) {
      if (nodeId === idA || nodeId === idB) continue

      const proj = projectPointOnSegment(coord.lat, coord.lng, cA.lat, cA.lng, cB.lat, cB.lng)
      if (proj.distance < 2 && proj.t > 0.05 && proj.t < 0.95) {
        if (!splitsByEdge.has(edgeKey)) splitsByEdge.set(edgeKey, [])
        splitsByEdge.get(edgeKey)!.push({
          nodeId, projLat: proj.lat, projLng: proj.lng, t: proj.t,
        })
      }
    }
  })

  if (splitsByEdge.size > 0) {
    splitsByEdge.forEach((splits, edgeKey) => {
      splits.sort((a, b) => a.t - b.t)

      const [idA, idB] = edgeKey.split('-')

        const parentMeta = edgeMeta.get(edgeKey)
        const parentFeatureIdx = parentMeta?.featureIdx ?? -1

        // Remove original edge
        edgeSet.delete(edgeKey)

        let prevId = idA
        splits.forEach(split => {
          const junctionId = `j_${junctionsDetected}`
          junctionsDetected++

          nodeMap.set(junctionId, { lat: split.projLat, lng: split.projLng })

          // Edge from prev to junction (inherits parent featureIdx)
          const ek1 = prevId < junctionId ? `${prevId}-${junctionId}` : `${junctionId}-${prevId}`
          edgeSet.add(ek1)
          edgeMeta.set(ek1, { originalFrom: prevId, originalTo: junctionId, featureIdx: parentFeatureIdx })

          // Edge from junction to crossing road node (bidirectional — no feature)
          const ek2 = junctionId < split.nodeId ? `${junctionId}-${split.nodeId}` : `${split.nodeId}-${junctionId}`
          edgeSet.add(ek2)
          edgeMeta.set(ek2, { originalFrom: junctionId, originalTo: split.nodeId, featureIdx: -1 })

          roadsSplit++
          prevId = junctionId
        })

        // Final edge from last junction to idB (inherits parent featureIdx)
        const ekLast = prevId < idB ? `${prevId}-${idB}` : `${idB}-${prevId}`
        edgeSet.add(ekLast)
        edgeMeta.set(ekLast, { originalFrom: prevId, originalTo: idB, featureIdx: parentFeatureIdx })
    })

    // Rebuild nodes and nodeCoords from updated nodeMap
    nodes.length = 0
    for (const key of Object.keys(nodeCoords)) delete nodeCoords[key]
    nodeMap.forEach((coords, id) => {
      nodes.push({ id, x: coords.lng, y: coords.lat })
      nodeCoords[id] = coords
    })

    // Rebuild edges from updated edgeSet (preserve original direction and featureIdx)
    edges = []
    edgeSet.forEach(key => {
      const [id1, id2] = key.split('-')
      const c1 = nodeMap.get(id1)
      const c2 = nodeMap.get(id2)
      if (!c1 || !c2) return
      const cost = Math.round(getHaversineDistance(c1.lat, c1.lng, c2.lat, c2.lng))
      const meta = edgeMeta.get(key)
    edges.push({ from: meta?.originalFrom || id1, to: meta?.originalTo || id2, cost, featureIdx: meta?.featureIdx ?? -1 })
    })
  }

  console.log(`[CampusGraph] Junctions Detected — ${junctionsDetected}`)
  console.log(`[CampusGraph] Roads Split — ${roadsSplit}`)

  // Build undirected adjacency
  const adj: AdjList = {}
  nodes.forEach(n => { adj[n.id] = [] })
  edges.forEach(e => {
    adj[e.from].push(e.to)
    adj[e.to].push(e.from)
  })

  console.log(`[CampusGraph] Nodes created: ${nodes.length}`)
  console.log(`[CampusGraph] Edges created: ${edges.length}`)

  // Edge lookup set for validation
  const edgeLookup = new Set<string>(edgeSet)

  // Find connected components
  let components = findConnectedComponents(adj, nodes.map(n => n.id))

  console.log(`[CampusGraph] LineStrings loaded — ${lineStringsLoaded}`)
  console.log(`[CampusGraph] Nodes created — ${nodes.length}`)
  console.log(`[CampusGraph] Edges created — ${edges.length}`)
  console.log(`[CampusGraph] Merged coordinates — ${mergedCount}`)
  console.log(`[CampusGraph] Connected Components — ${components.length}`)
  components.forEach((comp, i) => {
    console.log(`[CampusGraph]   Component ${i + 1}: ${comp.length} nodes`)
  })

  // Bridge disconnected components by connecting nearest endpoints
  if (components.length > 1) {
    console.log(`[CampusGraph] Bridging ${components.length} components...`)
    let bridgeCount = 0
    while (components.length > 1) {
      let minDist = Infinity
      let minA = ''
      let minB = ''
      let compI = -1
      let compJ = -1

      for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
          for (const idA of components[i]) {
            const cA = nodeMap.get(idA)!
            for (const idB of components[j]) {
              const cB = nodeMap.get(idB)!
              const dist = getHaversineDistance(cA.lat, cA.lng, cB.lat, cB.lng)
              if (dist < minDist) {
                minDist = dist
                minA = idA
                minB = idB
                compI = i
                compJ = j
              }
            }
          }
        }
      }

      if (minDist === Infinity || minDist > 50) {
        console.log(`[CampusGraph] Cannot bridge — closest pair ${Math.round(minDist)}m, aborting`)
        break
      }

      const key = minA < minB ? `${minA}-${minB}` : `${minB}-${minA}`
      if (!edgeLookup.has(key)) {
        edgeSet.add(key)
        const cost = Math.round(minDist)
        edges.push({ from: minA, to: minB, cost, featureIdx: -1 })
        adj[minA].push(minB)
        adj[minB].push(minA)
        edgeLookup.add(key)
        bridgeCount++
        console.log(`[CampusGraph]   Bridge ${bridgeCount}: ${minA} <-> ${minB} (${Math.round(minDist)}m)`)
      }

      // Merge component i and j
      const merged = [...components[compI], ...components[compJ]]
      if (compI < compJ) {
        components.splice(compJ, 1)
        components.splice(compI, 1)
      } else {
        components.splice(compI, 1)
        components.splice(compJ, 1)
      }
      components.push(merged)
    }

    // Re-check connectivity
    components = findConnectedComponents(adj, nodes.map(n => n.id))
    console.log(`[CampusGraph] After bridging:`)
    console.log(`[CampusGraph]   Bridges added — ${bridgeCount}`)
    console.log(`[CampusGraph]   Connected Components — ${components.length}`)
    components.forEach((comp, i) => {
      console.log(`[CampusGraph]   Component ${i + 1}: ${comp.length} nodes`)
    })
  }

  // Build coordinate set for validation (all GeoJSON LineString coords)
  const geoCoordSet = new Set<string>(allGeoCoords)

  return { nodes, edges, nodeCoords, edgeLookup, adj, components, geoCoordSet, junctionsDetected, roadsSplit, nodeToFeatures }
}

const { nodes: _NODES, edges: _EDGES, nodeCoords, edgeLookup, adj, components: _COMPONENTS, geoCoordSet, nodeToFeatures: _NODE_TO_FEATURES } = buildGraph()

export const NODES = _NODES
export const EDGES = _EDGES
export const NODE_COORDS = nodeCoords
export const EDGE_LOOKUP = edgeLookup
export const ADJ = adj
export const COMPONENTS = _COMPONENTS
export const GEO_COORD_SET = geoCoordSet
export const NODE_TO_FEATURES = _NODE_TO_FEATURES

console.log(`[ROUTING]
mode=shortest_path_only
directions=disabled
turn_restrictions=disabled
roads_source=campus-roads.geojson`)

export const STATIONS: Station[] = [
  { id: 'f4ukuh8Dxxtv4l0KM7hH', name: 'بوابة الصيانة', lat: 27.184440, lng: 31.168520 },
  { id: 'jZtWXtuPx0zd5hR791HE', name: 'بوابة الجامعة الرئيسية', lat: 27.186347, lng: 31.174880 },
  { id: 'V4zxq08WnmvS8KlivfdG', name: 'بوابة الترعة', lat: 27.191397, lng: 31.173000 },
  { id: 'c5XobcRdrUYlnC1P6RQF', name: 'بوابة مستشفى الجامعة', lat: 27.186881, lng: 31.166300 },
  { id: 'JYYrtbsIlz9v8Vq3QzKc', name: 'كلية الزراعة', lat: 27.188350, lng: 31.168949 },
  { id: 'hhshQzvx6JBtyN2XOWrQ', name: 'كلية التربية الرياضية', lat: 27.188500, lng: 31.166495 },
  { id: 'ppo8pfwkoqe9I7W6dh8G', name: 'ملعب جامعة أسيوط', lat: 27.188874, lng: 31.174286 },
  { id: 'f6hwuB5XCNMoiXFR0kNE', name: 'كلية العلوم', lat: 27.188950, lng: 31.171300 },
  { id: 'AzqlIx99BldHQwZN6hcN', name: 'كلية الصيدلة', lat: 27.188180, lng: 31.165757 },
  { id: 'thOOMFdu8483n9YOKy2A', name: 'كلية الطب', lat: 27.187162, lng: 31.167650 },
  { id: '0sbuAScZzG7Dbiu6xBSU', name: 'كلية الحاسبات (FCI)', lat: 27.186198, lng: 31.168162 },
  { id: 'x0miqk0qUs1k64fqxnuf', name: 'كلية طب الأسنان', lat: 27.186960, lng: 31.169494 },
  { id: 'Z3GODIJdkw4OGwgevOJh', name: 'كلية التربية', lat: 27.189405, lng: 31.172900 },
  { id: 'wV6eQZXbZyM7ze2J5xkX', name: 'كلية الحقوق والتجارة', lat: 27.187958, lng: 31.173506 },
  { id: 's94mttXqsdLjzAyIqnLE', name: 'كلية الهندسة', lat: 27.187630, lng: 31.172300 },
  { id: 'sciqfxN1U34f7s0XE3Zg', name: 'المدينة الجامعية (أ)', lat: 27.187850, lng: 31.178294 },
  { id: 'wNPichJG4cHmJSM5jRr0', name: 'المدينة الجامعية (د)', lat: 27.188250, lng: 31.175300 },
  { id: 'guest_house', name: 'دار الضيافة', lat: 27.185200, lng: 31.170000 },
  { id: 'roundabout', name: 'الميدان الرئيسي', lat: 27.186500, lng: 31.171000 },
  { id: 'surgery', name: 'مبنى الجراحة', lat: 27.187200, lng: 31.173000 },
  { id: 'hospital', name: 'المستشفى الرئيسي', lat: 27.187000, lng: 31.165000 },
]

export const LARGEST_COMPONENT = _COMPONENTS.reduce((max, c) => c.length > max.length ? c : max, _COMPONENTS[0])

export function getNearestNode(lat: number, lng: number): GraphNode {
  let nearest = NODES[0]
  let minDist = Infinity
  NODES.forEach(n => {
    const dx = n.x - lng
    const dy = n.y - lat
    const d = dx * dx + dy * dy
    if (d < minDist) {
      minDist = d
      nearest = n
    }
  })
  return nearest
}

export function getNearestStation(stationId: string): GraphNode | null {
  const station = STATIONS.find(s => s.id === stationId)
  if (!station) return null
  return getNearestNode(station.lat, station.lng)
}

export function aStar(startId: string, goalId: string): { path: string[]; cost: number } {
  if (startId === goalId) return { path: [startId], cost: 0 }

  const goalNode = NODES.find(n => n.id === goalId)
  if (!goalNode) return { path: [], cost: Infinity }

  const openSet = new Set<string>([startId])
  const cameFrom: Record<string, string> = {}
  const gScore: Record<string, number> = {}
  const fScore: Record<string, number> = {}

  NODES.forEach(n => { gScore[n.id] = Infinity; fScore[n.id] = Infinity })
  gScore[startId] = 0

  const startNode = NODES.find(n => n.id === startId)
  if (!startNode) return { path: [], cost: Infinity }
  fScore[startId] = getHaversineDistance(startNode.y, startNode.x, goalNode.y, goalNode.x)

  while (openSet.size > 0) {
    let currentId = ''
    let minF = Infinity
    openSet.forEach(id => {
      if (fScore[id] < minF) { minF = fScore[id]; currentId = id }
    })
    if (currentId === goalId) {
      const path: string[] = []
      let cur = currentId
      while (cameFrom[cur]) { path.unshift(cur); cur = cameFrom[cur] }
      path.unshift(startId)
      return { path, cost: gScore[goalId] }
    }
    openSet.delete(currentId)
    for (const nb of adj[currentId] || []) {
      const edgeCost = getEdgeCost(currentId, nb)
      if (edgeCost === Infinity) continue
      const tg = gScore[currentId] + edgeCost
      if (tg < gScore[nb]) {
        cameFrom[nb] = currentId
        gScore[nb] = tg
        const nn = NODES.find(n => n.id === nb)
        if (nn) {
          fScore[nb] = tg + getHaversineDistance(nn.y, nn.x, goalNode.y, goalNode.x)
          openSet.add(nb)
        }
      }
    }
  }
  return { path: [], cost: Infinity }
}

function getEdgeCost(idA: string, idB: string): number {
  const key = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`
  const edge = EDGES.find(e => {
    const ek = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`
    return ek === key
  })
  return edge ? edge.cost : Infinity
}

export function getEdgeFeatureIdx(idA: string, idB: string): number {
  const key = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`
  const edge = EDGES.find(e => {
    const ek = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`
    return ek === key
  })
  return edge ? edge.featureIdx : -1
}

export function nodePathToCoords(nodeIds: string[]): { lat: number; lng: number }[] {
  return nodeIds.map(id => {
    const c = nodeCoords[id]
    return c ? { lat: c.lat, lng: c.lng } : null
  }).filter((c): c is { lat: number; lng: number } => c !== null)
}

export function validatePathCoords(coords: { lat: number; lng: number }[]): boolean {
  for (const c of coords) {
    const key = `${c.lat},${c.lng}`
    if (!geoCoordSet.has(key)) {
      console.warn(`[CampusGraph] Non-GeoJSON coordinate: ${key}`)
      return false
    }
  }
  return true
}

export function validatePathEdges(nodePath: string[]): boolean {
  for (let i = 0; i < nodePath.length - 1; i++) {
    const a = nodePath[i]
    const b = nodePath[i + 1]
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (!edgeLookup.has(key)) {
      console.warn(`[CampusGraph] Edge not found: ${key}`)
      return false
    }
  }
  return true
}

export function getComponentsTraversed(nodePath: string[], comps: string[][]): number {
  const visitedComps = new Set<number>()
  for (const id of nodePath) {
    for (let i = 0; i < comps.length; i++) {
      if (comps[i].includes(id)) {
        visitedComps.add(i)
        break
      }
    }
  }
  return visitedComps.size
}

export function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function projectPointOnSegment(
  lat: number, lng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): { lat: number; lng: number; distance: number; t: number } {
  const dx = bLng - aLng
  const dy = bLat - aLat
  const lengthSq = dx * dx + dy * dy
  if (lengthSq < 1e-20) {
    const dist = getHaversineDistance(lat, lng, aLat, aLng)
    return { lat: aLat, lng: aLng, distance: dist, t: 0 }
  }
  let t = ((lng - aLng) * dx + (lat - aLat) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  const pLat = aLat + t * dy
  const pLng = aLng + t * dx
  const dist = getHaversineDistance(lat, lng, pLat, pLng)
  return { lat: pLat, lng: pLng, distance: dist, t }
}

export interface NearbyEdge {
  fromId: string
  toId: string
  projectedLat: number
  projectedLng: number
  distance: number
  t: number
  featureIdx: number
  edgeCost: number
}

export function findNearbyEdges(lat: number, lng: number, maxDistance: number): NearbyEdge[] {
  const results: NearbyEdge[] = []
  for (const edge of EDGES) {
    const a = nodeCoords[edge.from]
    const b = nodeCoords[edge.to]
    if (!a || !b) continue
    const proj = projectPointOnSegment(lat, lng, a.lat, a.lng, b.lat, b.lng)
    if (proj.distance <= maxDistance) {
      results.push({
        fromId: edge.from,
        toId: edge.to,
        projectedLat: proj.lat,
        projectedLng: proj.lng,
        distance: proj.distance,
        t: proj.t,
        featureIdx: edge.featureIdx,
        edgeCost: edge.cost,
      })
    }
  }
  results.sort((a, b) => a.distance - b.distance)
  return results
}

export function findNearestEdge(lat: number, lng: number): {
  fromId: string
  toId: string
  projectedLat: number
  projectedLng: number
  distance: number
  t: number
} | null {
  let best: {
    fromId: string
    toId: string
    projectedLat: number
    projectedLng: number
    distance: number
    t: number
  } | null = null
  let minDist = Infinity

  for (const edge of EDGES) {
    const a = nodeCoords[edge.from]
    const b = nodeCoords[edge.to]
    if (!a || !b) continue
    const proj = projectPointOnSegment(lat, lng, a.lat, a.lng, b.lat, b.lng)
    if (proj.distance < minDist) {
      minDist = proj.distance
      best = {
        fromId: edge.from,
        toId: edge.to,
        projectedLat: proj.lat,
        projectedLng: proj.lng,
        distance: proj.distance,
        t: proj.t,
      }
    }
  }

  return best
}
