const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lib', 'campus-roads.json'), 'utf8'));

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SNAP_METERS = 2;

// ── Build graph ──
const nodeMap = new Map();
const edgeSet = new Set();
const edgeMeta = new Map();
const grid = new Map();
const nodeToFeatures = new Map();

function gridKey(lat, lng) { return `${Math.round(lat * 50000)}_${Math.round(lng * 50000)}`; }

function findOrCreateNode(lat, lng) {
  const key = gridKey(lat, lng);
  if (grid.has(key)) {
    const nodeId = grid.get(key);
    const existing = nodeMap.get(nodeId);
    if (haversine(existing.lat, existing.lng, lat, lng) < SNAP_METERS) return nodeId;
  }
  const parts = key.split('_').map(Number);
  for (let dl = -1; dl <= 1; dl++) {
    for (let dg = -1; dg <= 1; dg++) {
      if (dl === 0 && dg === 0) continue;
      const nk = `${parts[0] + dl}_${parts[1] + dg}`;
      if (grid.has(nk)) {
        const nodeId = grid.get(nk);
        const existing = nodeMap.get(nodeId);
        if (haversine(existing.lat, existing.lng, lat, lng) < SNAP_METERS) return nodeId;
      }
    }
  }
  const id = `n_${nodeMap.size}`;
  nodeMap.set(id, { lat, lng });
  grid.set(key, id);
  return id;
}

data.features.forEach((feature, featureIdx) => {
  if (feature.geometry.type !== 'LineString') return;
  const coords = feature.geometry.coordinates;
  if (coords.length < 2) return;
  const nodeIds = coords.map(([lng, lat]) => {
    const nid = findOrCreateNode(lat, lng);
    if (!nodeToFeatures.has(nid)) nodeToFeatures.set(nid, new Set());
    nodeToFeatures.get(nid).add(featureIdx);
    return nid;
  });
  for (let i = 0; i < nodeIds.length - 1; i++) {
    if (nodeIds[i] === nodeIds[i+1]) continue;
    const key = nodeIds[i] < nodeIds[i+1] ? `${nodeIds[i]}-${nodeIds[i+1]}` : `${nodeIds[i+1]}-${nodeIds[i]}`;
    edgeSet.add(key);
    edgeMeta.set(key, { segDir: feature.properties?.direction || 'both', originalFrom: nodeIds[i], originalTo: nodeIds[i+1], featureIdx });
  }
});

const nodeCoords = {};
nodeMap.forEach((coords, id) => { nodeCoords[id] = coords; });

