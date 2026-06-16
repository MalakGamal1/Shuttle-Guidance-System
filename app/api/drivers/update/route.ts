import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminApp } from '@/lib/firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * PUT /api/drivers/update
 *
 * Updates a driver's Firestore document and, when necessary, their
 * Firebase Auth record (e.g. if the email changes).
 *
 * Body: {
 *   uid: string,            // required — identifies the driver
 *   fullName?: string,
 *   email?: string,         // if changed, Auth email is also updated
 *   phone?: string,
 *   licenseNumber?: string,
 *   vehicleAssigned?: string,
 *   isActive?: boolean,
 *   employeeId?: string,
 * }
 */
export async function PUT(req: NextRequest) {
    try {
        if (!adminAuth || !adminApp) {
            return NextResponse.json(
                { error: 'Firebase Admin SDK is not initialized.' },
                { status: 500 }
            )
        }

        const body = await req.json()
        const { uid, ...updates } = body

        if (!uid) {
            return NextResponse.json({ error: 'uid is required.' }, { status: 400 })
        }

        const db = getFirestore(adminApp)

        // ── Build Firestore update payload ────────────────────────────────
        const firestoreUpdate: Record<string, any> = {
            updatedAt: FieldValue.serverTimestamp(),
        }

        // Auth-level updates
        const authUpdate: Record<string, any> = {}

        if (updates.fullName !== undefined) {
            firestoreUpdate.name = updates.fullName.trim()
            firestoreUpdate.fullName = updates.fullName.trim()
            authUpdate.displayName = updates.fullName.trim()
        }
        if (updates.email !== undefined) {
            const newEmail = updates.email.trim()

            // Check that new email is not taken by another user
            try {
                const existing = await adminAuth.getUserByEmail(newEmail)
                if (existing.uid !== uid) {
                    return NextResponse.json(
                        { error: 'A user with this email already exists.' },
                        { status: 409 }
                    )
                }
            } catch (err: any) {
                if (err.code !== 'auth/user-not-found') throw err
                // email is free — good
            }

            firestoreUpdate.email = newEmail
            authUpdate.email = newEmail
        }
        if (updates.phone !== undefined) {
            firestoreUpdate.phone = updates.phone.trim()
        }
        if (updates.licenseNumber !== undefined) {
            firestoreUpdate.licenseNumber = updates.licenseNumber.trim()
        }
        if (updates.vehicleAssigned !== undefined) {
            firestoreUpdate.vehicleAssigned = updates.vehicleAssigned.trim()
        }
        if (updates.isActive !== undefined) {
            firestoreUpdate.isActive = Boolean(updates.isActive)
        }
        if (updates.employeeId !== undefined) {
            // Check uniqueness
            const snap = await db
                .collection('users')
                .where('employeeId', '==', updates.employeeId.trim())
                .limit(1)
                .get()
            const conflict = snap.docs.find((d) => d.id !== uid)
            if (conflict) {
                return NextResponse.json(
                    { error: 'A driver with this Employee ID already exists.' },
                    { status: 409 }
                )
            }
            firestoreUpdate.employeeId = updates.employeeId.trim()
        }

        // Apply Auth update if needed
        if (Object.keys(authUpdate).length > 0) {
            await adminAuth.updateUser(uid, authUpdate)
        }

        // Apply Firestore update
        await db.collection('users').doc(uid).update(firestoreUpdate)

        return NextResponse.json({
            success: true,
            message: 'Driver updated successfully.',
        })
    } catch (error: any) {
        console.error('[PUT /api/drivers/update] Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update driver.' },
            { status: 500 }
        )
    }
}
