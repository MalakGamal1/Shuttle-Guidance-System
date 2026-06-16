'use client'

import { useAuth, UserRole } from '@/context/auth-context'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { ReactNode } from 'react'

interface RouteGuardProps {
  children: ReactNode
  requiredRole?: UserRole
  excludeRoles?: UserRole[]
  fallback?: ReactNode
}

export function RouteGuard({ children, requiredRole, excludeRoles, fallback }: RouteGuardProps) {
  const { user, role, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    // Redirect to login if not authenticated
    if (!user) {
      router.push('/login')
      return
    }

    // Check if user's role is excluded from this route
    if (excludeRoles && excludeRoles.includes(role as UserRole)) {
      router.push('/dashboard')
      return
    }

    // Check role-based access (required role)
    if (requiredRole && role !== requiredRole) {
      router.push('/dashboard')
      return
    }
  }, [user, role, loading, requiredRole, excludeRoles, router, pathname])

  if (loading) {
    return fallback || <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  // Redirect if user's role is excluded
  if (excludeRoles && excludeRoles.includes(role as UserRole)) {
    return fallback || <div className="flex items-center justify-center h-screen">Access Denied</div>
  }

  // Show fallback if user doesn't have required role
  if (requiredRole && role !== requiredRole) {
    return fallback || <div className="flex items-center justify-center h-screen">Access Denied</div>
  }

  // Show content if authenticated and authorized
  return user ? <>{children}</> : null
}
