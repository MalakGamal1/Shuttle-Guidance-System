# PROJECT REPORT: Shuttle Guidance System (UniGo Admin)

## Project Overview

* **Project Name**: Shuttle Guidance System (also referred to as **UniGo Admin** or **UinGO Admin**)
* **Purpose of the Project**: This project serves as an administrative management dashboard for a campus shuttle and guidance system. It coordinates shuttle operations, monitors passenger and driver records, schedules shuttle trips, issues system-wide emergency or operational alerts, handles complaints/incident reporting, and provides a direct support channel between shuttle operators and the root administrator.
* **Problem it Solves**: 
  - **Logistics & Fleet Coordination**: Solves the issue of manual vehicle scheduling and dispatching for campus loops.
  - **Passenger & Driver Management**: Addresses passenger safety and driver accountability by tracking driving license, status, ratings, and assigning specific shuttles.
  - **Incident & Issue Reporting**: Replaces paper forms with a real-time ticketing system for driver incidents and passenger complaints.
  - **Emergency Communication**: Facilitates instant mass communication via Web Push Notifications (FCM) for critical campus shuttle warnings (e.g., delays, route changes, extreme weather).
  - **Offline Administrator Access**: Employs an automated fallback system that forwards support tickets to administrative emails if support personnel are offline.
* **Main Objectives**:
  - Centralize monitoring of total buses, active passengers, active routes, and scheduled trips.
  - Manage drivers and assign them to specific plate-numbered shuttles.
  - Enforce user safety rules by providing blocking mechanisms for passengers.
  - Define and log campus stations (latitude, longitude, expected daily passengers).
  - Provide a real-time chat interface with role-based visibility.
  - Support Multi-Factor Authentication (MFA) to guard administrative panels.
* **Target Users**:
  - **Root Administrator**: System owner who oversees all operational admins, deletes/edits credentials, resolves escalations, and manages core assets.
  - **Admins (Staff/Logistics Team)**: Daily operators who manage drivers, routes, shuttles, and respond to passenger support requests.

---

## Project Architecture

### Overall Architecture Description
The system is built on a **Serverless Web Architecture** using the **Next.js App Router** framework.
- **Frontend Layer**: Client-side components query Firebase directly for live updates (e.g., support chat updates, live stats, grid edits) and execute client-side routing.
- **Backend / Serverless Layer**: Server-side Next.js API Route handlers are used to interface with the Firebase Admin SDK to execute high-privilege operations like broadcasting Firebase Cloud Messages (FCM).
- **Service Integration Layer**: Integration with Firebase Authentication for authentication and MFA, Cloud Firestore for NoSQL real-time document storage, Supabase Storage for serving static assets, and EmailJS for offline email notification.

### Architectural Diagram
```mermaid
graph TD
    subgraph Client ["Client Side (Next.js & React)"]
        UI["UinGO Admin Dashboard UI"]
        AuthCtx["AuthContext (useAuth)"]
        RG["RouteGuard (RBAC)"]
        EJS["EmailJS Client"]
    end

    subgraph FirebaseServices ["Firebase Cloud Services"]
        FAuth["Firebase Auth (MFA/SMS)"]
        FStore["Firestore Database"]
    end

    subgraph ServerLess ["Server-Side API Routes"]
        FAdmin["Firebase Admin SDK"]
        API_Broadcast["/api/notifications/broadcast"]
        API_Send["/api/notifications/send"]
    end

    subgraph ExternalServices ["External Services"]
        FCM["Firebase Cloud Messaging (FCM)"]
        Supabase["Supabase Storage (Assets)"]
    end

    UI --> AuthCtx
    AuthCtx --> FAuth
    RG --> AuthCtx
    UI --> FStore
    UI --> EJS
    UI --> API_Broadcast
    UI --> API_Send
    API_Broadcast --> FAdmin
    API_Send --> FAdmin
    FAdmin --> FCM
```

### Frontend Structure
The frontend is a single-page-like dashboard application with role-based routing guards:
- **Client Root Components**: Houses context providers (`AuthProvider` in `auth-context.tsx` and `ThemeProvider` in `theme-provider.tsx`).
- **Route Guard**: Wraps the layout using a client-side component (`RouteGuard` in `route-guard.tsx`) that continuously monitors user authentication status, email verification, and specific role memberships (`root` vs `admin`).
- **Sidebar & Shell**: A collapsible sidebar panel (`sidebar.tsx`) that dynamically shows menu items based on whether the logged-in administrator is a standard `admin` or the `root` administrator.

