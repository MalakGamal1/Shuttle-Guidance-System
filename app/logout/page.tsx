'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { LogOut, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    // Sign out from Firebase
    signOut(auth).catch((error) => {
      console.error('Error signing out:', error)
    })

    // Redirect to login after 2 seconds
    const timeout = setTimeout(() => {
      router.replace('/login')
    }, 2000)

    return () => clearTimeout(timeout)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card className="border-border bg-card py-8 px-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-primary/20 p-4">
              <LogOut className="h-8 w-8 text-primary" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Logged Out</h1>

          <p className="text-muted-foreground mb-6">
            You have been successfully logged out. You will be redirected to the login page shortly.
          </p>

          <div className="space-y-3">
            <Button
              asChild
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/login">
                Return to Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="w-full border-border hover:bg-sidebar-accent bg-transparent"
            >
              <Link href="/help">Need Help?</Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
