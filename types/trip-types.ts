// ─────────────────────────────────────────────────────────────
//  Trip Management — Type Definitions
//  All types for the redesigned trip system where trips are
//  generated automatically from driver login → driver logout.
// ─────────────────────────────────────────────────────────────

/**
 * Core trip document — stored in Firestore `trips` collection.
 * Represents a complete shuttle operating session.
 */
export interface Trip {
  id: string
  shuttleId: string
  plateNumber: string            // plate number for display
  driverId: string
  driverName: string
  driverEmployeeId: string
  startTime: any                 // Firestore Timestamp
  startDate: string              // YYYY-MM-DD for easy filtering
  endTime: any | null            // null while in-progress
  endDate: string | null
  duration: number | null        // seconds, computed on trip end
  status: TripStatus
  startStationId: string | null
  startStationName: string | null
  startLat: number | null
  startLng: number | null
  endStationId: string | null
  endStationName: string | null
  endLat: number | null
  endLng: number | null
  totalPassengers: number
  totalRequests: number
  totalDistance: number           // meters
  createdAt: any                 // Firestore Timestamp
}

export type TripStatus = 'in-progress' | 'completed'

/**
 * Station visit record — stored in Firestore sub-collection
 * `trips/{tripId}/station_history`
 */
export interface TripStationHistory {
  id: string
  tripId: string
  stationId: string
  stationName: string
  arrivalTime: any               // Firestore Timestamp
  departureTime: any | null
  passengersBoarded: number
  passengersDropped: number
  lat: number
  lng: number
}

/**
 * GPS breadcrumb — stored in Firestore sub-collection
 * `trips/{tripId}/location_history`
 */
export interface TripLocationHistory {
  id: string
  tripId: string
  lat: number
  lng: number
  timestamp: any                 // Firestore Timestamp
}

/**
 * Computed statistics for a trip.
 * Can be stored as a field on the trip document or computed on read.
 */
export interface TripStatistics {
  tripId: string
  totalPassengers: number
  uniquePassengers: number
  totalRequests: number
  acceptedRequests: number
  completedRequests: number
  stationsVisited: number
  totalDistance: number           // meters
  avgStopDuration: number        // seconds
}

/**
 * Filters used by the dashboard to query trips.
 */
export interface TripFilters {
  date?: string                  // YYYY-MM-DD
  dateFrom?: string              // YYYY-MM-DD
  dateTo?: string                // YYYY-MM-DD
  shuttleId?: string
  driverId?: string
  status?: TripStatus | 'all'
  stationId?: string
  search?: string                // free text search
}

/**
 * Trips grouped by shuttle for the shuttle-centric view.
 */
export interface ShuttleTripGroup {
  shuttleId: string
  plateNumber: string
  shuttleModel?: string
  trips: Trip[]
  totalTrips: number
  totalPassengers: number
}

/**
 * Dashboard KPI stats computed from trip data.
 */
export interface TripDashboardStats {
  activeShuttles: number
  completedTripsToday: number
  totalPassengersToday: number
  totalTripsThisWeek: number
  averageTripDuration: number    // seconds
  activeDrivers: number
}

/**
 * Playback state for trip replay.
 */
export type PlaybackSpeed = 1 | 2 | 5

export interface PlaybackState {
  isPlaying: boolean
  isPaused: boolean
  currentIndex: number
  speed: PlaybackSpeed
  currentTimestamp: any | null
  progress: number               // 0-100
}
