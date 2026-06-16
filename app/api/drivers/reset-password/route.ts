import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

/**
 * POST /api/drivers/reset-password
 *
 * Allows an admin to reset a driver's password via Firebase Admin SDK.
 *
 * Body: { uid: string, newPassword: string }
 */
export async function POST(req: NextRequest) {
    try {
        if (!adminAuth) {
            return NextResponse.json(
                { error: 'Firebase Admin SDK is not initialized.' },
                { status: 500 }
            )
        }

        const { uid, newPassword } = await req.json()

        if (!uid) {
            return NextResponse.json({ error: 'uid is required.' }, { status: 400 })
        }
        if (!newPassword || newPassword.length < 8) {
            return NextResponse.json(
                { error: 'New password must be at least 8 characters.' },
                { status: 400 }
            )
        }

        await adminAuth.updateUser(uid, { password: newPassword })

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully.',
        })
    } catch (error: any) {
        console.error('[POST /api/drivers/reset-password] Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to reset password.' },
            { status: 500 }
        )
    }
}