function projectPointOnSegment(lat, lng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng, dy = bLat - aLat;
  const lengthSq = dx*dx + dy*dy;
  if (lengthSq < 1e-20) return { lat: aLat, lng: aLng, distance: haversine(lat, lng, aLat, aLng), t: 0 };
  let t = ((lng - aLng)*dx + (lat - aLat)*dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return { lat: aLat + t*dy, lng: aLng + t*dx, distance: haversine(lat, lng, aLat + t*dy, aLng + t*dx), t };
}

let junctionsDetected = 0, roadsSplit = 0;
const splitsByEdge = new Map();
edgeSet.forEach(edgeKey => {
  const [idA, idB] = edgeKey.split('-');
  const cA = nodeMap.get(idA), cB = nodeMap.get(idB);
  if (!cA || !cB) return;
  for (const [nodeId, coord] of Object.entries(nodeCoords)) {
    if (nodeId === idA || nodeId === idB) continue;
    const proj = projectPointOnSegment(coord.lat, coord.lng, cA.lat, cA.lng, cB.lat, cB.lng);
    if (proj.distance < 2 && proj.t > 0.05 && proj.t < 0.95) {
      if (!splitsByEdge.has(edgeKey)) splitsByEdge.set(edgeKey, []);
      splitsByEdge.get(edgeKey).push({ nodeId, projLat: proj.lat, projLng: proj.lng, t: proj.t });
    }
  }
});

if (splitsByEdge.size > 0) {
  splitsByEdge.forEach((splits, edgeKey) => {
    splits.sort((a,b) => a.t - b.t);
    const [idA, idB] = edgeKey.split('-');
    const parentMeta = edgeMeta.get(edgeKey);
    const pfIdx = parentMeta?.featureIdx ?? -1;
    edgeSet.delete(edgeKey);
    let prevId = idA;
    splits.forEach(split => {
      const jId = `j_${junctionsDetected++}`;
      nodeMap.set(jId, { lat: split.projLat, lng: split.projLng });
      const ek1 = prevId < jId ? `${prevId}-${jId}` : `${jId}-${prevId}`;
      edgeSet.add(ek1);
      edgeMeta.set(ek1, { segDir: parentMeta?.segDir, originalFrom: prevId, originalTo: jId, featureIdx: pfIdx });
      const ek2 = jId < split.nodeId ? `${jId}-${split.nodeId}` : `${split.nodeId}-${jId}`;
      edgeSet.add(ek2);
      edgeMeta.set(ek2, { originalFrom: jId, originalTo: split.nodeId, featureIdx: -1 });
      roadsSplit++;
      prevId = jId;
    });
    const ekLast = prevId < idB ? `${prevId}-${idB}` : `${idB}-${prevId}`;
    edgeSet.add(ekLast);
    edgeMeta.set(ekLast, { segDir: parentMeta?.segDir, originalFrom: prevId, originalTo: idB, featureIdx: pfIdx });
  });

  for (const key of Object.keys(nodeCoords)) delete nodeCoords[key];
  nodeMap.forEach((coords, id) => { nodeCoords[id] = coords; });
}

let edges = [];
edgeSet.forEach(key => {
  const [id1, id2] = key.split('-');
  const c1 = nodeMap.get(id1), c2 = nodeMap.get(id2);
  if (!c1 || !c2) return;
  const cost = Math.round(haversine(c1.lat, c1.lng, c2.lat, c2.lng));
  const meta = edgeMeta.get(key);
  edges.push({ from: meta?.originalFrom || id1, to: meta?.originalTo || id2, cost, segDir: meta?.segDir, featureIdx: meta?.featureIdx ?? -1 });
});

// Build directed adjacency
const adj = {};
nodeMap.forEach((_, id) => { adj[id] = []; });
edges.forEach(e => {
  const dir = e.segDir || 'both';
  if (dir === 'forward') adj[e.from].push(e.to);
  else if (dir === 'reverse') adj[e.to].push(e.from);
  else { adj[e.from].push(e.to); adj[e.to].push(e.from); }
});

// A*
function aStar(startId, goalId) {
  if (startId === goalId) return { path: [startId], cost: 0 };
  const allNodes = [...nodeMap.keys()];
  const goalNode = nodeMap.get(goalId);
  if (!goalNode) return { path: [], cost: Infinity };
  const openSet = new Set([startId]);
  const cameFrom = {};
  const gScore = {}, fScore = {};
  allNodes.forEach(id => { gScore[id] = Infinity; fScore[id] = Infinity; });
  gScore[startId] = 0;
  const startNode = nodeMap.get(startId);
  if (!startNode) return { path: [], cost: Infinity };
  fScore[startId] = haversine(startNode.lat, startNode.lng, goalNode.lat, goalNode.lng);
  while (openSet.size > 0) {
    let currentId = '', minF = Infinity;
    openSet.forEach(id => { if (fScore[id] < minF) { minF = fScore[id]; currentId = id; } });
    if (currentId === goalId) {
      const path = []; let cur = currentId;
      while (cameFrom[cur]) { path.unshift(cur); cur = cameFrom[cur]; }
      path.unshift(startId);
      return { path, cost: Math.round(gScore[goalId]) };
    }
    openSet.delete(currentId);
    for (const nb of adj[currentId] || []) {
      const ek = currentId < nb ? `${currentId}-${nb}` : `${nb}-${currentId}`;
      const edge = edges.find(e => { const ek2 = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`; return ek2 === ek; });
      if (!edge) continue;
      const tg = gScore[currentId] + edge.cost;
      if (tg < gScore[nb]) {
        cameFrom[nb] = currentId;
        gScore[nb] = tg;
        const nn = nodeMap.get(nb);
        if (nn) { fScore[nb] = tg + haversine(nn.lat, nn.lng, goalNode.lat, goalNode.lng); openSet.add(nb); }
      }
    }
  }
  return { path: [], cost: Infinity };
}

function getNearestNode(lat, lng) {
  let nearest = '', minDist = Infinity;
  nodeMap.forEach((c, id) => { const d = (c.lng-lng)**2 + (c.lat-lat)**2; if (d < minDist) { minDist = d; nearest = id; } });
  return nearest;
}

function pathCost(nodePath) {
  let cost = 0;
  for (let i = 0; i < nodePath.length - 1; i++) {
    const ek = nodePath[i] < nodePath[i+1] ? `${nodePath[i]}-${nodePath[i+1]}` : `${nodePath[i+1]}-${nodePath[i]}`;
    const edge = edges.find(e => { const ek2 = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`; return ek2 === ek; });
    if (edge) cost += edge.cost;
  }
  return cost;
}

// ── STEP 1: Identify ALL connector features at the roundabout ──
console.log('========== ROUNDABOUT CONNECTOR FEATURES ==========\n');

// The roundabout is around lng=31.174, lat=27.188 (near F31/F34/F1 junction)
const connectorIds = [];
data.features.forEach((f, idx) => {
  if (f.geometry.type !== 'LineString') return;
  const c = f.geometry.coordinates;
  if (c.length < 2) return;
  // Check if near the roundabout (lng ~31.174, lat ~27.188)
  let near = 0;
  c.forEach(([lng, lat]) => {
    if (Math.abs(lng - 31.174) < 0.002 && Math.abs(lat - 27.188) < 0.002) near++;
  });
  if (near > 0 && c.length >= 2) {
    connectorIds.push(idx);
    const dir = f.properties?.direction || 'both';
    const l = c.length;
    const first = c[0], last = c[c.length-1];
    const len = haversine(first[1], first[0], last[1], last[0]);
    console.log(`F${idx}: dir=${dir} points=${l} length=${Math.round(len)}m`);
    console.log(`  first: [${first[1].toFixed(6)},${first[0].toFixed(6)}]`);
    console.log(`  last:  [${last[1].toFixed(6)},${last[0].toFixed(6)}]`);
    
    // Show all coordinates for curved connectors
    if (l > 2) {
      console.log('  coords:');
      c.forEach(([lng, lat], pi) => {
        console.log(`    [${pi}]: [${lat.toFixed(6)},${lng.toFixed(6)}]`);
      });
    }
  }
});

// ── STEP 2: For each connector, check ADJ status ──
console.log('\n========== CONNECTOR ADJ ANALYSIS ==========\n');

function getFeatureIdsForNode(nodeId) {
  return [...(nodeToFeatures.get(nodeId) || new Set())].sort((a,b) => a-b);
}

connectorIds.forEach(idx => {
  const f = data.features[idx];
  const c = f.geometry.coordinates;
  const nodeIds = c.map(([lng, lat]) => {
    const key = gridKey(lat, lng);
    if (grid.has(key)) {
      const nid = grid.get(key);
      if (haversine(nodeMap.get(nid).lat, nodeMap.get(nid).lng, lat, lng) < SNAP_METERS) return nid;
    }
    for (let dl = -1; dl <= 1; dl++) {
      for (let dg = -1; dg <= 1; dg++) {
        const nk = `${Math.round(lat*50000)+dl}_${Math.round(lng*50000)+dg}`;
        if (grid.has(nk)) {
          const nid = grid.get(nk);
          if (haversine(nodeMap.get(nid).lat, nodeMap.get(nid).lng, lat, lng) < SNAP_METERS) return nid;
        }
      }
    }
    return null;
  });
  
  const dir = f.properties?.direction || 'both';
  console.log(`F${idx} (dir=${dir}):`);
  
  for (let i = 0; i < nodeIds.length - 1; i++) {
    if (!nodeIds[i] || !nodeIds[i+1]) {
      console.log(`  segment ${i}->${i+1}: NODE SNAPPING FAILED`);
      continue;
    }
    const a = nodeIds[i], b = nodeIds[i+1];
    const featuresA = getFeatureIdsForNode(a);
    const featuresB = getFeatureIdsForNode(b);
    const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
    const inEdgeSet = edgeSet.has(ek);
    const fwd = (adj[a] || []).includes(b);
    const rev = (adj[b] || []).includes(a);
    const coordA = nodeCoords[a], coordB = nodeCoords[b];
    const dist = coordA && coordB ? Math.round(haversine(coordA.lat, coordA.lng, coordB.lat, coordB.lng)) : 0;
    
    console.log(`  ${a} -> ${b} dist=${dist}m edge_exists=${inEdgeSet} fwd=${fwd} rev=${rev}`);
    console.log(`    features_of_${a}: [${featuresA.join(',')}]  features_of_${b}: [${featuresB.join(',')}]`);
    if (coordA) console.log(`    coord ${a}: [${coordA.lat.toFixed(6)}, ${coordA.lng.toFixed(6)}]`);
    if (coordB) console.log(`    coord ${b}: [${coordB.lat.toFixed(6)}, ${coordB.lng.toFixed(6)}]`);
  }
  
  // Check first and last node adjacency
  const firstN = nodeIds[0], lastN = nodeIds[nodeIds.length-1];
  if (firstN && lastN) {
    console.log(`  FIRST node ${firstN}: Adj[${firstN}] = [${(adj[firstN]||[]).join(', ')}]`);
    console.log(`  LAST node ${lastN}: Adj[${lastN}] = [${(adj[lastN]||[]).join(', ')}]`);
    
    // Check if edges exist IN BOTH DIRECTIONS if feature is 'both'
    if (dir === 'both') {
      for (let i = 0; i < nodeIds.length - 1; i++) {
        if (!nodeIds[i] || !nodeIds[i+1]) continue;
        const a = nodeIds[i], b = nodeIds[i+1];
        const fOk = (adj[a] || []).includes(b);
        const rOk = (adj[b] || []).includes(a);
        if (!fOk || !rOk) {
          console.log(`  ⚠ BIDIRECTIONAL FEATURE but direction missing: ${a}->${b} fwd=${fOk} rev=${rOk}`);
        }
      }
    }
  }
});

// ── STEP 3: Test specific routes that should use the connector ──
console.log('\n========== ROUTE COMPARISON ==========\n');

// From Dorm A to Engineering — should use curved connector F5
const dormA = { lat: 27.187850, lng: 31.178294, name: 'Dorm A' };
const engineering = { lat: 27.187630, lng: 31.172300, name: 'Engineering' };
const law = { lat: 27.187958, lng: 31.173506, name: 'Law' };
const dentistry = { lat: 27.186960, lng: 31.169494, name: 'Dentistry' };
const fci = { lat: 27.186198, lng: 31.168162, name: 'FCI Labs' };

const origins = [dormA];
const dests = [engineering, law, dentistry, fci];

for (const origin of origins) {
  for (const dest of dests) {
    const startId = getNearestNode(origin.lat, origin.lng);
    const endId = getNearestNode(dest.lat, dest.lng);
    const { path, cost } = aStar(startId, endId);
    const straightLine = Math.round(haversine(origin.lat, origin.lng, dest.lat, dest.lng));
    
    console.log(`\n--- ${origin.name} -> ${dest.name} ---`);
    console.log(`start=${startId} end=${endId}`);
    
    if (path.length === 0) {
      console.log(`NO PATH (cost=${cost})`);
      continue;
    }
    
    console.log(`distance=${cost}m straight_line=${straightLine}m ratio=${(cost/straightLine).toFixed(1)}x`);
    console.log(`nodes=${path.length}`);
    
    // Check if path uses any connector feature
    const usedFeatures = new Set();
    const visitedConnectors = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i+1];
      const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
      const edge = edges.find(e => { const ek2 = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`; return ek2 === ek; });
      if (edge && edge.featureIdx >= 0) {
        usedFeatures.add(edge.featureIdx);
        if (connectorIds.includes(edge.featureIdx)) visitedConnectors.push(edge.featureIdx);
      }
    }
    
    console.log(`features_used: [${[...usedFeatures].sort((a,b)=>a-b).join(',')}]`);
    if (visitedConnectors.length > 0) {
      console.log(`connectors_used: [${[...new Set(visitedConnectors)].sort((a,b)=>a-b).join(',')}] ✓`);
    } else {
      console.log(`connectors_used: NONE — route avoids all roundabout connectors`);
    }
    
    // Print first 10 segments to understand path
    console.log(`first_segments:`);
    for (let i = 0; i < Math.min(path.length - 1, 15); i++) {
      const a = path[i], b = path[i+1];
      const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
      const edge = edges.find(e => { const ek2 = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`; return ek2 === ek; });
      const fid = edge ? edge.featureIdx : -1;
      const coordA = nodeCoords[a], coordB = nodeCoords[b];
      console.log(`  ${a}->${b} F${fid} [${coordA?.lat?.toFixed(4)},${coordA?.lng?.toFixed(4)}]->[${coordB?.lat?.toFixed(4)},${coordB?.lng?.toFixed(4)}]`);
    }
    
    // Check if F5 (curved connector) is in the path
    const f5Start = data.features[5].geometry.coordinates;
    const f5Nodes = f5Start.map(([lng, lat]) => {
      const key = gridKey(lat, lng);
      if (grid.has(key)) {
        const nid = grid.get(key);
        if (haversine(nodeMap.get(nid).lat, nodeMap.get(nid).lng, lat, lng) < SNAP_METERS) return nid;
      }
      for (let dl = -1; dl <= 1; dl++) {
        for (let dg = -1; dg <= 1; dg++) {
          const nk = `${Math.round(lat*50000)+dl}_${Math.round(lng*50000)+dg}`;
          if (grid.has(nk)) {
            const nid = grid.get(nk);
            if (haversine(nodeMap.get(nid).lat, nodeMap.get(nid).lng, lat, lng) < SNAP_METERS) return nid;
          }
        }
      }
      return null;
    }).filter(x => x !== null);
    
    const usesF5 = f5Nodes.some(n => path.includes(n));
    console.log(`uses_F5_connector: ${usesF5}`);
  }
}

