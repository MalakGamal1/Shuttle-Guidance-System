import { NextRequest, NextResponse } from 'next/server'
import { adminMessaging } from '@/lib/firebase-admin'

/**
 * POST /api/notifications/send
 *
 * Sends an FCM notification to a specific device token.
 * Body: { token: string, title: string, body: string, data?: Record<string, string> }
 */
export async function POST(req: NextRequest) {
    try {
        const { token, title, body, data = {} } = await req.json()

        if (!token || !title || !body) {
            return NextResponse.json(
                { error: 'token, title, and body are required' },
                { status: 400 }
            )
        }

        const message = {
            token,
            notification: { title, body },
            data,
            android: {
                priority: 'high' as const,
                notification: {
                    channelId: 'alerts',
                    priority: 'high' as const,
                },
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
            },
        }

        const response = await adminMessaging.send(message)

        return NextResponse.json({ success: true, messageId: response })
    } catch (error: any) {
        console.error('FCM send error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to send notification' },
            { status: 500 }
        )
    }
}
