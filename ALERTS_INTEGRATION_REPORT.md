# Shuttle Guidance System - Alerts & Notifications Integration Report

This report summarizes the integration of the **Alerts & Notifications** admin dashboard page with the deployed **Supabase Edge Function** for manual notification broadcasts.

---

## 1. Files Modified

- **[app/alerts/page.tsx](file:///home/malak/Documents/Graduation/Shuttle-Guidance-System-main-main/app/alerts/page.tsx)**:
  - Imported the `useAuth` hook from `@/context/auth-context` to retrieve the active administrator session (`user?.uid`).
  - Refactored `handleCreateAlert` (saving alerts and triggering the broadcast).
  - Refactored `handleSendNotification` (triggering custom announcements).
  - Added user input validation for both actions with corresponding UI toast feedback.
  - Incorporated full loading status updates (`creating` and `sending`) and error/success toast dispatches.
  - Kept all UI components, dialogs, layouts, classes, and styles completely unchanged.

---

## 2. API Request Implementation

Both the **Create Alert** notification dispatch and the **Broadcast Notification** dialog now make direct `POST` requests to the Supabase Edge Function URL:
`https://uspmtthirtlemqfznyyl.supabase.co/functions/v1/manual-notification`

### HTTP Request Schema
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
  - `Authorization`: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` (if configured)
  - `apikey`: `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` (if configured)
- **Body Payload**:
  ```json
  {
    "target": "all",
    "title": "Notification Title",
    "body": "Notification Body Text",
    "createdBy": "admin_user_uid"
  }
  ```

### Code snippet (`handleSendNotification` Example)
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uspmtthirtlemqfznyyl.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const res = await fetch(`${supabaseUrl}/functions/v1/manual-notification`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(supabaseAnonKey ? { 'Authorization': `Bearer ${supabaseAnonKey}` } : {}),
    ...(supabaseAnonKey ? { 'apikey': supabaseAnonKey } : {}),
  },
  body: JSON.stringify({
    target: 'all',
    title: notification.title,
    body: notification.body,
    createdBy: user?.uid || 'system_admin',
  }),
})
```

---

## 3. Validation Logic

Before launching the network request or writing database records, user input is validated. If any required field is empty or whitespace-only, a feedback toast is shown and execution is terminated.

- **Broadcast Announcements**:
  - Validates `notification.title.trim()` is not empty.
  - Validates `notification.body.trim()` is not empty.
- **System Alerts**:
  - Validates `newAlert.title.trim()` is not empty.
  - Validates `newAlert.description.trim()` is not empty.

If validation fails, the user is presented with a validation error toast:
```typescript
toast({ title: 'Validation Error', description: 'Alert title is required.', variant: 'destructive' })
```

---

## 4. Error Handling

1. **API Responses**:
   - The response status is checked using `res.ok`.
   - On error (status non-2xx), the script attempts to parse the JSON error body (`data.message` or `data.error`) and throws an error detailing the issue.
   
2. **Alert Creation Flow (Non-Fatal Notifications)**:
   - In `handleCreateAlert`, writing the record to Firestore is the primary action.
   - The notification broadcast is encapsulated in a nested `try-catch` block. If the notification fails (e.g. Supabase offline or network error), the alert remains successfully saved in Firestore, and the admin is notified via a warning toast containing the specific error details instead of crashing the flow.
   
3. **Announcements Flow (Fatal Announcements)**:
   - In `handleSendNotification`, the broadcast is the primary action.
   - Any failure during invocation (network errors, HTTP errors returned by Supabase) triggers the main catch block and displays a destructive error toast:
     ```typescript
     toast({ title: 'Error', description: err.message || 'Failed to send notification.', variant: 'destructive' })
     ```