// ── STEP 4: Test route FROM Dorm A with FORCED path via F5 ──
console.log('\n========== FORCED CONNECTOR TEST ==========\n');

// Manually trace: can A* go from F5 start to F5 end?
const f5StartCoord = data.features[5].geometry.coordinates;
const f5First = f5StartCoord[0];
const f5Last = f5StartCoord[f5StartCoord.length - 1];

const f5FirstNode = findOrCreateNode(f5First[1], f5First[0]);
const f5LastNode = findOrCreateNode(f5Last[1], f5Last[0]);

console.log(`F5 first node: ${f5FirstNode} (${nodeCoords[f5FirstNode]?.lat?.toFixed(6)}, ${nodeCoords[f5FirstNode]?.lng?.toFixed(6)})`);
console.log(`F5 last node: ${f5LastNode} (${nodeCoords[f5LastNode]?.lat?.toFixed(6)}, ${nodeCoords[f5LastNode]?.lng?.toFixed(6)})`);

// Can A* traverse F5 end-to-end?
const f5Route = aStar(f5FirstNode, f5LastNode);
if (f5Route.path.length > 0) {
  console.log(`A* from F5 first->last: path=${f5Route.path.join('->')} cost=${f5Route.cost}m`);
  console.log(`  (expect ${f5Route.path.length} to be >= full F5 if connectors are working)`);
} else {
  console.log(`A* from F5 first->last: NO PATH — F5 ENDPOINTS NOT CONNECTED`);
}

