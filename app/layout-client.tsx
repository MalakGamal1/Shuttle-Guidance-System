'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Sidebar, MobileHeader } from '@/components/sidebar'
import { RouteGuard } from '@/components/route-guard'

// Pages that should NOT show the sidebar
const publicPages = ['/login', '/register', '/forgot-password', '/verify']

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isClient, setIsClient] = useState(false)
  
  // Load sidebar state from localStorage on mount
  useEffect(() => {
    setIsClient(true)
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsSidebarCollapsed(JSON.parse(saved))
    }
  }, [])

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isSidebarCollapsed))
    }
  }, [isSidebarCollapsed, isClient])
  
  // Check if current page should show sidebar
  const showSidebar = !publicPages.includes(pathname)

  // If it's a public page (login, register, etc), show content only
  if (!showSidebar) {
    return <>{children}</>
  }

  // For protected pages, show sidebar + content
  return (
    <RouteGuard>
      <div className="flex h-screen bg-background">
        {/* Desktop Sidebar - Always Visible with Toggle */}
        <div className="hidden md:flex">
          <Sidebar 
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
        </div>

        {/* Mobile Sidebar */}
        <div className="md:hidden">
          <MobileHeader />
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Page Content - Full Height with Independent Scroll */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </RouteGuard>
  )
}
