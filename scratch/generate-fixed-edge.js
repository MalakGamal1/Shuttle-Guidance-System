const { ROAD_GEOMETRY } = require('../lib/edge-geometry.js');
const { isInsideCampus } = require('../lib/university-graph.js');

const guestHouseRoundabout = ROAD_GEOMETRY["guest_house-roundabout"];
const sciencePharmacy = ROAD_GEOMETRY["f6hwuB5XCNMoiXFR0kNE-AzqlIx99BldHQwZN6hcN"];
const pharmacyMedicine = ROAD_GEOMETRY["AzqlIx99BldHQwZN6hcN-thOOMFdu8483n9YOKy2A"];

if (!guestHouseRoundabout || !sciencePharmacy || !pharmacyMedicine) {
  console.error("Missing source edges!");
  process.exit(1);
}

const stitched = [
  ...guestHouseRoundabout,
  [27.18765, 31.17087],
  [27.1881, 31.1710],
  [27.1885, 31.17115],
  ...sciencePharmacy,
  ...pharmacyMedicine
];

// Deduplicate adjacent identical points
const finalCoords = [];
for (const p of stitched) {
  if (finalCoords.length === 0) {
    finalCoords.push(p);
  } else {
    const last = finalCoords[finalCoords.length - 1];
    if (last[0] !== p[0] || last[1] !== p[1]) {
      finalCoords.push(p);
    }
  }
}

console.log(`Generated ${finalCoords.length} points.`);

// Verify bounds and campus fence
let allInBounds = true;
let allInCampus = true;

finalCoords.forEach((p, idx) => {
  const [lat, lng] = p;
  const inCampus = isInsideCampus(lat, lng);
  const inBounds = lat >= 27.183 && lat <= 27.193 && lng >= 31.162 && lng <= 31.178;
  
  if (!inCampus) {
    console.log(`Point ${idx} [${lat}, ${lng}] is outside campus polygon`);
    allInCampus = false;
  }
  if (!inBounds) {
    console.log(`Point ${idx} [${lat}, ${lng}] is out of bounds (lat: 27.183-27.193, lng: 31.162-31.178)`);
    allInBounds = false;
  }
});

console.log("Validation Result:", { allInBounds, allInCampus });
console.log("JSON coordinates format:\n", JSON.stringify(finalCoords, null, 2));
