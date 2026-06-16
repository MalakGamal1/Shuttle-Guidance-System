import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Initialize Supabase client with graceful fallback.
 * If environment variables are missing, export null instead of crashing.
 * This allows the app to run without Supabase, disabling image upload gracefully.
 *
 * Supabase is used for:
 * - Uploading profile images
 * - Retrieving public image URLs
 * - Edge Functions: update-location, calculate-route, get-nearest-station
 *
 * Firebase is used for all other operations (auth, data, etc.)
 */
const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()      || ''
const supabaseAnonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''

function createSafeSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    // eslint-disable-next-line no-new
    new URL(supabaseUrl)
  } catch {
    return null
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey)
  } catch {
    return null
  }
}

export const supabase: SupabaseClient | null = createSafeSupabaseClient()

export const isSupabaseConfigured = (): boolean => supabase !== null


// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface DriverLocation {
  driverId:  string
  lat:       number
  lng:       number
  status?:   'active' | 'idle' | 'offline'
  updatedAt?: number
}

export interface RouteResult {
  distance:    number          // بالمتر
  duration:    number          // بالثانية
  polyline:    [number, number][]  // نقاط الـ route على الخريطة
  steps?:      string[]        // خطوات التنقل
}

export interface NearestStation {
  id:        string
  name:      string
  lat:       number
  lng:       number
  distance:  number            // بالمتر من الـ user
}

// نوع موحد لاستجابة الـ Edge Functions
type EdgeResult<T> =
  | { data: T;    error: null }
  | { data: null; error: string }


// ─────────────────────────────────────────────────────────────
//  Helper داخلي — بيستدعي أي Edge Function بأمان
// ─────────────────────────────────────────────────────────────

async function invokeEdgeFunction<T>(
  fnName: string,
  body:   Record<string, unknown>,
): Promise<EdgeResult<T>> {
  if (!supabase) {
    return { data: null, error: 'Supabase غير متاح — تحقق من متغيرات البيئة' }
  }

  const { data, error } = await supabase.functions.invoke<T>(fnName, { body })

  if (error) {
    console.error(`[Supabase] ${fnName} error:`, error.message)
    return { data: null, error: error.message }
  }

  return { data: data as T, error: null }
}


// ─────────────────────────────────────────────────────────────
//  1. update-location
//     بيبعت موقع الـ driver لـ Supabase
// ─────────────────────────────────────────────────────────────

/**
 * @example
 * const { error } = await updateDriverLocation({
 *   driverId: 'driver_001',
 *   lat: 27.1783,
 *   lng: 31.1859,
 *   status: 'active',
 * })
 */
export async function updateDriverLocation(
  location: DriverLocation,
): Promise<EdgeResult<{ success: boolean }>> {
  return invokeEdgeFunction('update-location', {
    driver_id:  location.driverId,
    lat:        location.lat,
    lng:        location.lng,
    status:     location.status  ?? 'active',
    updated_at: location.updatedAt ?? Date.now(),
  })
}


// ─────────────────────────────────────────────────────────────
//  2. calculate-route
//     بيحسب الـ route بين نقطتين
// ─────────────────────────────────────────────────────────────

/**
 * @example
 * const { data, error } = await calculateRoute({
 *   originLat: 27.178, originLng: 31.185,
 *   destLat:   27.190, destLng:   31.200,
 * })
 * if (data) drawPolyline(data.polyline)
 */
export async function calculateRoute(params: {
  originLat: number
  originLng: number
  destLat:   number
  destLng:   number
}): Promise<EdgeResult<RouteResult>> {
  return invokeEdgeFunction('calculate-route', {
    origin:      { lat: params.originLat, lng: params.originLng },
    destination: { lat: params.destLat,   lng: params.destLng   },
  })
}


// ─────────────────────────────────────────────────────────────
//  3. get-nearest-station
//     بيرجع أقرب محطة للـ user
// ─────────────────────────────────────────────────────────────

/**
 * @example
 * const { data, error } = await getNearestStation({ lat: 27.178, lng: 31.185 })
 * if (data) console.log('أقرب محطة:', data.name, data.distance, 'متر')
 */
export async function getNearestStation(params: {
  lat:    number
  lng:    number
  limit?: number       // عدد المحطات — افتراضي 1
}): Promise<EdgeResult<NearestStation[]>> {
  return invokeEdgeFunction('get-nearest-station', {
    lat:   params.lat,
    lng:   params.lng,
    limit: params.limit ?? 1,
  })
}