// What about F5 last to F1 end?
const f1End = data.features[1].geometry.coordinates;
const f1LastCoord = f1End[f1End.length - 1];
const f1LastNode = findOrCreateNode(f1LastCoord[1], f1LastCoord[0]);
console.log(`\nF1 last node: ${f1LastNode} (${nodeCoords[f1LastNode]?.lat?.toFixed(6)}, ${nodeCoords[f1LastNode]?.lng?.toFixed(6)})`);
const f1ToF5 = aStar(f1LastNode, f5LastNode);
if (f1ToF5.path.length > 0) {
  console.log(`A* from F1 end->F5 end: cost=${f1ToF5.cost}m path=${f1ToF5.path.join('->')}`);
} else {
  console.log(`A* from F1 end->F5 end: NO PATH`);
}

// Check if F1 last and F5 first are the same node
console.log(`\nF1 last node == F5 first node? ${f1LastNode === f5FirstNode}`);
console.log(`Distance F1 last <-> F5 first: ${Math.round(haversine(f1LastCoord[1], f1LastCoord[0], f5First[1], f5First[0]))}m`);

// Check what node F5 first point maps to
const f5FirstKey = gridKey(f5First[1], f5First[0]);
const f5FirstDirect = grid.get(f5FirstKey);
console.log(`F5 first grid match: ${f5FirstDirect || 'none'}`);
console.log(`F5 first actual node: ${f5FirstNode}`);

