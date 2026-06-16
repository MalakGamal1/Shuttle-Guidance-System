// @ts-nocheck
/// <reference lib="deno.ns" />

interface Station {
  id?: string | number;
  name?: string;
  lat: number;
  lng: number;
  [key: string]: any;
}

interface RequestBody {
  lat: number;
  lng: number;
  stations: Station[];
  top_n?: number;
}

// ─── Constants ───────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ─── Helpers ─────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function validateCoords(lat: unknown, lng: unknown): string | null {
  if (typeof lat !== "number" || typeof lng !== "number") return "lat and lng must be numbers";
  if (!isFinite(lat) || !isFinite(lng)) return "lat and lng must be finite numbers";
  if (lat < -90 || lat > 90) return "latitude must be between -90 and 90";
  if (lng < -180 || lng > 180) return "longitude must be between -180 and 180";
  return null;
}

// ─── Haversine ───────────────────────────────────────────────────
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Core Logic ──────────────────────────────────────────────────
function findNearestStations(
  userLat: number,
  userLng: number,
  stations: Station[],
  topN: number
): Station[] {
  return stations
    .filter((s) => typeof s?.lat === "number" && typeof s?.lng === "number")
    .map((s) => {
      const km = getDistanceKm(userLat, userLng, s.lat, s.lng);
      return {
        ...s,
        distance_km: Number(km.toFixed(3)),
        distance_meters: Math.round(km * 1000),
      };
    })
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, topN);
}

// ─── Server ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, message: "method not allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "invalid JSON body" }, 400);
  }

  const { lat, lng, stations, top_n = 5 } = body;   // default = 5 أفضل

  const coordError = validateCoords(lat, lng);
  if (coordError) return json({ success: false, message: coordError }, 400);

  if (!Array.isArray(stations) || stations.length === 0) {
    return json({ success: false, message: "stations must be a non-empty array" }, 400);
  }

  if (typeof top_n !== "number" || !Number.isInteger(top_n) || top_n < 1) {
    return json({ success: false, message: "top_n must be a positive integer" }, 400);
  }

  const results = findNearestStations(lat, lng, stations, top_n);

  if (results.length === 0) {
    return json({ success: false, message: "no valid stations found" }, 404);
  }

  return json({
    success: true,
    count: results.length,
    message: top_n === 1 
      ? "nearest station found" 
      : `top ${results.length} nearest stations found`,
    data: top_n === 1 ? results[0] : results,
  });
});