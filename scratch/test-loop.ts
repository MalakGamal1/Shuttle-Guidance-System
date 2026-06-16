import { ROAD_GEOMETRY } from '../lib/edge-geometry'
import { getHaversineDistance, HELPER_NODES } from '../lib/university-graph'

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

const STATIONS_MAP = new Map<string, { lat: number, lng: number }>()
mockFirestoreStations.forEach(s => STATIONS_MAP.set(s.id, { lat: s.lat, lng: s.lng }))
HELPER_NODES.forEach(s => STATIONS_MAP.set(s.id, { lat: s.lat, lng: s.lng }))

function getPathLength(points: [number, number][]): number {
  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length += getHaversineDistance(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  }
  return length
}

for (const key of Object.keys(ROAD_GEOMETRY)) {
  const [fromId, toId] = key.split('-')
  const fromNode = STATIONS_MAP.get(fromId)
  const toNode = STATIONS_MAP.get(toId)
  if (fromNode && toNode) {
    const directDist = getHaversineDistance(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng)
    const pathLen = getPathLength(ROAD_GEOMETRY[key])
    const ratio = pathLen / directDist
    if (ratio > 2.0 && directDist > 50) {
      console.log(`Detour detected: ${key} (${fromId} -> ${toId})`)
      console.log(`  Direct distance: ${directDist.toFixed(1)}m`)
      console.log(`  Path length: ${pathLen.toFixed(1)}m`)
      console.log(`  Ratio: ${ratio.toFixed(2)}`)
    }
  }
}
