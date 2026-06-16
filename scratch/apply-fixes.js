const fs = require('fs');
const path = require('path');
const { ROAD_GEOMETRY } = require('../lib/edge-geometry.js');
const { isInsideCampus } = require('../lib/university-graph.js');

const LAT_MIN = 27.184;
const LNG_MAX = 31.178;

// Create copy of ROAD_GEOMETRY
const newGeom = {};
for (const [key, coords] of Object.entries(ROAD_GEOMETRY)) {
  newGeom[key] = coords.map(p => [...p]);
}

// 1. guest_house-thOOMFdu8483n9YOKy2A stitched path
const guestHouseRoundabout = ROAD_GEOMETRY["guest_house-roundabout"];
const sciencePharmacy = ROAD_GEOMETRY["f6hwuB5XCNMoiXFR0kNE-AzqlIx99BldHQwZN6hcN"];
const pharmacyMedicine = ROAD_GEOMETRY["AzqlIx99BldHQwZN6hcN-thOOMFdu8483n9YOKy2A"];

const stitched = [
  ...guestHouseRoundabout,
  [27.18765, 31.17087],
  [27.1881, 31.1710],
  [27.1885, 31.17115],
  ...sciencePharmacy,
  ...pharmacyMedicine
];

// Deduplicate adjacent identical points
const cleanStitched = [];
for (const p of stitched) {
  if (cleanStitched.length === 0) {
    cleanStitched.push(p);
  } else {
    const last = cleanStitched[cleanStitched.length - 1];
    if (last[0] !== p[0] || last[1] !== p[1]) {
      cleanStitched.push(p);
    }
  }
}
newGeom["guest_house-thOOMFdu8483n9YOKy2A"] = cleanStitched;

// 2. Reverse edges
newGeom["f6hwuB5XCNMoiXFR0kNE-c5XobcRdrUYlnC1P6RQF"] = [...newGeom["c5XobcRdrUYlnC1P6RQF-f6hwuB5XCNMoiXFR0kNE"]].reverse();
newGeom["AzqlIx99BldHQwZN6hcN-c5XobcRdrUYlnC1P6RQF"] = [...newGeom["c5XobcRdrUYlnC1P6RQF-AzqlIx99BldHQwZN6hcN"]].reverse();
newGeom["guest_house-f4ukuh8Dxxtv4l0KM7hH"] = [...newGeom["f4ukuh8Dxxtv4l0KM7hH-guest_house"]].reverse();

// 3. Cap all coordinates to remain in campus limits
for (const [key, coords] of Object.entries(newGeom)) {
  for (let i = 0; i < coords.length; i++) {
    let [lat, lng] = coords[i];
    if (lat < LAT_MIN) {
      lat = LAT_MIN;
    }
    if (lng > LNG_MAX) {
      lng = LNG_MAX;
    }
    coords[i] = [lat, lng];
  }
}

// Format function
function formatRoadGeometry(obj) {
  let lines = [];
  lines.push("{");
  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length; i++) {
    const [key, coords] = entries[i];
    lines.push(`  "${key}": [`);
    for (let j = 0; j < coords.length; j++) {
      const [lat, lng] = coords[j];
      const comma = (j === coords.length - 1) ? "" : ",";
      lines.push(`    [`);
      lines.push(`      ${lat},`);
      lines.push(`      ${lng}`);
      lines.push(`    ]${comma}`);
    }
    const outerComma = (i === entries.length - 1) ? "" : ",";
    lines.push(`  ]${outerComma}`);
  }
  lines.push("}");
  return lines.join("\n");
}

const formattedGeom = formatRoadGeometry(newGeom);

// Write TS file
const tsContent = `// Auto-generated exact OSM road geometry
// Fetched from OSRM to ensure polylines strictly follow campus roads

export const ROAD_GEOMETRY: Record<string, [number, number][]> = ${formattedGeom};
`;
fs.writeFileSync(path.join(__dirname, '../lib/edge-geometry.ts'), tsContent, 'utf-8');
console.log("Updated edge-geometry.ts successfully.");

// Write JS file
const jsContent = `"use strict";
// Auto-generated exact OSM road geometry
// Fetched from OSRM to ensure polylines strictly follow campus roads
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROAD_GEOMETRY = void 0;
exports.ROAD_GEOMETRY = ${formattedGeom};
`;
fs.writeFileSync(path.join(__dirname, '../lib/edge-geometry.js'), jsContent, 'utf-8');
console.log("Updated edge-geometry.js successfully.");
