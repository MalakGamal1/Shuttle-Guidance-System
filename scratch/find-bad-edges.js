const fs = require('fs');
const path = require('path');

// We can require edge-geometry.js to check directly, or read edge-geometry.ts
const { ROAD_GEOMETRY } = require('../lib/edge-geometry.js');

const LAT_MIN = 27.184;
const LNG_MAX = 31.178;

const badEdges = [];

for (const [key, coords] of Object.entries(ROAD_GEOMETRY)) {
  let hasBadLat = false;
  let hasBadLng = false;
  let minLatVal = Infinity;
  let maxLngVal = -Infinity;
  
  for (const [lat, lng] of coords) {
    if (lat < LAT_MIN) {
      hasBadLat = true;
      if (lat < minLatVal) minLatVal = lat;
    }
    if (lng > LNG_MAX) {
      hasBadLng = true;
      if (lng > maxLngVal) maxLngVal = lng;
    }
  }
  
  if (hasBadLat || hasBadLng) {
    badEdges.push({
      key,
      hasBadLat,
      hasBadLng,
      minLatVal: hasBadLat ? minLatVal : null,
      maxLngVal: hasBadLng ? maxLngVal : null,
      pointsCount: coords.length
    });
  }
}

console.log(JSON.stringify(badEdges, null, 2));