### Backend Structure
The backend is structured into serverless Next.js API route handlers:
- **FCM Notification Dispatcher**: Exposes endpoints under `/api/notifications` that load the Server-Side Firebase Admin SDK using cert credentials.
- **Email Forwarder**: Connects to the EmailJS web service on the client side to bypass the need for an active SMTP mail server during offline support hours.

### Database Structure
The project uses **Cloud Firestore**, a NoSQL document database. Data is structured into root-level collections and nested subcollections:
- **`admins`**: Administrator accounts.
- **`users`**: Contains both drivers and passengers, distinguishable by a `role` field.
- **`shuttles`**: Fleet vehicle assets.
- **`stations`**: Geography markers for stops.
- **`trips`**: Dispatch schedules.
- **`alerts`**: Operations and emergency announcements.
- **`reports`**: Logged incidents.
- **`complaints`**: Tickets logged by users.
- **`support_chats`**: Chat threads representing active rooms.
  - Subcollection **`messages`**: Live chat messages inside a thread.

### Communication Flow Between Components
```mermaid
sequenceDiagram
    participant AdminUI as Next.js Dashboard Client
    participant AuthContext as AuthProvider
    participant DB as Firestore
    participant API as API Route (/api/notifications)
    participant FCM as Firebase Cloud Messaging

    AdminUI->>AuthContext: Request current session
    AuthContext->>DB: Fetch admin profile (admins/{uid})
    DB-->>AuthContext: Return profile (role, emailVerified)
    AuthContext-->>AdminUI: Render dashboard shell

    AdminUI->>DB: Real-time listener on collection (e.g., support_chats)
    DB-->>AdminUI: Push changes (real-time chat message)

    AdminUI->>API: POST /api/notifications/broadcast (title, body)
    API->>FCM: Broadcast message to topic 'all_users'
    FCM-->>API: Return success (messageId)
    API-->>AdminUI: Show toast notification
```

### Directory Structure Explanation

