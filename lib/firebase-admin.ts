import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { NextRequest } from 'next/server'

/**
 * Firebase Admin SDK — runs server-side only (API routes).
 *
 * Requires the following environment variables in .env.local:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY   (the full PEM string, with \n)
 */

function getAdminApp() {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

    // detailed runtime logging (without exposing secrets)
    console.log('[Firebase Admin Diagnostics] Checking environment variables...')
    console.log(`- FIREBASE_ADMIN_PROJECT_ID exists: ${!!projectId}`)
    console.log(`- FIREBASE_ADMIN_CLIENT_EMAIL exists: ${!!clientEmail}`)
    console.log(`- FIREBASE_ADMIN_PRIVATE_KEY exists: ${!!privateKey}`)

    const missingVars: string[] = []
    if (!projectId) missingVars.push('FIREBASE_ADMIN_PROJECT_ID')
    if (!clientEmail) missingVars.push('FIREBASE_ADMIN_CLIENT_EMAIL')
    if (!privateKey) missingVars.push('FIREBASE_ADMIN_PRIVATE_KEY')

    if (!projectId || !clientEmail || !privateKey) {
        console.error(`❌ Firebase Admin initialization failed: Missing environment variables: ${missingVars.join(', ')}`)
        return null
    }

    if (privateKey.includes('YOUR_PRIVATE_KEY_HERE')) {
        console.error('❌ Firebase Admin initialization failed: Private key contains default placeholder text.')
        return null
    }

    try {
        const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')
        const serviceAccount = {
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
            // also provide snake_case keys just in case
            project_id: projectId,
            client_email: clientEmail,
            private_key: formattedPrivateKey,
        } as ServiceAccount

        let app
        if (!getApps().length) {
            app = initializeApp({ credential: cert(serviceAccount) })
            console.log('✅ Firebase Admin initialized successfully')
        } else {
            app = getApps()[0]
            console.log('✅ Firebase Admin initialized successfully (singleton reused)')
        }

        // Verify that messaging becomes available
        const messaging = getMessaging(app)
        if (messaging) {
            console.log('✅ Firebase Admin Messaging service is available')
        }
        return app
    } catch (error: any) {
        console.error('❌ Firebase Admin initialization failed:', error.message)
        return null
    }
}

const adminApp = getAdminApp()

export { adminApp }

export const adminAuth = adminApp
    ? getAuth(adminApp)
    : null

export const adminMessaging = adminApp
    ? getMessaging(adminApp)
    : {
        send: async () => {
            throw new Error(
                'Firebase Admin SDK is not initialized. Please configure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY environment variables.'
            )
        },
        sendMulticast: async () => {
            throw new Error(
                'Firebase Admin SDK is not initialized. Please configure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY environment variables.'
            )
        },
        sendAll: async () => {
            throw new Error(
                'Firebase Admin SDK is not initialized. Please configure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY environment variables.'
            )
        }
    } as unknown as ReturnType<typeof getMessaging>

export async function verifyAdmin(req: NextRequest) {
    if (!adminAuth || !adminApp) {
        throw new Error('Firebase Admin SDK is not initialized.')
    }
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Unauthorized: Missing or invalid token.')
    }
    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    
    // Check if the user is in the admins collection
    const db = getFirestore(adminApp)
    const adminDoc = await db.collection('admins').doc(decodedToken.uid).get()
    if (!adminDoc.exists) {
        throw new Error('Unauthorized: Admin access required.')
    }
    
    const adminData = adminDoc.data()
    if (adminData?.suspended === true) {
        throw new Error('Unauthorized: Admin account is suspended.')
    }

    return {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: adminData?.role || 'admin',
    }
}

