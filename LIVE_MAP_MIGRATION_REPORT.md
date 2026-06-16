# Shuttle Location Tracking - Option B Live Map Migration Report

This report outlines the implementation of **Option B** from `LOCATION_ARCHITECTURE_REPORT.md`. The Live Map architecture has been refactored to establish **Cloud Firestore** as the single source of truth for shuttle locations, removing all dependencies on Supabase `live_locations` and Deno telemetry polling.

---

## 1. Files Modified

1. **[hooks/useLiveShuttles.ts](file:///home/malak/Documents/Graduation/Shuttle-Guidance-System-main-main/hooks/useLiveShuttles.ts)**:
   - Completely replaced Supabase SDK queries and the 3-second `setInterval` polling loop with reactive Firestore `onSnapshot` listeners.
   - Subscribed to the `shuttles` collection (filtered by active status: `isActive == true`).
   - Subscribed to the `users` collection (filtered by role: `role == 'driver'`) to dynamically match driver profile details to the corresponding shuttle.
   - Combined and returned real-time shuttle coordinate updates.

2. **[app/map/MapClient.tsx](file:///home/malak/Documents/Graduation/Shuttle-Guidance-System-main-main/app/map/MapClient.tsx)** (Student Live Map):
   - Refactored the shuttle tracking system from displaying only a single shuttle to rendering all active shuttles (`shuttles.forEach(...)`) on the campus map in real time.
   - Bound HTML metadata popups to the Leaflet markers.
   - Adjusted the statistics indicator conditional to check `shuttles.length > 0` instead of a singular index check.

3. **[app/dashboard/AdminMapClient.tsx](file:///home/malak/Documents/Graduation/Shuttle-Guidance-System-main-main/app/dashboard/AdminMapClient.tsx)** (Admin Dashboard Map):
   - Updated live shuttle marker setup to bind popup bubbles showing details about each active shuttle.

4. **[app/dashboard/map/AdminMapClient.tsx](file:///home/malak/Documents/Graduation/Shuttle-Guidance-System-main-main/app/dashboard/map/AdminMapClient.tsx)** (Admin Full Map View):
   - Added marker popup bindings showing live details.

---

## 2. Old Implementation Removed

The previous implementation relied on the following mechanics which have been completely removed or deprecated:
- **Supabase Client Dependency**: Map hooks no longer load or invoke query operations against the `live_locations` table in Supabase PostgreSQL.
- **Client-Side Polling Loops**: The 3-second database query polling interval in `useLiveShuttles` has been deleted, removing redundant network overhead.
- **Single-Shuttle Limitation**: The student map is no longer hardcoded to only show the first index of the tracked array.

---

## 3. New Firestore Listener Implementation

The new `useLiveShuttles` hook sets up two real-time database subscriptions:

```typescript
// 1. Listen to active shuttles in Firestore
const shuttlesQuery = query(collection(db, 'shuttles'), where('isActive', '==', true))

// 2. Listen to driver profile metadata in users collection
const driversQuery = query(collection(db, 'users'), where('role', '==', 'driver'))
```

Upon receiving database updates, the listener:
1. Filters out any shuttles lacking valid coordinates in `lastLocation`.
2. Cross-references the driver whose profile has `vehicleAssigned === shuttle.id` to resolve their `fullName`.
3. Transforms `lastLocation.updatedAt` to an ISO string.
4. Updates component state, triggering immediate rendering on the map markers.

### Leaflet Popup Binding
All live markers are now decorated with standard HTML popups:
```typescript
const popupContent = `
  <div style="font-family: inherit; padding: 4px; min-width: 160px; text-align: left;">
    <h4 style="margin: 0 0 6px 0; font-weight: 700; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">
      🚌 Shuttle: ${shuttle.plateNumber}
    </h4>
    <div style="font-size: 11px; line-height: 1.4;">
      <div><b>Driver:</b> ${shuttle.driverName}</div>
      <div><b>Status:</b> <span style="text-transform: capitalize; font-weight: 600; color: ${shuttle.status === 'on_trip' ? '#22c55e' : '#f59e0b'}">${shuttle.status}</span></div>
      <div style="margin-top: 4px; font-size: 10px; color: #888;"><b>Updated:</b> ${new Date(shuttle.updated_at).toLocaleTimeString()}</div>
    </div>
  </div>
`
```

---

## 4. Remaining Issues / Future Considerations

- **Write Operations Count**: Telemetry written to Firestore at high frequencies will consume write quotas faster than relational PostgreSQL tables. If the fleet grows significantly, batch-writing or throttle mechanisms should be implemented in the mobile app.
- **Legacy Route `/api/update-location`**: This serverless proxy API route still points to the Supabase Edge Function. Since we must not modify the mobile app or backend code, this route has been left untouched for backwards-compatibility.