// ── STEP 5: Check ALL short connectors and their connectivity ──
console.log('\n========== ALL SHORT CONNECTORS CONNECTIVITY ==========\n');

data.features.forEach((f, idx) => {
  if (f.geometry.type !== 'LineString') return;
  const c = f.geometry.coordinates;
  if (c.length < 2) return;
  const totalLen = c.reduce((sum, _, i) => {
    if (i === 0) return 0;
    return sum + haversine(c[i-1][1], c[i-1][0], c[i][1], c[i][0]);
  }, 0);
  if (totalLen > 100) return; // Only short features
  if (f.properties?.direction === 'forward' || f.properties?.direction === 'reverse') return; // Skip one-way
  
  // Check first node connectivity
  const firstNode = c.length > 0 ? findOrCreateNode(c[0][1], c[0][0]) : null;
  const lastNode = c.length > 0 ? findOrCreateNode(c[c.length-1][1], c[c.length-1][0]) : null;
  
  if (firstNode && lastNode) {
    const adjFirst = adj[firstNode] || [];
    const adjLast = adj[lastNode] || [];
    const firstFeatures = getFeatureIdsForNode(firstNode);
    const lastFeatures = getFeatureIdsForNode(lastNode);
    const onlyOnThisFeatureF = firstFeatures.length === 1 && firstFeatures[0] === idx;
    const onlyOnThisFeatureL = lastFeatures.length === 1 && lastFeatures[0] === idx;
    
    if (onlyOnThisFeatureF || onlyOnThisFeatureL) {
      console.log(`⚠ F${idx}: endpoint appears on NO OTHER FEATURE`);
      console.log(`  ${firstNode}: features=[${firstFeatures.join(',')}] isolated=${onlyOnThisFeatureF}`);
      console.log(`  ${lastNode}: features=[${lastFeatures.join(',')}] isolated=${onlyOnThisFeatureL}`);
      console.log(`  coord: [${c[0][1].toFixed(6)},${c[0][1].toFixed(6)}] -> [${c[c.length-1][1].toFixed(6)},${c[c.length-1][0].toFixed(6)}]`);
    }
  }
});

