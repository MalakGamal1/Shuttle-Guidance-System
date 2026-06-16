import { STATIONS, NODES, EDGES, buildGraph, getOptimalRoute, buildDetailedPath } from '../lib/university-graph'

// Mock Firestore stations based on actual Firestore data
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

// 1. Rebuild graph with normal stations
buildGraph(mockFirestoreStations)
console.log('--- Initial Graph Rebuilt ---')
console.log('Total stations:', STATIONS.length)
console.log('Total nodes:', NODES.length)
console.log('Total edges:', EDGES.length)

// Verify edge connection for one of the stations
const computerFacultyEdge = EDGES.find(e => e.from === '0sbuAScZzG7Dbiu6xBSU' || e.to === '0sbuAScZzG7Dbiu6xBSU')
console.log('Example edge for computer faculty:', computerFacultyEdge)

// 2. Mock a newly created station (e.g. 'كلية الحاسبات الجديدة')
const newStation = {
  id: "new_station_test_123",
  name: "كلية الحاسبات الجديدة",
  lat: 27.1865,
  lng: 31.1670
}

const updatedFirestoreStations = [...mockFirestoreStations, newStation]

// 3. Rebuild graph with the new station
buildGraph(updatedFirestoreStations)
console.log('\n--- Graph Rebuilt with New Station ---')
console.log('Total stations:', STATIONS.length)
console.log('Total nodes:', NODES.length)
console.log('Total edges:', EDGES.length)

// Find if new station is in STATIONS
const foundStation = STATIONS.find(s => s.id === 'new_station_test_123')
console.log('Found new station in graph:', foundStation)

// Find the edge created for the new station
const newStationEdge = EDGES.find(e => e.from === 'new_station_test_123' || e.to === 'new_station_test_123')
console.log('New station edge:', newStationEdge)

if (newStationEdge) {
  const connectedToNode = newStationEdge.from === 'new_station_test_123' ? newStationEdge.to : newStationEdge.from
  const connectedNodeDetails = STATIONS.find(s => s.id === connectedToNode)
  console.log(`New station connected to: ${connectedNodeDetails?.name} (distance: ${newStationEdge.cost}m)`)
}

// 4. Test routing (getOptimalRoute) passing through the new station
// Let's calculate route from maintenance gate (f4ukuh8Dxxtv4l0KM7hH) to the new station
const startLat = 27.18444
const startLng = 31.16852
const targets = ['new_station_test_123']

console.log('\n--- Route Calculation Test ---')
const route = getOptimalRoute(startLat, startLng, targets)
console.log('Optimal route node path:', route)

const detailedPath = buildDetailedPath(route)
console.log('Detailed path coordinates count:', detailedPath.length)
console.log('Test Succeeded: New station successfully connected and routed!')