```
Shuttle-Guidance-System/
├── app/                      # Next.js App Router root directory
│   ├── admins/               # Page for managing other admin accounts (Root only)
│   ├── alerts/               # Page for creating and broadcasting alerts
│   ├── analytics/            # Analytics charting page
│   ├── api/                  # Serverless API routes
│   │   └── notifications/    # Firebase Admin FCM endpoints
│   ├── buses/                # Page for fleet (shuttle) vehicle management
│   ├── dashboard/            # Core analytics dashboard grid
│   ├── drivers/              # Page for driver account management & bus assignment
│   ├── forgot-password/      # Password recovery screen
│   ├── help/                 # Help & FAQs page (Standard admins only)
│   ├── login/                # Authentication screen (with MFA & Email Verification verification)
│   ├── logout/               # Sign out redirect trigger
│   ├── profile/              # Logged-in admin details and 2FA enrollment
│   ├── register/             # Admin self-registration page
│   ├── reports/              # Page for viewing driver incidents and passenger complaints
│   ├── routes/               # Page for station location registration
│   ├── settings/             # System settings, notifications and dark mode toggle
│   ├── students/             # Passenger/student account overview and blocking management
│   ├── support/              # Chat channel (root sees list, admin sees single thread)
│   ├── verify/               # Email verification redirection and resending panel
│   ├── globals.css           # Global CSS and Tailwind v4 theme definitions
│   ├── layout.tsx            # Main HTML wrapper & global providers
│   ├── layout-client.tsx     # Conditional sidebar wrapper and client state loader
│   └── page.tsx              # Entry-point router (redirects to /login)
├── components/               # Reusable React components
│   ├── auth/                 # Multi-factor authentication dialog sheets
│   ├── ui/                   # Primitive layout blocks (Shadcn UI)
│   ├── route-guard.tsx       # RBAC client middleware component
│   └── sidebar.tsx           # Dashboard sidebar navigation drawer
├── context/                  # Context API stores
│   └── auth-context.tsx      # AuthProvider for session, roles, and profiles
├── hooks/                    # Custom React hooks (use-toast, use-mobile)
├── lib/                      # Configuration clients and protection utilities
│   ├── admin-protection.ts   # Core deletion and modification guards
│   ├── assets.ts             # Static assets CDN URL mapping
│   ├── firebase.ts           # Firebase Client SDK initialization
│   ├── firebase-admin.ts     # Firebase Admin Serverless SDK initialization
│   ├── security.ts           # Root administrator identification helper
│   ├── supabase.ts           # Supabase client setup (Image upload fallback)
│   └── utils.ts              # Styling helpers (clsx/tailwind-merge wrapper)
├── public/                   # Public static files
├── styles/                   # Auxiliary styles
├── types/                    # Common TypeScript type definitions
└── configuration files       # package.json, tsconfig.json, next.config.mjs, cors.json, components.json
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Core Language** | TypeScript | `^5.x` | Strongly typed JavaScript development. |
| **Core Framework** | Next.js (App Router) | `^16.1.6` | Page routing, serverless API routes, and hydration. |
| **UI Library** | React | `19.2.0` | Client-side component construction. |
| **CSS Compiler** | Tailwind CSS | `^4.1.9` | Utility-first styling compile pipeline. |
| **Animation Engine** | tw-animate-css | `1.3.3` | Custom transition and entrance animations. |
| **Database** | Cloud Firestore | SDK `12.8.0` | Real-time document storage for all records. |
| **Authentication** | Firebase Authentication | SDK `12.8.0` | User account lifecycle and verification. |
| **Security Layer** | Firebase App Check | SDK `12.8.0` | reCAPTCHA V3 validation for client API protection. |
| **Server Admin** | Firebase Admin SDK | `^10.3.0` | Bypassing client limits to execute FCM pushes. |
| **MFA Support** | SMS Verification (MFA) | Native SDK | SMS verification codes via Firebase Multi-Factor resolver. |
| **Public Assets** | Supabase Storage | `^2.93.2` | Image hosting for icons and profile avatars. |
| **Offline Alerts** | EmailJS | `^4.4.1` | Client-side emails to administrator inbox. |
| **Charting Engine** | Recharts | `2.15.4` | Data visualization graphics. |
| **Primitives** | Radix UI | Various | Accessible component primitives (Dialogs, Select, Accordions). |
| **Form Management**| React Hook Form & Zod| `^7.60` / `3.25`| Forms validation and type-safe schema checks. |
| **Icons Library** | Lucide React | `^0.454` | Dashboard visual indicator icons. |

---

## Features and Functionality

### 1. Unified Operational Dashboard
- **What it does**: Displays overall stats of buses, active passengers, active routes, and trips scheduled today. Shows line graphs of capacity utilization, bar charts of bookings, and list cards for top-performing routes.
- **How it works**: Queries `shuttles`, `users`, `routes`, and `trips` in Firestore using query filters (e.g., matching timestamp ranges for today). Renders responsive SVG charts using `recharts`.
- **Responsible Files**:
  - [dashboard/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/dashboard/page.tsx)
  - [dashboard/layout.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/dashboard/layout.tsx)

### 2. Fleet Vehicle (Bus) Management
- **What it does**: Tracks plate number, model, capacity, and active status (`idle`, `on_trip`, `maintenance`). Allows creating, editing, and deleting shuttles.
- **How it works**: Performs CRUD operations directly on the Firestore `shuttles` collection. Displays status badges that change color depending on whether a bus is running or under maintenance.
- **Responsible Files**:
  - [buses/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/buses/page.tsx)

### 3. Driver Management & Bus Assignment
- **What it does**: Lists drivers. Admins can register new drivers, update contact info, license numbers, active statuses, and assign a specific bus plate to them.
- **How it works**: Queries the `users` collection where `role == 'driver'`. Populates a select dropdown with active buses fetched from the `shuttles` collection so admins can pair drivers to vehicles.
- **Responsible Files**:
  - [drivers/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/drivers/page.tsx)

### 4. Passenger (Student) Account Operations
- **What it does**: Displays students registered on the campus app. Allows administrators to permanently ban students or issue temporary suspensions (blocks) with reasons (e.g., misconduct on the bus).
- **How it works**: Queries `users` where `role == 'passenger'`. When blocking, it updates the passenger document with `isBlocked: true`, `blockedUntil`, and `blockReason` fields.
- **Responsible Files**:
  - [students/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/students/page.tsx)

### 5. Stations (Routes) Management
- **What it does**: Pins campus stations to coordinate bus routes. Stores coordinate pairs (latitude/longitude) and expected passenger counts.
- **How it works**: Creates and updates documents in the `stations` collection. Displays active/inactive badges and daily passenger projections.
- **Responsible Files**:
  - [routes/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/routes/page.tsx)

### 6. Emergency Alerts & Broadcast Notifications
- **What it does**: Allows dispatchers to issue critical announcements (severity levels: `info`, `warning`, `critical`). Immediately fires a push notification to all mobile devices.
- **How it works**: Writes the alert description to the `alerts` collection. Simultaneously fires a `POST` request to `/api/notifications/broadcast`, which uses FCM to message the `'all_users'` topic.
- **Responsible Files**:
  - [alerts/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/alerts/page.tsx)
  - [api/notifications/broadcast/route.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/api/notifications/broadcast/route.ts)

### 7. Real-Time Support Desk with Email Fallback
- **What it does**: Allows admins to message the root administrator. If a message is sent outside of business hours (M-F, 10 AM - 6 PM), the chat system automatically forwards the message to the root administrator's email.
- **How it works**: Uses `onSnapshot` to listen to messages in `support_chats/{chatId}/messages`. If the business hours check returns false, it triggers EmailJS via the user's browser, sending the text to the admin's inbox.
- **Responsible Files**:
  - [support/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/support/page.tsx)

### 8. Multi-Factor Authentication (MFA)
- **What it does**: Protects admin accounts by requesting an SMS code verification upon login if enrolled.
- **How it works**: Uses Firebase Auth MFA triggers. `login/page.tsx` catches `auth/multi-factor-auth-required`, reads the enrolled phone factors using `getMultiFactorResolver`, and displays the `MFAChallenge` dialog to verify the SMS OTP.
- **Responsible Files**:
  - [components/auth/mfa-challenge.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/components/auth/mfa-challenge.tsx)
  - [components/auth/phone-enrollment.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/components/auth/phone-enrollment.tsx)
  - [profile/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/profile/page.tsx)

---

## Database Analysis

### Schema Overview (Firestore NoSQL)

```mermaid
erDiagram
    admins {
        string uid PK
        string fullName
        string email
        string phone
        string role "root | admin"
        string status "active | inactive"
        boolean emailVerified
        string avatar
        string photoURL
        string createdAt
    }
    users {
        string uid PK
        string name
        string fullName
        string email
        string phone
        string role "passenger | driver"
        string licenseNumber
        string vehicleAssigned
        boolean isActive
        float rating
        boolean isBlocked
        string blockedUntil
        string blockReason
        string fcmToken
    }
    shuttles {
        string id PK
        string plateNumber
        string model
        int capacity
        string status "idle | on_trip | maintenance"
        boolean isActive
        string currentRouteId
        string currentTripId
    }
    stations {
        string id PK
        string name
        float lat
        float lng
        boolean isActive
        int expectedPassengersPerDay
    }
    trips {
        string id PK
        string routeId
        string driverId
        int passengerCount
        boolean active
        timestamp createdAt
    }
    alerts {
        string id PK
        string title
        string description
        string type "info | warning | critical"
        string status "unread | read"
        timestamp createdAt
    }
    reports {
        string id PK
        string description
        string driverId
        string tripId
        string type
        timestamp createdAt
    }
    complaints {
        string id PK
        string description
        string status "resolved | pending"
        string fromUserId
        string tripId
        string assignedTo
        timestamp createdAt
    }
    support_chats {
        string adminUid PK
        string adminName
        string adminEmail
        string lastMessage
        timestamp lastMessageAt
        int unreadByRoot
        int unreadByAdmin
    }
    messages {
        string id PK
        string senderId
        string senderName
        string senderRole "admin | root"
        string message
        timestamp timestamp
        boolean read
        boolean sentByEmail
    }

    support_chats ||--|{ messages : contains
```

### Table / Collection Explanations

1. **`admins`**: Holds credentials for users who can access the dashboard.
   - *Important Fields*: `role` determines RBAC permissions (only `root` can view the admin manager menu). `emailVerified` prevents premature login before activating the account.
2. **`users`**: Combined collection containing both drivers and passengers.
   - *Important Fields*: `role` determines access type. `isBlocked` and `blockedUntil` are checked by the passenger client application to restrict boarding passes. `licenseNumber` and `vehicleAssigned` track drivers.
3. **`shuttles`**: Details every vehicle.
   - *Important Fields*: `status` tracks vehicle availability (`idle`, `on_trip`, `maintenance`).
4. **`support_chats`**: Roots live conversations.
   - *Important Fields*: `unreadByRoot` and `unreadByAdmin` track unread counts for badge alerts.

---

## API Documentation

### 1. Broadcast Notification
- **Endpoint URL**: `/api/notifications/broadcast`
- **HTTP Method**: `POST`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "title": "System Alert",
  "body": "North Campus Loop is running 15 minutes late due to traffic.",
  "type": "warning"
}
```
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "messageId": "projects/shuttle-guidance-system/messages/1234567890"
}
```
- **Response Format (400 Bad Request)**:
```json
{
  "error": "title and body are required"
}
```
- **Purpose**: Sends a cloud notification to all active devices subscribed to the `"all_users"` topic.

### 2. Send Targeted Notification
- **Endpoint URL**: `/api/notifications/send`
- **HTTP Method**: `POST`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "token": "fcm_device_token_string",
  "title": "Account Status Update",
  "body": "Your support ticket has been resolved by an administrator.",
  "data": {
    "ticketId": "complaint_doc_id"
  }
}
```
- **Response Format (200 OK)**:
```json
{
  "success": true,
  "messageId": "projects/shuttle-guidance-system/messages/9876543210"
}
```
- **Purpose**: Directs a push notification to a specific device (e.g., driver or passenger) using their registration token.

