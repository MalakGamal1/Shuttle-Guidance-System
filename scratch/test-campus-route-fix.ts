import {
  buildGraph,
  getOptimalRoute,
  buildCampusRoute,
  getPathLength,
  STATIONS,
} from '../lib/university-graph'

const mockFirestoreStations = [
  { id: '0sbuAScZzG7Dbiu6xBSU', name: 'كلية الحاسبات و المعلومات', lat: 27.186198, lng: 31.168162 },
  { id: 'AzqlIx99BldHQwZN6hcN', name: 'كلية الصيدلة', lat: 27.18818, lng: 31.165757 },
  { id: 'JYYrtbsIlz9v8Vq3QzKc', name: 'كلية الزراعة', lat: 27.18835, lng: 31.168949 },
  { id: 'V4zxq08WnmvS8KlivfdG', name: 'بوابة الترعة', lat: 27.191397, lng: 31.173 },
  { id: 'Z3GODIJdkw4OGwgevOJh', name: 'كلية التربية', lat: 27.189405, lng: 31.1729 },
  { id: 'c5XobcRdrUYlnC1P6RQF', name: 'بوابة مستشفى الجامعة', lat: 27.186881, lng: 31.1663 },
  { id: 'f4ukuh8Dxxtv4l0KM7hH', name: 'بوابة الصيانة', lat: 27.18444, lng: 31.16852 },
  { id: 'f6hwuB5XCNMoiXFR0kNE', name: 'كلية العلوم', lat: 27.18895, lng: 31.1713 },
  { id: 'hhshQzvx6JBtyN2XOWrQ', name: 'كلية التربية الرياضية', lat: 27.1885, lng: 31.166495 },
  { id: 'jZtWXtuPx0zd5hR791HE', name: 'بوابة الجامعة الرئيسية', lat: 27.186347, lng: 31.17488 },
  { id: 'ppo8pfwkoqe9I7W6dh8G', name: 'ملعب جامعة أسيوط', lat: 27.188874, lng: 31.174286 },
  { id: 's94mttXqsdLjzAyIqnLE', name: 'كلية الهندسة', lat: 27.1876, lng: 31.1723 },
  { id: 'sciqfxN1U34f7s0XE3Zg', name: 'المدينة الجامعية (أ)', lat: 27.187788, lng: 31.178294 },
  { id: 'thOOMFdu8483n9YOKy2A', name: 'كلية الطب', lat: 27.187162, lng: 31.16765 },
  { id: 'wNPichJG4cHmJSM5jRr0', name: 'المدينة الجامعية (د)', lat: 27.1883, lng: 31.1753 },
  { id: 'wV6eQZXbZyM7ze2J5xkX', name: 'كلية الحقوق و التجارة', lat: 27.187958, lng: 31.173506 },
  { id: 'x0miqk0qUs1k64fqxnuf', name: 'كلية طب الأسنان', lat: 27.18696, lng: 31.169494 },
]

buildGraph(mockFirestoreStations)

// Shuttle near dental faculty -> main gate (north-east entrance)
const shuttleLat = 27.18696
const shuttleLng = 31.169494
const mainGateId = 'jZtWXtuPx0zd5hR791HE'

const waypoints = getOptimalRoute(shuttleLat, shuttleLng, [mainGateId])
const route = buildCampusRoute(waypoints)
const lengthM = Math.round(getPathLength(route.pathWithCoords.map((p) => [p.lat, p.lng])))

console.log('Waypoints:', waypoints.map((id) => STATIONS.find((s) => s.id === id)?.name).join(' -> '))
console.log('Route source:', route.source)
console.log('Route length:', lengthM, 'm')
console.log('Coordinate count:', route.pathWithCoords.length)

if (lengthM > 1500) {
  console.error('FAIL: route exceeds 1.5km — southern loop likely still present')
  process.exit(1)
}

if (route.source !== 'Internal Graph') {
  console.error('FAIL: expected Internal Graph routing')
  process.exit(1)
}

console.log('PASS: dental -> main gate uses internal campus roads (~927m expected)')
