// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Environment Check ─────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── CORS ───────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Auth Helper ────────────────────────────────────
async function getUser(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7).trim();
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data?.user) return null;
  return data.user;
}

// ─── Validation ─────────────────────────────────────
function validateCoords(lat: unknown, lng: unknown): string | null {
  if (lat == null || lng == null) return "missing lat or lng";
  if (typeof lat !== "number" || typeof lng !== "number") return "lat and lng must be numbers";
  if (!isFinite(lat) || !isFinite(lng)) return "lat and lng must be finite numbers";
  if (lat < -90 || lat > 90) return "latitude must be between -90 and 90";
  if (lng < -180 || lng > 180) return "longitude must be between -180 and 180";
  return null;
}

// ─── Server ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, message: "method not allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) {
      return json({ success: false, message: "unauthorized - please login" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, message: "invalid JSON" }, 400);
    }

    const { lat, lng } = body;
    const validationError = validateCoords(lat, lng);
    if (validationError) {
      return json({ success: false, message: validationError }, 400);
    }

    const { data, error } = await supabase
      .from("live_locations")
      .upsert({
        user_id: user.id,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) throw error;

    return json({
      success: true,
      message: "location updated successfully",
      data,
    });
  } catch (err: any) {
    console.error("Unhandled Error:", err);
    return json({ success: false, message: "internal server error" }, 500);
  }
});