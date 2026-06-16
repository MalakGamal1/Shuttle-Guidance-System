import * as fs from 'fs'
import * as path from 'path'
import { STATIONS, EDGES, buildGraph } from '../lib/university-graph'
import { ROAD_GEOMETRY } from '../lib/edge-geometry'

const mockFirestoreStations = [
  { id: "0sbuAScZzG7Dbiu6xBSU", name: "كلية الحاسبات و المعلومات", lat: 27.186198, lng: 31.168162 },
  { id: "AzqlIx99BldHQwZN6hcN", name: "كلية الصيدلة", lat: 27.18818, lng: 31.165757 },
  { id: "JYYrtbsIlz9v8Vq3QzKc", name: "كلية الزراعة", lat: 27.18835, lng: 31.168949 },
  { id: "V4zxq08WnmvS8KlivfdG", name: "بوابة الترعة", lat: 27.191397, lng: 31.173 },
  { id: "Z3GODIJdkw4OGwgevOJh", name: "كلية التربية", lat: 27.189405, lng: 31.1729 },
  { id: "c5XobcRdrUYlnC1P6RQF", name: "بوابة مستشفى الجامعة", lat: 27.186881, lng: 31.1663 },
  { id: "f4ukuh8Dxxtv4l0KM7hH", name: "بوابة الصيانة", lat: 27.18444, lng: 31.16852 },
  { id: "f6hwuB5XCNMoiXFR0kNE", name: "كلية العلوم", lat: 27.18895, lng: 31.1713 },
  { id: "hhshQzvx6JBtyN2XOWrQ", name: "كلية التربية الرياضية", lat: 27.1885, lng: 31.166495 },
  { id: "jZtWXtuPx0zd5hR791HE", name: "بوابة الجامعة الرئيسية", lat: 27.186347, lng: 31.17488 },
  { id: "ppo8pfwkoqe9I7W6dh8G", name: "ملعب جامعة أسيوط", lat: 27.188874, lng: 31.174286 },
  { id: "s94mttXqsdLjzAyIqnLE", name: "كلية الهندسة", lat: 27.1876, lng: 31.1723 },
  { id: "sciqfxN1U34f7s0XE3Zg", name: "المدينة الجامعية (أ)", lat: 27.187788, lng: 31.178294 },
  { id: "thOOMFdu8483n9YOKy2A", name: "كلية الطب", lat: 27.187162, lng: 31.16765 },
  { id: "wNPichJG4cHmJSM5jRr0", name: "المدينة الجامعية (د)", lat: 27.1883, lng: 31.1753 },
  { id: "wV6eQZXbZyM7ze2J5xkX", name: "كلية الحقوق و التجارة", lat: 27.187958, lng: 31.173506 },
  { id: "x0miqk0qUs1k64fqxnuf", name: "كلية طب الأسنان", lat: 27.18696, lng: 31.169494 }
]

buildGraph(mockFirestoreStations)

const missingEdges = [
  { from: 'JYYrtbsIlz9v8Vq3QzKc', to: 'f6hwuB5XCNMoiXFR0kNE' }, // Agriculture -> Science
  { from: 'f6hwuB5XCNMoiXFR0kNE', to: 'ppo8pfwkoqe9I7W6dh8G' }, // Science -> Stadium
  { from: 'Z3GODIJdkw4OGwgevOJh', to: 's94mttXqsdLjzAyIqnLE' }, // Education -> Engineering
  { from: 'ppo8pfwkoqe9I7W6dh8G', to: 'jZtWXtuPx0zd5hR791HE' }  // Stadium -> Main Gate
]

async function fetchOSRM(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  const json = await res.json()
  if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
    return json.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]])
  }
  throw new Error(`OSRM failed: ${json.message}`)
}

async function main() {
  const updatedGeometry = { ...ROAD_GEOMETRY }

  for (const edge of missingEdges) {
    const fromNode = STATIONS.find(s => s.id === edge.from)
    const toNode = STATIONS.find(s => s.id === edge.to)
    if (!fromNode || !toNode) continue

    console.log(`Fetching OSRM for: ${fromNode.name} <-> ${toNode.name}`)
    
    try {
      const forward = await fetchOSRM(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng)
      const backward = await fetchOSRM(toNode.lat, toNode.lng, fromNode.lat, fromNode.lng)
      
      updatedGeometry[`${edge.from}-${edge.to}`] = forward
      updatedGeometry[`${edge.to}-${edge.from}`] = backward
      
      console.log(`  Success! Forward coords: ${forward.length}, Backward: ${backward.length}`)
    } catch (e: any) {
      console.error(`  Failed for ${fromNode.name} -> ${toNode.name}:`, e.message)
    }
    
    // Pause to prevent rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  const filePath = path.join(__dirname, '../lib/edge-geometry.ts')
  const content = `// Auto-generated exact OSM road geometry
// Fetched from OSRM to ensure polylines strictly follow campus roads

export const ROAD_GEOMETRY: Record<string, [number, number][]> = ${JSON.stringify(updatedGeometry, null, 2)}
`
  fs.writeFileSync(filePath, content)
  console.log(`Successfully updated ${filePath}!`)
}

main()