---

## Authentication and Security

### Authentication Mechanism
The system relies on **Firebase Authentication** client SDK with a custom state listener:
- **Session Observer**: `onAuthStateChanged` is initialized inside `AuthProvider`. If a session exists, it queries the `admins/{uid}` document to ensure the user is registered as an admin.
- **Email Verification Guard**: If an admin's account is verified via Firebase, but `emailVerified` is false in Firestore, they are redirected to `/verify`. They cannot bypass this screen until they click the email confirmation link.

### Multi-Factor Authentication (MFA) Flow
```
[User inputs Email/Password] ──> [Firebase Auth checks MFA status]
                                     │
                                     ├──> (No 2FA Enrolled) ──> [Redirect to Dashboard]
                                     │
                                     └──> (2FA Enrolled) ──> [Throw MFA Required Exception]
                                                                 │
                                                                 └──> [Show SMS Code Sheet] ──> [Submit OTP] ──> [Redirect to Dashboard]
```

### Authorization Model (Role-Based Access Control)
The application defines two user roles:
1. **`root` (Root Admin)**:
   - Complete CRUD access.
   - Can manage admin accounts in `/admins`.
   - Access is guarded via:
     ```tsx
     <RouteGuard requiredRole="root"> ... </RouteGuard>
     ```
2. **`admin` (Standard Admin)**:
   - Restricted from the `/admins` panel.
   - Can view the `/help` page and run standard shuttle operations.