// ── FINAL: Identify nodes that are on F5 but not connected to any other feature ──
console.log('\n========== F5 ISOLATION CHECK ==========\n');

const f5Coords = data.features[5].geometry.coordinates;
f5Coords.forEach(([lng, lat], i) => {
  const nodeId = findOrCreateNode(lat, lng);
  const features = getFeatureIdsForNode(nodeId);
  const otherFeatures = features.filter(f => f !== 5);
  const coordStr = `[${lat.toFixed(6)},${lng.toFixed(6)}]`;
  const adjList = (adj[nodeId] || []).join(', ');
  console.log(`F5[${i}] node=${nodeId} ${coordStr} features=[${features.join(',')}] other_features=[${otherFeatures.join(',')}] Adj=[${adjList}]`);
});

// Also check if there's an edge between F5 last node and F31 reverse first node
console.log('\n--- F5 last -> F31/F34 connection ---');
// F31 reverse first node = n_203 (last coordinate of F31 before reverse direction)
const f31Coords = data.features[31].geometry.coordinates;
const f31Last = f31Coords[f31Coords.length - 1];
const f31LastNode = findOrCreateNode(f31Last[1], f31Last[0]);
console.log(`F31 last coord: [${f31Last[1].toFixed(6)},${f31Last[0].toFixed(6)}] node=${f31LastNode}`);
console.log(`F5 last node: ${f5LastNode} (${nodeCoords[f5LastNode]?.lat?.toFixed(6)},${nodeCoords[f5LastNode]?.lng?.toFixed(6)})`);
const dist5to31 = f5LastNode && f31LastNode ? Math.round(haversine(nodeCoords[f5LastNode].lat, nodeCoords[f5LastNode].lng, nodeCoords[f31LastNode].lat, nodeCoords[f31LastNode].lng)) : '?';
console.log(`Distance F5 last <-> F31 last: ${dist5to31}m`);

