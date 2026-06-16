/**
 * Root/Admin protection utilities.
 *
 * CRITICAL:
 * - Root admin must NOT be editable or deletable from the UI.
 * - Root self-deletion must never be possible.
 *
 * Note: In a pure client-only app, "backend logic" means centralized guard
 * functions that are always consulted before calling Firestore mutations.
 */

/**
 * Check if a user can delete an admin account.
 * Root users cannot delete themselves.
 * 
 * @param targetUid - The UID of the admin to be deleted
 * @param currentUserUid - The UID of the current user attempting the deletion
 * @param currentUserRole - The role of the current user
 * @param targetAdminRole - The role of the admin being deleted (optional, for extra safety)
 * @returns Object with canDelete flag and error message if deletion is not allowed
 */
export function canDeleteAdmin(
  targetUid: string,
  currentUserUid: string | undefined,
  currentUserRole: 'root' | 'admin' | null,
  targetAdminRole?: 'root' | 'admin'
): { canDelete: boolean; error?: string } {
  // Must be authenticated
  if (!currentUserUid) {
    return { canDelete: false, error: 'You must be logged in to delete admins' }
  }

  // Cannot delete yourself (covers root self-deletion).
  if (targetUid === currentUserUid) {
    return { canDelete: false, error: 'You cannot delete your own account' }
  }

  // Only root can manage admins.
  if (currentUserRole !== 'root') {
    return { canDelete: false, error: 'Only root administrators can delete admins' }
  }

  return { canDelete: true }
}

export function canEditAdmin(
  targetUid: string,
  currentUserUid: string | undefined,
  currentUserRole: 'root' | 'admin' | null,
  targetAdminRole?: 'root' | 'admin'
): { canEdit: boolean; error?: string } {
  if (!currentUserUid) return { canEdit: false, error: 'You must be logged in to edit admins' }
  if (currentUserRole !== 'root') return { canEdit: false, error: 'Only root administrators can edit admins' }
  return { canEdit: true }
}

/**
 * Check if delete button should be disabled for an admin row.
 * 
 * @param adminUid - The UID of the admin in the row
 * @param currentUserUid - The UID of the current user
 * @param currentUserRole - The role of the current user
 * @param adminRole - The role of the admin in the row
 * @returns true if delete button should be disabled
 */
export function shouldDisableDeleteButton(
  adminUid: string,
  currentUserUid: string | undefined,
  currentUserRole: 'root' | 'admin' | null,
  adminRole?: 'root' | 'admin'
): boolean {
  const { canDelete } = canDeleteAdmin(adminUid, currentUserUid, currentUserRole, adminRole)
  return !canDelete
}

export function shouldDisableEditButton(
  adminUid: string,
  currentUserUid: string | undefined,
  currentUserRole: 'root' | 'admin' | null,
  adminRole?: 'root' | 'admin'
): boolean {
  const { canEdit } = canEditAdmin(adminUid, currentUserUid, currentUserRole, adminRole)
  return !canEdit
}