### Administrative Session Safety
To create new admins without logging out the current active session, the app creates a secondary Firebase App instance:
```typescript
export function getSecondaryAuth() {
  const name = 'secondary'
  const secondaryApp = getApps().some((a) => a.name === name) 
    ? getApp(name) 
    : initializeApp(firebaseConfig, name)
  return getAuth(secondaryApp)
}
```
Standard Firebase sign-up triggers automatically sign in the newly registered account. By executing `createUserWithEmailAndPassword` on the secondary auth instance, the active admin session is preserved.

### Firebase App Check
To prevent unauthorized API access, Firebase App Check with **reCAPTCHA V3** is configured:
```typescript
if (typeof window !== 'undefined') {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  }
}
```

---

## Frontend Analysis

### Pages and Routes
- `/login`: Form-based entry point featuring support triggers, password visibility toggle, and the MFA verification modal.
- `/register`: Allows admins to create credentials.
- `/verify`: Prevents dashboard access if the account's email verification link has not been clicked.
- `/dashboard`: High-level metrics view with responsive charts.
- `/buses`: Form dialogs for editing active/inactive shuttles.
- `/students`: Lists registered passengers with support for account suspension/blocking.
- `/drivers`: Grid to manage driver details and assign shuttles.
- `/routes`: Register, inspect, and update campus stations.
- `/trips`: Trip scheduler (displays mock data list).
- `/alerts`: Log and publish critical alerts.
- `/support`: If standard admin, opens a single thread with the root admin. If root admin, lists all active threads.
- `/profile`: Session overview, password reset trigger, and SMS 2FA enrollment.

