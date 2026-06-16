"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAMPUS_BOUNDARY = exports.EDGES_CONFIG = exports.HELPER_NODES = exports.EDGES = exports.NODES = exports.STATIONS = void 0;
exports.buildGraph = buildGraph;
exports.syncGraphWithFirestore = syncGraphWithFirestore;
exports.getNearestNode = getNearestNode;
exports.getHaversineDistance = getHaversineDistance;
exports.aStar = aStar;
exports.getOptimalRoute = getOptimalRoute;
exports.getPathLength = getPathLength;
exports.getEdgeGeometry = getEdgeGeometry;
exports.buildCampusRoute = buildCampusRoute;
exports.buildDetailedPath = buildDetailedPath;
exports.isInsideCampus = isInsideCampus;
exports.isRouteInsideCampus = isRouteInsideCampus;
const firebase_1 = require("./firebase");
const firestore_1 = require("firebase/firestore");
exports.STATIONS = [];
exports.NODES = [];
exports.EDGES = [];
exports.HELPER_NODES = [
    { id: 'guest_house', name: 'دار الضيافة', lat: 27.185200, lng: 31.170000 },
    { id: 'roundabout', name: 'الميدان الرئيسي', lat: 27.186500, lng: 31.171000 },
    { id: 'surgery', name: 'مبنى الجراحة', lat: 27.187200, lng: 31.173000 },
    { id: 'hospital', name: 'المستشفى الرئيسي', lat: 27.187000, lng: 31.165000 },
];
exports.EDGES_CONFIG = [
    // Gates → nearest stops
    { from: 'بوابة مستشفى الجامعة', to: 'hospital', cost: 150 },
    { from: 'بوابة مستشفى الجامعة', to: 'كلية العلوم', cost: 200 },
    { from: 'بوابة مستشفى الجامعة', to: 'كلية الصيدلة', cost: 220 },
    { from: 'بوابة الصيانة', to: 'كلية الطب', cost: 180 },
    { from: 'بوابة الصيانة', to: 'guest_house', cost: 200 },
    { from: 'بوابة الجامعة الرئيسية', to: 'كلية طب الأسنان', cost: 150 },
    { from: 'بوابة الجامعة الرئيسية', to: 'المدينة الجامعية (أ)', cost: 280 },
    { from: 'بوابة الترعة', to: 'كلية الزراعة', cost: 180 },
    { from: 'بوابة الترعة', to: 'ملعب جامعة أسيوط', cost: 220 },
    { from: 'بوابة الترعة', to: 'كلية التربية', cost: 280 },
    // North axis
    { from: 'كلية التربية الرياضية', to: 'كلية الزراعة', cost: 250 },
    { from: 'كلية التربية الرياضية', to: 'كلية الصيدلة', cost: 180 },
    { from: 'كلية الزراعة', to: 'كلية العلوم', cost: 240 },
    { from: 'كلية العلوم', to: 'ملعب جامعة أسيوط', cost: 290 },
    { from: 'كلية الزراعة', to: 'كلية التربية', cost: 200 },
    { from: 'كلية التربية', to: 'ملعب جامعة أسيوط', cost: 350 },
    { from: 'كلية التربية', to: 'كلية الهندسة', cost: 200 },
    { from: 'ملعب جامعة أسيوط', to: 'بوابة الجامعة الرئيسية', cost: 280 },
    // West vertical axis
    { from: 'كلية العلوم', to: 'كلية الصيدلة', cost: 120 },
    { from: 'كلية الصيدلة', to: 'كلية الطب', cost: 180 },
    { from: 'كلية الطب', to: 'guest_house', cost: 160 },
    { from: 'guest_house', to: 'كلية الحقوق و التجارة', cost: 180 },
    { from: 'كلية الحقوق و التجارة', to: 'كلية الهندسة', cost: 160 },
    // Central roundabout hub
    { from: 'roundabout', to: 'كلية العلوم', cost: 320 },
    { from: 'roundabout', to: 'كلية التربية', cost: 250 },
    { from: 'roundabout', to: 'guest_house', cost: 160 },
    { from: 'roundabout', to: 'surgery', cost: 200 },
    { from: 'roundabout', to: 'كلية الحاسبات و المعلومات', cost: 150 },
    { from: 'surgery', to: 'ملعب جامعة أسيوط', cost: 350 },
    // East axis
    { from: 'كلية الحاسبات و المعلومات', to: 'كلية طب الأسنان', cost: 180 },
    { from: 'كلية الحاسبات و المعلومات', to: 'كلية الحقوق و التجارة', cost: 200 },
    { from: 'كلية طب الأسنان', to: 'surgery', cost: 200 },
    { from: 'كلية طب الأسنان', to: 'المدينة الجامعية (أ)', cost: 220 },
    // Dorms
    { from: 'المدينة الجامعية (أ)', to: 'المدينة الجامعية (د)', cost: 200 },
    { from: 'المدينة الجامعية (أ)', to: 'كلية الهندسة', cost: 380 },
    { from: 'المدينة الجامعية (د)', to: 'كلية الهندسة', cost: 450 },
];
function buildGraph(firestoreStations) {
    exports.STATIONS.length = 0;
    exports.NODES.length = 0;
    exports.EDGES.length = 0;
    // 1. Re-populate STATIONS with all Firestore stations
    firestoreStations.forEach((fs) => {
        if (typeof fs.lat === 'number' && typeof fs.lng === 'number') {
            exports.STATIONS.push({
                id: fs.id,
                name: fs.name,
                lat: fs.lat,
                lng: fs.lng,
            });
        }
    });
    // 2. Add intermediate helper nodes
    exports.HELPER_NODES.forEach((helper) => {
        exports.STATIONS.push(helper);
    });
    // 3. Rebuild NODES mapping
    exports.STATIONS.forEach((s) => {
        exports.NODES.push({
            id: s.id,
            x: s.lng,
            y: s.lat,
        });
    });
    // 4. Create name-to-ID lookup map
    const nameToId = {};
    exports.STATIONS.forEach((s) => {
        nameToId[s.name] = s.id;
        nameToId[s.id] = s.id; // helper nodes map ID to ID
    });
    // 5. Translate name-based EDGES_CONFIG to ID-based EDGES
    exports.EDGES_CONFIG.forEach((edge) => {
        const fromId = nameToId[edge.from];
        const toId = nameToId[edge.to];
        if (fromId && toId) {
            exports.EDGES.push({
                from: fromId,
                to: toId,
                cost: edge.cost,
            });
        }
        else {
            console.warn(`[buildGraph] Could not resolve edge from '${edge.from}' to '${edge.to}'`);
        }
    });
    // 6. Connect any newly created stations (unconnected) to their nearest node
    const connectedIds = new Set();
    exports.EDGES.forEach((e) => {
        connectedIds.add(e.from);
        connectedIds.add(e.to);
    });
    const unconnectedStations = firestoreStations.filter((fs) => fs.id && !connectedIds.has(fs.id) && typeof fs.lat === 'number' && typeof fs.lng === 'number');
    unconnectedStations.forEach((station) => {
        let nearestNode = null;
        let minDistance = Infinity;
        for (const node of exports.NODES) {
            if (node.id === station.id)
                continue; // skip itself
            const dist = getHaversineDistance(station.lat, station.lng, node.y, node.x);
            if (dist < minDistance) {
                minDistance = dist;
                nearestNode = node;
            }
        }
        if (nearestNode) {
            const cost = Math.round(minDistance);
            // Bidirectional edge
            exports.EDGES.push({
                from: station.id,
                to: nearestNode.id,
                cost: cost,
            });
            console.log(`[buildGraph] Dynamically connected new station '${station.name}' (${station.id}) to nearest node '${nearestNode.id}' (distance: ${cost}m)`);
        }
    });
    console.log(`[buildGraph] Graph built: ${exports.STATIONS.length} stations, ${exports.EDGES.length} edges`);
}
function syncGraphWithFirestore() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const snapshot = yield (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, 'stations'));
            const stations = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            buildGraph(stations);
            console.log(`[syncGraphWithFirestore] Synced ${stations.length} stations from Firestore. Graph successfully rebuilt.`);
        }
        catch (err) {
            console.error(`[syncGraphWithFirestore] Error loading stations from Firestore:`, err);
        }
    });
}
function getNearestNode(lat, lng) {
    let nearestNode = exports.NODES[0];
    let minDistance = Infinity;
    exports.NODES.forEach((node) => {
        const dist = getHaversineDistance(lat, lng, node.y, node.x);
        if (dist < minDistance) {
            minDistance = dist;
            nearestNode = node;
        }
    });
    return nearestNode;
}
// Haversine distance in meters
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function aStar(startId, goalId) {
    if (startId === goalId) {
        if (!exports.NODES.some(n => n.id === startId)) {
            console.warn(`[aStar] Path contains missing node ID: ${startId}`);
        }
        return { path: [startId], cost: 0 };
    }
    const goalNode = exports.NODES.find(n => n.id === goalId);
    if (!goalNode)
        return { path: [], cost: Infinity };
    const openSet = new Set([startId]);
    const cameFrom = {};
    const gScore = {};
    exports.NODES.forEach(n => (gScore[n.id] = Infinity));
    gScore[startId] = 0;
    const fScore = {};
    exports.NODES.forEach(n => (fScore[n.id] = Infinity));
    const startNode = exports.NODES.find(n => n.id === startId);
    if (!startNode)
        return { path: [], cost: Infinity };
    fScore[startId] = getHaversineDistance(startNode.y, startNode.x, goalNode.y, goalNode.x);
    const adj = {};
    exports.NODES.forEach((n) => { adj[n.id] = []; });
    exports.EDGES.forEach((e) => {
        if (adj[e.from] && adj[e.to]) {
            adj[e.from].push({ to: e.to, cost: e.cost });
            adj[e.to].push({ to: e.from, cost: e.cost });
        }
    });
    while (openSet.size > 0) {
        let currentId = '';
        let minFScore = Infinity;
        openSet.forEach(nodeId => {
            if (fScore[nodeId] < minFScore) {
                minFScore = fScore[nodeId];
                currentId = nodeId;
            }
        });
        if (currentId === goalId) {
            const path = [];
            let curr = currentId;
            while (cameFrom[curr]) {
                path.unshift(curr);
                curr = cameFrom[curr];
            }
            path.unshift(startId);
            // Verify all node IDs in the path exist in NODES
            path.forEach(nodeId => {
                if (!exports.NODES.some(n => n.id === nodeId)) {
                    console.warn(`[aStar] Path contains missing node ID: ${nodeId}`);
                }
            });
            return { path, cost: gScore[goalId] };
        }
        openSet.delete(currentId);
        const neighbors = adj[currentId] || [];
        for (const neighbor of neighbors) {
            const tentativeGScore = gScore[currentId] + neighbor.cost;
            if (tentativeGScore < gScore[neighbor.to]) {
                cameFrom[neighbor.to] = currentId;
                gScore[neighbor.to] = tentativeGScore;
                const neighborNode = exports.NODES.find(n => n.id === neighbor.to);
                if (neighborNode) {
                    fScore[neighbor.to] = tentativeGScore + getHaversineDistance(neighborNode.y, neighborNode.x, goalNode.y, goalNode.x);
                    openSet.add(neighbor.to);
                }
            }
        }
    }
    return { path: [], cost: Infinity };
}
function getPermutations(arr) {
    const results = [];
    function permute(temp, remaining) {
        if (remaining.length === 0) {
            results.push(temp);
            return;
        }
        for (let i = 0; i < remaining.length; i++) {
            permute([...temp, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
        }
    }
    permute([], arr);
    return results;
}
function getOptimalRoute(shuttleLat, shuttleLng, targetStationIds) {
    if (targetStationIds.length === 0)
        return [];
    const startNode = getNearestNode(shuttleLat, shuttleLng);
    const startId = startNode.id;
    if (targetStationIds.length <= 7) {
        const pathCache = {};
        const getPathCached = (from, to) => {
            const cacheKey = `${from}->${to}`;
            if (pathCache[cacheKey])
                return pathCache[cacheKey];
            const res = aStar(from, to);
            pathCache[cacheKey] = res;
            return res;
        };
        const permutations = getPermutations(targetStationIds);
        let bestPerm = [];
        let minTotalCost = Infinity;
        for (const perm of permutations) {
            let current = startId;
            let totalCost = 0;
            for (const target of perm) {
                const { cost } = getPathCached(current, target);
                totalCost += cost;
                current = target;
            }
            if (totalCost < minTotalCost) {
                minTotalCost = totalCost;
                bestPerm = perm;
            }
        }
        if (minTotalCost < Infinity) {
            const fullPath = [startId];
            let current = startId;
            for (const target of bestPerm) {
                const { path } = getPathCached(current, target);
                for (let i = 1; i < path.length; i++) {
                    fullPath.push(path[i]);
                }
                current = target;
            }
            return fullPath;
        }
    }
    // Fallback to greedy (for N > 7, or if no connected route is found in permutation solver)
    let currentId = startId;
    const remaining = new Set(targetStationIds);
    const fullPath = [currentId];
    while (remaining.size > 0) {
        let nearestId = '';
        let shortestPathToNearest = [];
        let minCost = Infinity;
        for (const targetId of remaining) {
            const { path, cost } = aStar(currentId, targetId);
            if (cost < minCost) {
                minCost = cost;
                nearestId = targetId;
                shortestPathToNearest = path;
            }
        }
        if (nearestId === '') {
            break;
        }
        for (let i = 1; i < shortestPathToNearest.length; i++) {
            fullPath.push(shortestPathToNearest[i]);
        }
        remaining.delete(nearestId);
        currentId = nearestId;
    }
    return fullPath;
}
const edge_geometry_1 = require("./edge-geometry");
function getPathLength(points) {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        length += getHaversineDistance(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    }
    return length;
}
function getEdgeGeometry(fromId, toId) {
    const key1 = `${fromId}-${toId}`;
    let geom = edge_geometry_1.ROAD_GEOMETRY[key1];
    if (!geom) {
        const key2 = `${toId}-${fromId}`;
        // Reversed geometry is only used for bidirectional roads. If this edge is one-way, add both directional keys explicitly in ROAD_GEOMETRY.
        if (edge_geometry_1.ROAD_GEOMETRY[key2]) {
            geom = [...edge_geometry_1.ROAD_GEOMETRY[key2]].reverse();
        }
    }
    if (geom && geom.length > 0) {
        return geom;
    }
    throw new Error(`Missing ROAD_GEOMETRY for edge '${fromId}-${toId}'. Add OSM coordinates for this road segment.`);
}
/**
 * Build a campus route through sequential graph waypoints using internal road
 * geometry only (never OSRM/public driving roads).
 */
function buildCampusRoute(waypointIds) {
    if (waypointIds.length < 2) {
        return { path: [], pathWithCoords: [], cost: 0, source: 'Internal Graph' };
    }
    const fullPathDetails = [];
    let totalCost = 0;
    for (let i = 0; i < waypointIds.length - 1; i++) {
        const segStartId = waypointIds[i];
        const segGoalId = waypointIds[i + 1];
        if (segStartId === segGoalId)
            continue;
        const { path: localNodeIds, cost: localCost } = aStar(segStartId, segGoalId);
        if (!localNodeIds.length) {
            throw new Error(`No internal campus path found between ${segStartId} and ${segGoalId}`);
        }
        const detailedPoints = buildDetailedPath(localNodeIds);
        const segmentPath = detailedPoints.map((pt, index) => {
            var _a, _b;
            return ({
                id: index === 0
                    ? segStartId
                    : index === detailedPoints.length - 1
                        ? segGoalId
                        : `road_point_${segStartId}_${segGoalId}_${index}`,
                name: index === 0
                    ? ((_a = exports.STATIONS.find((s) => s.id === segStartId)) === null || _a === void 0 ? void 0 : _a.name) || segStartId
                    : index === detailedPoints.length - 1
                        ? ((_b = exports.STATIONS.find((s) => s.id === segGoalId)) === null || _b === void 0 ? void 0 : _b.name) || segGoalId
                        : '',
                lat: pt.lat,
                lng: pt.lng,
            });
        });
        if (fullPathDetails.length > 0 && segmentPath.length > 0) {
            fullPathDetails.push(...segmentPath.slice(1));
        }
        else {
            fullPathDetails.push(...segmentPath);
        }
        totalCost += localCost;
    }
    const coordsForValidation = fullPathDetails.map(pt => [pt.lat, pt.lng]);
    if (!isRouteInsideCampus(coordsForValidation)) {
        if (process.env.NODE_ENV === 'development') {
            const outside = coordsForValidation.filter(([lat, lng]) => !isInsideCampus(lat, lng));
            console.warn('[buildCampusRoute] Points outside boundary:', outside.slice(0, 5));
        }
        throw new Error('Route exits campus boundary. Check CAMPUS_BOUNDARY polygon or road geometry.');
    }
    return {
        path: fullPathDetails,
        pathWithCoords: fullPathDetails.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
        cost: totalCost,
        source: 'Internal Graph',
    };
}
function buildDetailedPath(nodeIds) {
    if (nodeIds.length === 0)
        return [];
    if (nodeIds.length === 1) {
        const node = exports.STATIONS.find(s => s.id === nodeIds[0]);
        return node ? [{ lat: node.lat, lng: node.lng }] : [];
    }
    const detailedPath = [];
    for (let i = 0; i < nodeIds.length - 1; i++) {
        const fromId = nodeIds[i];
        const toId = nodeIds[i + 1];
        const geom = getEdgeGeometry(fromId, toId);
        if (i < nodeIds.length - 2) {
            const nextFromId = nodeIds[i + 1];
            const nextToId = nodeIds[i + 2];
            const nextGeom = getEdgeGeometry(nextFromId, nextToId);
            const lastPoint = geom[geom.length - 1];
            const nextFirstPoint = nextGeom[0];
            if (lastPoint && nextFirstPoint) {
                const latDiff = Math.abs(lastPoint[0] - nextFirstPoint[0]);
                const lngDiff = Math.abs(lastPoint[1] - nextFirstPoint[1]);
                if (latDiff > 0.0001 || lngDiff > 0.0001) {
                    console.warn(`[buildDetailedPath] Junction gap detected between ${fromId} and ${toId} — check geometry continuity`);
                }
            }
        }
        // To prevent duplicate coordinates at intersections, we skip the last point 
        // of each segment except for the very last segment in the entire route.
        const isLastSegment = i === nodeIds.length - 2;
        for (let j = 0; j < geom.length; j++) {
            if (!isLastSegment && j === geom.length - 1) {
                continue; // skip end point to avoid duplicate with next segment start
            }
            detailedPath.push({ lat: geom[j][0], lng: geom[j][1] });
        }
    }
    return detailedPath;
}
// ─── Campus Boundary (Assiut University geo-fence) ─────────────────────
// Polygon covering the entire university campus, traced from station
// coordinates and road geometry. Used to validate that shuttle routes
// remain inside campus.
exports.CAMPUS_BOUNDARY = [
    [27.18245, 31.159699], // SW
    [27.18245, 31.1701825], // S mid
    [27.18245, 31.180666], // SE
    [27.187984, 31.180666], // E mid
    [27.193518, 31.180666], // NE
    [27.193518, 31.1701825], // N mid
    [27.193518, 31.159699], // NW
    [27.187984, 31.159699], // W mid
    [27.18245, 31.159699], // close (= SW)
];
/**
 * Ray-casting point-in-polygon test.
 * Returns true if the point (lat, lng) is inside the campus boundary.
 */
function isInsideCampus(lat, lng) {
    const poly = exports.CAMPUS_BOUNDARY;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const yi = poly[i][0], xi = poly[i][1];
        const yj = poly[j][0], xj = poly[j][1];
        const intersect = yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
/**
 * Validates that ALL points in a polyline are inside the campus boundary.
 * Returns true if the entire route is inside campus.
 */
function isRouteInsideCampus(points) {
    // Allow small tolerance: at least 95% of points must be inside
    if (points.length === 0)
        return true;
    let outsideCount = 0;
    for (const [lat, lng] of points) {
        if (!isInsideCampus(lat, lng)) {
            outsideCount++;
        }
    }
    // If more than 5% of points are outside, reject the route
    const outsideRatio = outsideCount / points.length;
    return outsideRatio <= 0.05;
}
function deriveCampusBoundsFromGeometry() {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const key in edge_geometry_1.ROAD_GEOMETRY) {
        const coords = edge_geometry_1.ROAD_GEOMETRY[key];
        for (const [lat, lng] of coords) {
            if (lat < minLat)
                minLat = lat;
            if (lat > maxLat)
                maxLat = lat;
            if (lng < minLng)
                minLng = lng;
            if (lng > maxLng)
                maxLng = lng;
        }
    }
    minLat -= 0.0005;
    maxLat += 0.0005;
    minLng -= 0.0005;
    maxLng += 0.0005;
    console.log('[Campus Bounds]', { minLat, maxLat, minLng, maxLng });
}
if (process.env.NODE_ENV === 'development') {
    deriveCampusBoundsFromGeometry();
}
