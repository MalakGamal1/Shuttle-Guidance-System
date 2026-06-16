import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminApp } from '@/lib/firebase-admin'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * DELETE /api/drivers/delete
 *
 * Deletes a driver from both Firebase Authentication and Firestore,
 * preventing orphan records.
 *
 * Body: { uid: string }
 */
export async function DELETE(req: NextRequest) {
    try {
        if (!adminAuth || !adminApp) {
            return NextResponse.json(
                { error: 'Firebase Admin SDK is not initialized.' },
                { status: 500 }
            )
        }

        const { uid } = await req.json()

        if (!uid) {
            return NextResponse.json({ error: 'uid is required.' }, { status: 400 })
        }

        const db = getFirestore(adminApp)

        // Delete from Firebase Auth first
        try {
            await adminAuth.deleteUser(uid)
        } catch (err: any) {
            // If user doesn't exist in Auth, still proceed with Firestore deletion
            if (err.code !== 'auth/user-not-found') {
                throw err
            }
            console.warn(`[DELETE /api/drivers/delete] Auth user ${uid} not found — proceeding with Firestore deletion.`)
        }

        // Delete from Firestore
        await db.collection('users').doc(uid).delete()

        return NextResponse.json({
            success: true,
            message: 'Driver deleted from Auth and Firestore.',
        })
    } catch (error: any) {
        console.error('[DELETE /api/drivers/delete] Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to delete driver.' },
            { status: 500 }
        )
    }
}
