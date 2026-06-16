'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Bus,
  LogOut,
  Map,
  MapPin,
  Navigation,
  Settings,
  Users,
  HelpCircle,
  Bell,
  User,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Menu,
  MessageSquare,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAuth } from '@/context/auth-context'
import { cn } from '@/lib/utils'


const menuItems = [
  { icon: BarChart3, label: 'Dashboard', href: '/dashboard' },
  { icon: Map, label: 'Live Map', href: '/dashboard/map' },
  { icon: Bus, label: 'Bus Management', href: '/buses' },
  { icon: Users, label: 'Passengers', href: '/students' },
  { icon: Users, label: 'Drivers', href: '/drivers' },
  { icon: MapPin, label: 'Stations', href: '/routes' },
  { icon: Navigation, label: 'Trips', href: '/trips' },
  { icon: FileText, label: 'Reports', href: '/reports' },
  { icon: Bell, label: 'Alerts', href: '/alerts' },
  { icon: MessageSquare, label: 'Support', href: '/support' },
]

const adminOnlyItems = [
  { icon: Settings, label: 'Manage Admins', href: '/admins' },
]

const bottomMenuItems = [
  { icon: User, label: 'Profile', href: '/profile' },
  { icon: Settings, label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Help', href: '/help', visibleFor: 'admin' }, // Only for non-root
  { icon: LogOut, label: 'Logout', href: '/logout' },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { role } = useAuth()

  // Combine menu items based on user role
  const visibleMenuItems = [
    ...menuItems,
    ...(role === 'root' ? adminOnlyItems : []),
  ]

  // Filter bottom menu items based on role
  const visibleBottomItems = bottomMenuItems.filter((item) => {
    // Help page is only visible for non-root users
    if (item.href === '/help' && role === 'root') {
      return false
    }
    return true
  })

  return (
    <div
      className={cn(
        'relative fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300 md:static md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header with Logo/App Name on Left, Close Button on Right */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
        {/* Left: App Logo/Name */}
        {/* Left: App Logo/Name */}
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-3 font-bold text-foreground">
            <img
              src="https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/u-removebg-preview.png"
              alt="Application logo"
              width={32}
              height={32}
              loading="eager"
              style={{ height: 'auto' }}
              className="h-8 w-auto max-w-[32px] object-contain flex-shrink-0"
            />
            <span className="truncate">UinGO Admin</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            <img
              src="https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/u-removebg-preview.png"
              alt="Application logo"
              width={32}
              height={32}
              loading="eager"
              style={{ height: 'auto' }}
              className="h-8 w-auto max-w-[32px] object-contain"
            />
          </Link>
        )}

        {/* Right: Theme Toggle + Close Button (Mobile only) */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle - Always visible on desktop */}
          {!isCollapsed && <ThemeToggle />}

          {/* Close Button - Mobile only */}
          <button
            onClick={onClose}
            className="md:hidden"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>
      </div>

      {/* Main Menu - Scrollable */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                // Only close sidebar on mobile
                if (window.innerWidth < 768) {
                  onClose?.()
                }
              }}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-sidebar-accent',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Menu - Pinned */}
      <div className="border-t border-sidebar-border px-2 py-4 space-y-1">
        {visibleBottomItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                // Only close sidebar on mobile
                if (window.innerWidth < 768) {
                  onClose?.()
                }
              }}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-sidebar-accent',
                isCollapsed && 'justify-center'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </div>

      {/* ── Collapse / Expand toggle — sits on the RIGHT EDGE of the sidebar ── */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-3.5 top-8 z-50 hidden md:flex',
            'h-7 w-7 items-center justify-center rounded-full',
            'border border-border bg-card shadow-md',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-sidebar-accent transition-all duration-200'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  )
}

export function MobileHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { role } = useAuth()

  return (
    <>
      {/* Mobile Header - Only visible on mobile */}
      <header className="sticky top-0 z-30 border-b border-border bg-card px-4 py-4 md:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Shuttle Admin</h1>
          {/* Mobile hamburger menu */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  )
}
