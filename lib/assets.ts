/**
 * Static assets hosted in Supabase Storage (public bucket).
 *
 * These URLs are intentionally hard-coded to match production requirements and
 * avoid broken logo/avatar after refresh/navigation.
 */

const SUPABASE_PUBLIC_LOGO_URL =
  'https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/logo.png'

const SUPABASE_PUBLIC_DEFAULT_AVATAR_URL =
  'https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/default-avatar.png'

export function getLogoUrl(): string {
  return SUPABASE_PUBLIC_LOGO_URL
}

export function getDefaultAvatarUrl(): string {
  return SUPABASE_PUBLIC_DEFAULT_AVATAR_URL
}

export function getLocalLogoFallbackUrl(): string {
  return '/placeholder-logo.png'
}

export function getLocalDefaultAvatarFallbackUrl(): string {
  return '/placeholder-user.jpg'
}

