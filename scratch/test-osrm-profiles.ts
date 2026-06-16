import { getHaversineDistance } from '../lib/university-graph'

const from = { name: "كلية العلوم", lat: 27.18895, lng: 31.1713 }
const to = { name: "الميدان الرئيسي", lat: 27.1865, lng: 31.1710 }

async function testProfile(profile: string) {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
      const coords = json.routes[0].geometry.coordinates
      console.log(`Profile [${profile}]:`)
      console.log(`  Distance: ${json.routes[0].distance.toFixed(1)}m`)
      console.log(`  Number of coordinates: ${coords.length}`)
    } else {
      console.log(`Profile [${profile}] failed:`, json.message)
    }
  } catch (e: any) {
    console.log(`Profile [${profile}] threw error:`, e.message)
  }
}

async function main() {
  await testProfile('driving')
  await testProfile('walking')
  await testProfile('foot')
  await testProfile('bicycle')
}

main()
