const fs = require('fs')
const path = require('path')
const https = require('https')

const graphFile = fs.readFileSync(path.join(__dirname, '../lib/university-graph.ts'), 'utf8')

function extractArray(name) {
  const regex = new RegExp(`export const ${name}(?:\\s*:\\s*[\\w\\[\\]]+)?\\s*=\\s*(\\[[\\s\\S]*?\\])(?:\\n\\n|\\nexport)`)
  const match = graphFile.match(regex)
  if (!match) throw new Error(`Could not find ${name}`)
  
  let code = match[1]
    .replace(/id:/g, '"id":')
    .replace(/name:/g, '"name":')
    .replace(/lat:/g, '"lat":')
    .replace(/lng:/g, '"lng":')
    .replace(/from:/g, '"from":')
    .replace(/to:/g, '"to":')
    .replace(/cost:/g, '"cost":')
    .replace(/'/g, '"')
    .replace(/,\s*\]/g, ']') // remove trailing commas
    .replace(/\/\/.*$/gm, '') // remove single-line comments

  return JSON.parse(code)
}

const STATIONS = extractArray('STATIONS')
const EDGES = extractArray('EDGES')

const getStation = (id) => STATIONS.find(s => s.id === id)

function fetchGeometry(from, to) {
  return new Promise((resolve, reject) => {
    // Use driving profile so the shuttle sticks to actual car roads, not pedestrian walkways
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
            const coords = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
            resolve(coords)
          } else {
            console.warn(`OSRM failed for ${from.id} -> ${to.id}:`, json.message || json.code)
            resolve([[from.lat, from.lng], [to.lat, to.lng]])
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function main() {
  const edgeGeometry = {}
  console.log(`Fetching geometry for ${EDGES.length} edges...`)
  
  for (let i = 0; i < EDGES.length; i++) {
    const edge = EDGES[i]
    const from = getStation(edge.from)
    const to = getStation(edge.to)
    
    if (!from || !to) continue
    
    console.log(`[${i+1}/${EDGES.length}] ${from.name} -> ${to.name}`)
    
    try {
      const coords = await fetchGeometry(from, to)
      const key = `${edge.from}-${edge.to}`
      edgeGeometry[key] = coords
      
      const reverseCoords = await fetchGeometry(to, from)
      const reverseKey = `${edge.to}-${edge.from}`
      edgeGeometry[reverseKey] = reverseCoords
      
      await new Promise(r => setTimeout(r, 400))
    } catch (e) {
      console.error(`Error on edge ${edge.from} -> ${edge.to}`, e)
    }
  }
  
  const outFile = path.join(__dirname, '../lib/edge-geometry.ts')
  const outContent = `// Auto-generated exact OSM road geometry
// Fetched from OSRM to ensure polylines strictly follow campus roads

export const ROAD_GEOMETRY: Record<string, [number, number][]> = ${JSON.stringify(edgeGeometry, null, 2)}
`
  fs.writeFileSync(outFile, outContent)
  console.log(`Done! Wrote ${Object.keys(edgeGeometry).length} edge geometries to ${outFile}`)
}

main()
