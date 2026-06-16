const fs = require('fs')
const ts = fs.readFileSync('./lib/university-graph.ts', 'utf8')
const geom = require('./lib/edge-geometry.ts').ROAD_GEOMETRY

// quick mock
const lines = ts.split('\n')
let inEdges = false
let edgesStr = ''
for(const line of lines) {
  if (line.includes('export const EDGES')) { inEdges = true; edgesStr += '['; continue; }
  if (inEdges) {
    if (line.includes(']')) { edgesStr += ']'; break; }
    edgesStr += line + '\n'
  }
}
// parse EDGES
const EDGES = eval(edgesStr)
let missing = 0
for (const e of EDGES) {
  const k1 = e.from + '-' + e.to
  const k2 = e.to + '-' + e.from
  if (!geom[k1] && !geom[k2]) {
    console.log('MISSING IN GEOMETRY:', k1)
    missing++
  }
}
console.log('Total missing:', missing)
