"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rtdb = exports.storage = exports.db = exports.auth = void 0;
exports.getSecondaryAuth = getSecondaryAuth;
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const storage_1 = require("firebase/storage");
const database_1 = require("firebase/database");
const app_check_1 = require("firebase/app-check");
const firebaseConfig = {
    // Use env vars when provided; fall back to known values to prevent hard crashes.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCQ0bUhA_viLpyl7fPM6beCZvdqNN2_-XM",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "shuttle-guidance-system.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "shuttle-guidance-system",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "shuttle-guidance-system.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "797180860066",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:797180860066:web:1075653b1f836f1a08e9fb",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-6GEKEWLYB3",
    // Required for Firebase Realtime Database
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://shuttle-guidance-system-default-rtdb.firebaseio.com",
};
// Initialize Firebase only once
const app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)(firebaseConfig) : (0, app_1.getApps)()[0];
// ── Firebase App Check ──────────────────────────────────────────────────
// Must run in the browser (not during SSR) and only once per app instance.
if (typeof window !== 'undefined') {
    // In development, enable the debug provider so local testing works
    // without real reCAPTCHA challenges. The debug token is logged to the
    // console — register it in Firebase Console → App Check → Manage debug tokens.
    if (process.env.NODE_ENV === 'development') {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';
    if (siteKey) {
        (0, app_check_1.initializeAppCheck)(app, {
            provider: new app_check_1.ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true, // auto-refresh before expiry
        });
    }
}
exports.auth = (0, auth_1.getAuth)(app);
exports.db = (0, firestore_1.getFirestore)(app);
exports.storage = (0, storage_1.getStorage)(app);
exports.rtdb = (0, database_1.getDatabase)(app);
exports.default = app;
/**
 * Secondary app/auth instance.
 *
 * Security/session note:
 * Creating users with the **primary** client auth will switch the current session.
 * We use a secondary auth instance to create new accounts without affecting the
 * currently logged-in admin session.
 */
function getSecondaryAuth() {
    const name = 'secondary';
    const secondaryApp = (0, app_1.getApps)().some((a) => a.name === name) ? (0, app_1.getApp)(name) : (0, app_1.initializeApp)(firebaseConfig, name);
    return (0, auth_1.getAuth)(secondaryApp);
}