// Check if there's an edge connecting F5 last node to F31 last node in ADJ
if (f5LastNode && f31LastNode) {
  const ek = f5LastNode < f31LastNode ? `${f5LastNode}-${f31LastNode}` : `${f31LastNode}-${f5LastNode}`;
  const edgeExists = edgeSet.has(ek);
  const fwdOk = (adj[f5LastNode] || []).includes(f31LastNode);
  const revOk = (adj[f31LastNode] || []).includes(f5LastNode);
  console.log(`Edge F5->F31: exists=${edgeExists} fwd=${fwdOk} rev=${revOk}`);
}

// Check F5 first node to F1 last node
const f1EndCoord = data.features[1].geometry.coordinates;
const f1Last = f1EndCoord[f1EndCoord.length - 1];
const f1LastNode2 = findOrCreateNode(f1Last[1], f1Last[0]);
console.log(`\nF1 last coord: [${f1Last[1].toFixed(6)},${f1Last[0].toFixed(6)}] node=${f1LastNode2}`);
console.log(`F5 first node: ${f5FirstNode} (${nodeCoords[f5FirstNode]?.lat?.toFixed(6)},${nodeCoords[f5FirstNode]?.lng?.toFixed(6)})`);
const dist1to5 = f1LastNode2 && f5FirstNode ? Math.round(haversine(nodeCoords[f1LastNode2].lat, nodeCoords[f1LastNode2].lng, nodeCoords[f5FirstNode].lat, nodeCoords[f5FirstNode].lng)) : '?';
console.log(`Distance F1 last <-> F5 first: ${dist1to5}m`);

if (f1LastNode2 && f5FirstNode) {
  const ek = f1LastNode2 < f5FirstNode ? `${f1LastNode2}-${f5FirstNode}` : `${f5FirstNode}-${f1LastNode2}`;
  const edgeExists = edgeSet.has(ek);
  const fwdOk = (adj[f1LastNode2] || []).includes(f5FirstNode);
  const revOk = (adj[f5FirstNode] || []).includes(f1LastNode2);
  console.log(`Edge F1->F5: exists=${edgeExists} fwd=${fwdOk} rev=${revOk}`);
}
