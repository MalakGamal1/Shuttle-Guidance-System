'use client'

import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User, reload, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, collection, getDocs } from 'firebase/firestore'
import { Profile } from '@/types/profile'
import { getDefaultAvatarUrl } from '@/lib/assets'
import { useRouter, usePathname } from 'next/navigation'

export type UserRole = 'root' | 'admin'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const router = useRouter()
  const pathname = usePathname()

  const logout = async () => {
    setIsLoggingOut(true)
    // Mark admin as inactive and invalidate session in Firestore before signing out
    if (user) {
      try {
        await updateDoc(doc(db, 'admins', user.uid), {
          status: 'inactive',
          sessionValid: false,
          lastActiveAt: serverTimestamp(),
        })
      } catch { /* non-fatal */ }
    }
    await signOut(auth)
    router.push('/login')
  }

  // Track the user ref so beforeunload can access it synchronously
  const userRef = useRef<User | null>(null)
  useEffect(() => { userRef.current = user }, [user])

  // When browser/tab is closed, mark admin as inactive via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentUser = userRef.current
      if (!currentUser) return
      // Use sendBeacon to reliably send data during page unload.
      const projectId = db.app.options.projectId
      if (!projectId) return
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${currentUser.uid}?updateMask.fieldPaths=status&updateMask.fieldPaths=lastActiveAt&updateMask.fieldPaths=sessionValid`
      const body = JSON.stringify({
        fields: {
          status: { stringValue: 'inactive' },
          sessionValid: { booleanValue: false },
          lastActiveAt: { timestampValue: new Date().toISOString() },
        },
      })
      try {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      } catch { /* best-effort */ }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Heartbeat, suspension check, and realtime profile synchronization
  useEffect(() => {
    if (!user) return

    const docRef = doc(db, 'admins', user.uid)

    // 1. Realtime listener for suspension, session invalidation, and role changes
    const unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()

        // Force sign out if suspended or sessionValid is false
        if (data.suspended === true) {
          console.warn('[Auth] Admin account is suspended. Forcing logout.')
          const handleSuspensionLogout = async () => {
            try {
              const adminsSnap = await getDocs(collection(db, 'admins'))
              const rootEmails: string[] = []
              adminsSnap.forEach((docSnap) => {
                const d = docSnap.data()
                if (d.role === 'root' && d.email) {
                  rootEmails.push(d.email)
                }
              })
              if (rootEmails.length > 0) {
                localStorage.setItem('suspended_root_emails', JSON.stringify(rootEmails))
              }
            } catch (err) {
              console.error('Failed to fetch root emails on suspension:', err)
            } finally {
              localStorage.setItem('suspended_logout', 'true')
              logout()
            }
          }
          handleSuspensionLogout()
          return
        }

        if (data.sessionValid === false) {
          console.warn('[Auth] Session invalidated. Forcing logout.')
          logout()
          return
        }

        setProfile((prev) => (prev ? { ...prev, ...data } : null))
        setRole(data.role || 'admin')
      }
    }, (err) => {
      console.error('[Auth] Realtime admin profile listener error:', err)
    })

    // 2. Periodic heartbeat updating lastActiveAt every 5 minutes
    const heartbeatInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        try {
          await updateDoc(docRef, {
            lastActiveAt: serverTimestamp(),
            status: 'active'
          })
        } catch (err) {
          console.error('[Auth] Failed to send heartbeat:', err)
        }
      }
    }, 5 * 60 * 1000)

    return () => {
      unsubscribeSnapshot()
      clearInterval(heartbeatInterval)
    }
  }, [user])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        const isPublicRoute = ['/login', '/verify', '/forgot-password', '/reset-password'].includes(pathname)

        if (firebaseUser) {
          // Fresh Firebase Auth state
          try { await reload(firebaseUser) } catch { /* non-fatal */ }

          // Admin/root profiles live in the 'admins' collection
          const profileDocRef = doc(db, 'admins', firebaseUser.uid)
          const profileDocSnap = await getDoc(profileDocRef)

          const defaultAvatar = (firebaseUser.photoURL || '').trim() || getDefaultAvatarUrl()

          const defaults: Profile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            fullName: firebaseUser.displayName || '',
            phone: '',
            role: 'admin',
            status: 'active',
            avatar: defaultAvatar,
            photoURL: defaultAvatar,
            createdAt: new Date().toISOString(),
            emailVerified: firebaseUser.emailVerified || false,
          }

          let userProfile: Profile
          if (profileDocSnap.exists()) {
            const data = profileDocSnap.data()
            const dataAvatar = typeof data.avatar === 'string' ? data.avatar.trim() : ''
            const dataPhotoURL = typeof data.photoURL === 'string' ? data.photoURL.trim() : ''
            const enforcedAvatar = dataAvatar || dataPhotoURL || defaultAvatar
            userProfile = {
              ...defaults,
              ...data,
              status: 'active',
              avatar: enforcedAvatar,
              photoURL: enforcedAvatar,
            }
            await setDoc(profileDocRef, {
              ...userProfile,
              status: 'active',
              sessionValid: true,
              lastActiveAt: serverTimestamp(),
            }, { merge: true })

            // Check Verification Status
            const isVerified = userProfile.emailVerified === true || firebaseUser.emailVerified;

            if (!isVerified) {
              if (!isPublicRoute) {
                router.push('/verify')
              }
            }

            setProfile(userProfile)
            setRole(userProfile.role)
            setUser(firebaseUser)
          } else {
            console.warn('[Auth] No admin profile found. Forcing sign out.')
            await signOut(auth)
            setUser(null)
            setProfile(null)
            setRole(null)
            setError('Unauthorized: Admin access required.')
            if (!isPublicRoute) {
              router.push('/login')
            }
          }
        } else {
          // Session expired or user signed out
          const prevUser = userRef.current
          if (prevUser && !isLoggingOut) {
            try {
              await updateDoc(doc(db, 'admins', prevUser.uid), {
                status: 'inactive',
                sessionValid: false,
                lastActiveAt: serverTimestamp(),
              })
            } catch { /* non-fatal */ }
          }
          if (!isPublicRoute && !isLoggingOut) {
            router.push('/login')
          }
          setIsLoggingOut(false)
          setUser(null)
          setProfile(null)
          setRole(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user profile')
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [pathname, router, isLoggingOut])

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, error, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
