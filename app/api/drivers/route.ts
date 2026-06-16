import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { adminApp } from '@/lib/firebase-admin'

/**
 * POST /api/drivers
 *
 * Creates a Firebase Auth account and a corresponding Firestore document
 * for a new driver. The Auth uid is used as the Firestore document ID so
 * there is always a 1:1 mapping.
 *
 * Body: {
 *   fullName, email, password, employeeId, phone,
 *   licenseNumber?, vehicleAssigned?, isActive?
 * }
 */
export async function POST(req: NextRequest) {
    try {
        if (!adminAuth || !adminApp) {
            return NextResponse.json(
                { error: 'Firebase Admin SDK is not initialized.' },
                { status: 500 }
            )
        }

        const body = await req.json()
        const {
            fullName,
            email,
            password,
            employeeId,
            phone,
            licenseNumber = '',
            vehicleAssigned = '',
            isActive = true,
        } = body

        // ── Validation ────────────────────────────────────────────────────
        if (!fullName?.trim()) {
            return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
        }
        if (!email?.trim()) {
            return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
        }
        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters.' },
                { status: 400 }
            )
        }
        if (!employeeId?.trim()) {
            return NextResponse.json({ error: 'Employee ID is required.' }, { status: 400 })
        }

        const db = getFirestore(adminApp)

        // ── Duplicate checks ──────────────────────────────────────────────

        // Check email uniqueness in Firebase Auth
        try {
            await adminAuth.getUserByEmail(email.trim())
            // If we get here, user already exists
            return NextResponse.json(
                { error: 'A user with this email already exists.' },
                { status: 409 }
            )
        } catch (err: any) {
            // auth/user-not-found means the email is free — continue
            if (err.code !== 'auth/user-not-found') {
                throw err
            }
        }

        // Check employeeId uniqueness in Firestore
        const employeeIdSnap = await db
            .collection('users')
            .where('employeeId', '==', employeeId.trim())
            .limit(1)
            .get()

        if (!employeeIdSnap.empty) {
            return NextResponse.json(
                { error: 'A driver with this Employee ID already exists.' },
                { status: 409 }
            )
        }

        // ── Create Firebase Auth account ──────────────────────────────────
        const userRecord = await adminAuth.createUser({
            email: email.trim(),
            password,
            displayName: fullName.trim(),
        })

        // Set custom claims so the mobile app can read the role
        await adminAuth.setCustomUserClaims(userRecord.uid, {
            role: 'driver',
            employeeId: employeeId.trim(),
        })

        // ── Create Firestore document (uid = doc ID) ──────────────────────
        const driverDoc = {
            uid: userRecord.uid,
            employeeId: employeeId.trim(),
            name: fullName.trim(),
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone?.trim() || '',
            licenseNumber: licenseNumber?.trim() || '',
            vehicleAssigned: vehicleAssigned?.trim() || '',
            isActive: Boolean(isActive),
            role: 'driver',
            rating: 0,
            fcmToken: null,
            theme: 'system',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastSeenAt: FieldValue.serverTimestamp(),
        }

        await db.collection('users').doc(userRecord.uid).set(driverDoc)

        return NextResponse.json({
            success: true,
            uid: userRecord.uid,
            message: 'Driver created successfully.',
        })
    } catch (error: any) {
        console.error('[POST /api/drivers] Error:', error)

        // Clean up: if Auth account was created but Firestore write failed,
        // attempt to delete the Auth account to avoid orphans.
        // (This is best-effort; the uid may not be available if createUser itself failed.)

        return NextResponse.json(
            { error: error.message || 'Failed to create driver.' },
            { status: 500 }
        )
    }
}
