const fs = require('fs')
const path = require('path')

// Haversine distance in meters
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

const geomFile = fs.readFileSync(path.join(__dirname, '../lib/edge-geometry.ts'), 'utf8')
const jsGeomFile = geomFile.replace(/export const ROAD_GEOMETRY:\s*Record[^=]+=\s*/, 'const ROAD_GEOMETRY = ')
const ROAD_GEOMETRY = eval(`
  const exports = {};
  ${jsGeomFile};
  ROAD_GEOMETRY;
`)

const graphPath = path.join(__dirname, '../lib/university-graph.ts')
let graphContent = fs.readFileSync(graphPath, 'utf8')

// We will find the EDGES array and rebuild it
const edgesRegex = /export const EDGES:\s*GraphEdge\[\]\s*=\s*\[([\s\S]*?)\]/
const match = graphContent.match(edgesRegex)

if (!match) {
  console.error("Could not find EDGES array in university-graph.ts")
  process.exit(1)
}

const edgesCode = '[' + match[1] + ']'
const EDGES = eval(edgesCode)

const newEdgesStrParts = []
newEdgesStrParts.push('export const EDGES: { from: string; to: string; cost: number }[] = [')

for (const edge of EDGES) {
  const key1 = `${edge.from}-${edge.to}`
  const key2 = `${edge.to}-${edge.from}`
  const geom = ROAD_GEOMETRY[key1] || ROAD_GEOMETRY[key2]
  
  let newCost = edge.cost
  
  if (geom && geom.length > 1) {
    let dist = 0
    for (let i = 0; i < geom.length - 1; i++) {
      dist += getHaversineDistance(geom[i][0], geom[i][1], geom[i+1][0], geom[i+1][1])
    }
    newCost = Math.round(dist)
    console.log(`Updated ${key1}: ${edge.cost} -> ${newCost}m`)
  } else {
    console.warn(`No geometry found for ${key1}`)
  }
  
  newEdgesStrParts.push(`  { from: '${edge.from}', to: '${edge.to}', cost: ${newCost} },`)
}

newEdgesStrParts.push(']')

const newEdgesBlock = newEdgesStrParts.join('\n')
const newGraphContent = graphContent.replace(edgesRegex, newEdgesBlock)

fs.writeFileSync(graphPath, newGraphContent)
console.log("university-graph.ts successfully updated with exact costs!")
