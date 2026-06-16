import {
  buildGraph,
  getOptimalRoute,
  buildDetailedPath,
  getPathLength,
  STATIONS,
  isRouteInsideCampus,
} from '../lib/university-graph'

const mock = [
  { id: '0sbuAScZzG7Dbiu6xBSU', name: 'CS', lat: 27.186198, lng: 31.168162 },
  { id: 'AzqlIx99BldHQwZN6hcN', name: 'Pharmacy', lat: 27.18818, lng: 31.165757 },
  { id: 'JYYrtbsIlz9v8Vq3QzKc', name: 'Agriculture', lat: 27.18835, lng: 31.168949 },
  { id: 'V4zxq08WnmvS8KlivfdG', name: 'Canal Gate', lat: 27.191397, lng: 31.173 },
  { id: 'Z3GODIJdkw4OGwgevOJh', name: 'Education', lat: 27.189405, lng: 31.1729 },
  { id: 'c5XobcRdrUYlnC1P6RQF', name: 'Hospital Gate', lat: 27.186881, lng: 31.1663 },
  { id: 'f4ukuh8Dxxtv4l0KM7hH', name: 'Maintenance Gate', lat: 27.18444, lng: 31.16852 },
  { id: 'f6hwuB5XCNMoiXFR0kNE', name: 'Science', lat: 27.18895, lng: 31.1713 },
  { id: 'hhshQzvx6JBtyN2XOWrQ', name: 'Sports Ed', lat: 27.1885, lng: 31.166495 },
  { id: 'jZtWXtuPx0zd5hR791HE', name: 'Main Gate', lat: 27.186347, lng: 31.17488 },
  { id: 'ppo8pfwkoqe9I7W6dh8G', name: 'Stadium', lat: 27.188874, lng: 31.174286 },
  { id: 's94mttXqsdLjzAyIqnLE', name: 'Engineering', lat: 27.1876, lng: 31.1723 },
  { id: 'sciqfxN1U34f7s0XE3Zg', name: 'Dorm A', lat: 27.187788, lng: 31.178294 },
  { id: 'thOOMFdu8483n9YOKy2A', name: 'Medicine', lat: 27.187162, lng: 31.16765 },
  { id: 'wNPichJG4cHmJSM5jRr0', name: 'Dorm D', lat: 27.1883, lng: 31.1753 },
  { id: 'wV6eQZXbZyM7ze2J5xkX', name: 'Law', lat: 27.187958, lng: 31.173506 },
  { id: 'x0miqk0qUs1k64fqxnuf', name: 'Dental', lat: 27.18696, lng: 31.169494 },
]

buildGraph(mock)

async function osrmSegment(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const r = await fetch(url)
  const d = await r.json()
  const route = d.routes[0]
  const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number])
  return {
    distance: Math.round(route.distance),
    insideCampus: isRouteInsideCampus(coords),
    coords,
  }
}

async function main() {
  const shuttleLat = 27.18696
  const shuttleLng = 31.169494
  const targets = ['jZtWXtuPx0zd5hR791HE', 'V4zxq08WnmvS8KlivfdG', 'ppo8pfwkoqe9I7W6dh8G', 's94mttXqsdLjzAyIqnLE']

  for (const t of targets) {
    const route = getOptimalRoute(shuttleLat, shuttleLng, [t])
    const names = route.map((id) => STATIONS.find((s) => s.id === id)?.name)
    const detailed = buildDetailedPath(route)
    const internalLen = Math.round(getPathLength(detailed.map((p) => [p.lat, p.lng])))

    let osrmTotal = 0
    for (let i = 0; i < route.length - 1; i++) {
      const a = STATIONS.find((s) => s.id === route[i])!
      const b = STATIONS.find((s) => s.id === route[i + 1])!
      const seg = await osrmSegment(a, b)
      console.log(
        `  seg ${a.name} -> ${b.name}: osrm=${seg.distance}m inside=${seg.insideCampus}`
      )
      osrmTotal += seg.distance
    }

    console.log(
      `Target ${STATIONS.find((s) => s.id === t)?.name}: ${names.join(' -> ')}, internal=${internalLen}m, osrm_total=${osrmTotal}m\n`
    )
  }
}

main()
