import { NextRequest, NextResponse } from 'next/server'
import { adminMessaging } from '@/lib/firebase-admin'

/**
 * POST /api/notifications/broadcast
 *
 * Sends an FCM notification to the "all_users" topic.
 * Body: { title: string, body: string, type?: 'info' | 'warning' | 'critical' }
 */
export async function POST(req: NextRequest) {
    try {
        const { title, body, type = 'info' } = await req.json()

        if (!title || !body) {
            return NextResponse.json(
                { error: 'title and body are required' },
                { status: 400 }
            )
        }

        const message = {
            topic: 'all_users',
            notification: { title, body },
            data: { type, clickAction: 'OPEN_APP' },
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
        console.error('FCM broadcast error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to send notification' },
            { status: 500 }
        )
    }
}
