import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/context/auth-context'
import { RootLayoutClient } from './layout-client'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Shuttle Admin - Campus Shuttle Management',
  description: 'Campus Shuttle Management System',
  icons: {
    icon: 'https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/u-removebg-preview.png',
  },
}

import { Toaster } from '@/components/ui/toaster'

// ... imports

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <RootLayoutClient>
              {children}
            </RootLayoutClient>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
