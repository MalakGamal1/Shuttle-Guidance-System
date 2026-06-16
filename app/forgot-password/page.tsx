'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Zap, AlertCircle, CheckCircle, Mail } from 'lucide-react'

// Firebase imports
import { getAuth, sendPasswordResetEmail } from 'firebase/auth'
import  app  from '@/lib/firebase' 

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const auth = getAuth(app)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!email) {
      setError('Please enter your email address')
      setIsLoading(false)
      return
    }

    try {
      await sendPasswordResetEmail(auth, email)
      setIsSubmitted(true)
    } catch (err: any) {
      // Firebase error handling
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email')
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else {
        setError('Failed to send reset link. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">UniGo Admin</h1>
          </div>
          <p className="text-center text-muted-foreground">
             Shuttle Management System
          </p>
        </div>

        {/* Reset Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="bg-input text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>

                <div className="text-center text-sm">
                  <Link href="/login" className="text-primary hover:underline">
                    Back to Login
                  </Link>
                </div>
              </form>
            ) : (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Reset Link Sent</p>
                  <p className="text-sm text-muted-foreground">
                    We've sent a password reset link to <span className="font-medium">{email}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Check your inbox and follow the instructions to reset your password.
                  </p>
                </div>

                <Alert className="border-border bg-sidebar-accent/50">
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    If you don't see the email, check your spam folder or request a new link.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-border hover:bg-sidebar-accent bg-transparent"
                    onClick={() => {
                      setEmail('')
                      setIsSubmitted(false)
                      setError('')
                    }}
                  >
                    Send Another
                  </Button>
                  <Link href="/login" className="flex-1">
                    <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help?{' '}
          <Link href="/help" className="text-primary hover:underline">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  )
}