### State Flow Diagram
```mermaid
graph TD
    App([App Launch]) --> CheckSession{Session exists?}
    CheckSession -- No --> RenderLogin[Show Login Page]
    CheckSession -- Yes --> CheckVerify{Email Verified?}
    CheckVerify -- No --> RenderVerify[Show Verify Page]
    CheckVerify -- Yes --> CheckRole{Role == 'root'?}
    CheckRole -- Yes --> AllowAll[Full Access including /admins]
    CheckRole -- No --> DenyAdmins[Restrict /admins, allow operations]
```

---

## Backend Analysis

### API Handlers & Controllers
The project implements Serverless Route Handlers using Next.js. The endpoints act as middleware between the client and the Firebase Cloud Messaging network.

```typescript
// app/api/notifications/broadcast/route.ts
export async function POST(req: NextRequest) {
    try {
        const { title, body, type = 'info' } = await req.json()
        if (!title || !body) {
            return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
        }
        const message = {
            topic: 'all_users',
            notification: { title, body },
            data: { type, clickAction: 'OPEN_APP' },
            android: {
                priority: 'high' as const,
                notification: { channelId: 'alerts', priority: 'high' as const },
            },
            apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        }
        const response = await adminMessaging.send(message)
        return NextResponse.json({ success: true, messageId: response })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
    }
}
```

### Services & Utilities
- **`firebase-admin.ts`**: Initializes the admin app on the server. Because `.env` files parse linebreaks in keys incorrectly, it replaces escaped newlines:
  ```typescript
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  ```
- **`admin-protection.ts`**: Implements rules governing admin modification:
  - Admins cannot delete their own account.
  - Standard admins cannot edit or delete root administrators.
  - Root self-deletion is prevented.

---

## Configuration Files

