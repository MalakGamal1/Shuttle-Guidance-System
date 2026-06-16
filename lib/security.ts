import type { UserRole } from '@/context/auth-context'

/**
 * Root admin identification.
 *
 * We treat any account with role "root" as root.
 * Additionally, you may pin a specific UID as root via env.
 *
 * NOTE: This is UI/client-side enforcement. Data writes must also be guarded
 * (see `lib/admin-protection.ts`).
 */
export const ROOT_ADMIN_UID = process.env.NEXT_PUBLIC_ROOT_ADMIN_UID?.trim() || null

export function isRootAdmin(params: { uid?: string | null; role?: UserRole | null }): boolean {
  const { uid, role } = params
  if (role === 'root') return true
  if (ROOT_ADMIN_UID && uid && uid === ROOT_ADMIN_UID) return true
  return false
}