### 1. `next.config.mjs`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Permits builds with TypeScript errors
  },
  images: {
    unoptimized: true,       // Bypasses Next.js image optimization costs
  },
}
export default nextConfig
```

### 2. `tsconfig.json`
- **Compiler Target**: `ES6`
- **Module Resolution**: `bundler` (for compatibility with modern build tools)
- **Path Aliases**: maps `@/*` to the project root directory `./*`
- **Strict Checks**: `"strict": true` (enforces type safety guidelines)

### 3. `components.json`
Configures Shadcn UI.
- **Style**: `new-york` (modern clean design system)
- **Base Color**: `neutral`
- **CSS Variables**: `true` (enables dynamic color themes)

### 4. `cors.json`
Specifies CORS parameters for Firebase Storage, allowing wildcards (`*`) for GET, PUT, POST, DELETE, and HEAD requests.

---

## Dependencies Analysis

| Dependency Name | Version | Purpose | Used In |
| :--- | :--- | :--- | :--- |
| `next` | `^16.1.6` | Framework engine. | Global routing, SSR, and API route generation. |
| `react` / `react-dom` | `19.2.0` | Frontend rendering engine. | Component hierarchy. |
| `firebase` | `12.8.0` | Client-side database, auth, and analytics integration. | [lib/firebase.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/lib/firebase.ts) |
| `firebase-admin` | `^10.3.0` | Server-side Firebase integration. | [lib/firebase-admin.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/lib/firebase-admin.ts) |
| `@supabase/supabase-js`| `^2.93.2` | Client for Supabase operations. | [lib/supabase.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/lib/supabase.ts) |
| `@emailjs/browser` | `^4.4.1` | Client-side email sending utility. | [support/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/support/page.tsx) |
| `recharts` | `2.15.4` | Chart visualizations. | [dashboard/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/dashboard/page.tsx) |
| `lucide-react` | `^0.454.0` | SVG icons. | Global UI elements. |
| `tailwindcss` | `^4.1.9` | Dynamic styling compile pipeline. | [app/globals.css](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/globals.css) |
| `date-fns` | `4.1.0` | Date parsing utilities. | Helper modules. |

---

## Project Workflow

```
[User Input Credentials]
    │
    ▼
[MFA Verification?] ── Yes ──> [SMS Verification Dialog]
    │ No
    ▼
[Check Email Verification] ── Unverified ──> [Verify Page (Resend / Check Status)]
    │ Verified
    ▼
[Fetch Profile from admins/{uid}]
    │
    ▼
[Redirect to /dashboard] ──> [Load Real-time Firestore Listeners]
    │
    ▼
[Standard Operator Work] ──> [Create Announcements / Manage Shuttles / Register Drivers]
    │
    ▼
[Outside Business Hours Chat?] ── Yes ──> [Trigger EmailJS API Fallback]
```

---

## Setup and Deployment

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone <repository_url>
   cd Shuttle-Guidance-System
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

### Environment Variables
Create a `.env.local` file in the root directory:
```env
# Client Side Firebase Keys
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Client Side reCAPTCHA Site Key
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_key

# Secondary Auth/Root configuration
NEXT_PUBLIC_ROOT_ADMIN_UID=your_root_admin_uid

# EmailJS credentials
NEXT_PUBLIC_EMAILJS_SERVICE_ID=your_service_id
NEXT_PUBLIC_EMAILJS_TEMPLATE_ID=your_template_id
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=your_public_key

# Optional Supabase config
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Server Side Firebase Admin Credentials
FIREBASE_ADMIN_PROJECT_ID=your_admin_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_admin_client_email
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC..."
```

### Build & Run Commands
- **Development Server**:
  ```bash
  npm run dev
  ```
- **Build Production Bundle**:
  ```bash
  npm run build
  ```
- **Start Production Server**:
  ```bash
  npm run start
  ```

---

## Code Quality Assessment

### Strengths
- **Session Preservation**: Using a secondary Firebase App instance for admin creation is a clean solution that keeps the active admin logged in during registration.
- **Graceful Fallbacks**: The Supabase client implementation in [supabase.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/lib/supabase.ts) is wrapped in try-catch blocks to prevent application crashes if environment variables are missing.
- **SMS MFA Integration**: Out-of-the-box support for SMS multi-factor challenges adds high-grade security to the admin panel.
- **Offline Message Routing**: Using EmailJS to forward chats during offline hours ensures requests are not missed.

### Weaknesses
- **TypeScript Error Suppression**: Setting `ignoreBuildErrors: true` in `next.config.mjs` allows typing errors to slip into production, reducing the benefits of using TypeScript.
- **Mock Data on Trips Page**: The Trip Management page uses hardcoded mock data for the list of trips, rather than fetching and writing to the Firebase Firestore `trips` collection, even though Firestore `trips` is queried by the dashboard.
- **No API Route Authentication**: The Serverless routes (`/api/notifications/broadcast` and `/api/notifications/send`) do not verify if the request came from an authenticated administrator session, exposing the FCM endpoints to unauthorized HTTP requests.
- **Hardcoded Fallback Credentials**: Default Firebase configuration parameters are hardcoded in the initialization script [firebase.ts](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/lib/firebase.ts), which could expose keys if checked into public repositories.
- **Unused Supabase Upload Code**: The Supabase SDK is imported and configured in the project, but there is no actual implementation for uploading images on the Profile page.

---

## Recommendations

### 1. Enable TypeScript Build Verifications
Remove the TypeScript error bypass from `next.config.mjs` to ensure type issues are caught before deployment:
```diff
  typescript: {
-   ignoreBuildErrors: true,
+   ignoreBuildErrors: false,
  },
```

### 2. Implement Route Authentication Middleware
Add token verification to serverless route handlers to secure the notification endpoints:
```typescript
import { adminMessaging } from '@/lib/firebase-admin'
import admin from 'firebase-admin'

// Inside API routes
const authHeader = req.headers.get('Authorization')
if (!authHeader?.startsWith('Bearer ')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
const token = authHeader.split('Bearer ')[1]
const decodedToken = await admin.auth().verifyIdToken(token)
// Ensure decodedToken.uid belongs to an admin...
```

### 3. Connect Trips Page to Firestore
Refactor [trips/page.tsx](file:///home/malak/Documents/Graduation/WEB/Shuttle-Guidance-System/app/trips/page.tsx) to perform real-time reads and writes to Firestore rather than using static arrays.

---

## Conclusion

The **Shuttle Guidance System** dashboard provides a clean administrative panel for fleet operators. By integrating Firebase Authentication (MFA), Cloud Firestore (NoSQL database), and FCM push notifications, it delivers a real-time command center for campus loops. 

While the frontend styling and database synchronization are solid, securing the API route handlers and resolving the mock data dependencies are recommended before staging for production. With these adjustments, the system will offer a robust, secure solution for campus shuttle fleet management.
