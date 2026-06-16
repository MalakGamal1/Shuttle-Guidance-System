'use client'

import React from "react"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { reload, sendEmailVerification, signOut } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'

export default function VerifyPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [resendStatus, setResendStatus] = useState('')
  const [canResend, setCanResend] = useState(true)

  useEffect(() => {
    // Get email from localStorage
    const pendingEmail = localStorage.getItem('pendingEmail')
    const emailVerificationRequired = localStorage.getItem('emailVerificationRequired')

    if (!pendingEmail || !emailVerificationRequired) {
      router.push('/login')
    } else {
      setEmail(pendingEmail)
    }
    setIsChecking(false)
  }, [router])

  const handleCheckVerification = async () => {
    setError('')
    setIsLoading(true)

    try {
      if (!auth.currentUser) {
        setError('User not found. Please login again.')
        setIsLoading(false)
        return
      }

      await reload(auth.currentUser)

      if (auth.currentUser.emailVerified) {
        try {
          await updateDoc(doc(db, 'admins', auth.currentUser.uid), {
            emailVerified: true
          })
        } catch { /* ignore error on updating firestore */ }

        setIsVerified(true)
        setTimeout(() => {
          localStorage.removeItem('pendingEmail')
          localStorage.removeItem('emailVerificationRequired')
          router.push('/dashboard')
        }, 1500)
      } else {
        setError("Email not verified yet. Please check your inbox and click the verification link.")
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check verification status. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendEmail = async () => {
    setResendStatus('')
    try {
      const user = auth.currentUser
      if (user) {
        await sendEmailVerification(user)
        setResendStatus('Verification email sent!')
        setCanResend(false)
        // Cooldown for 60 seconds
        setTimeout(() => setCanResend(true), 60000)
      } else {
        setResendStatus('User not found. Try logging in again.')
      }
    } catch (err: any) {
      if (err.code === 'auth/too-many-requests') {
        setResendStatus('Too many requests. Please wait a bit.')
      } else {
        setResendStatus('Failed to send email.')
      }
    }
  }

  const handleBackToLogin = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Shuttle Admin</h1>
          </div>
          <p className="text-center text-muted-foreground">
            Campus Shuttle Management System
          </p>
        </div>

        {/* Verification Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Verify Your Email</CardTitle>
            <CardDescription>
              Verification email sent to {email}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isVerified ? (
              <div className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4 rounded-lg border border-border/50 p-4 bg-muted/30">
                  <p className="text-sm text-foreground">
                    A verification link has been sent to your email address.
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Check your email inbox</li>
                    <li>Click the verification link</li>
                    <li>Return here and click &quot;Verify&quot; below</li>
                  </ol>
                </div>

                <Button
                  onClick={handleCheckVerification}
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isLoading ? 'Checking...' : 'I\'ve Verified My Email'}
                </Button>

                <div className="text-center">
                  <Button
                    variant="link"
                    onClick={handleResendEmail}
                    disabled={!canResend}
                    className="text-sm text-primary"
                  >
                    Resend Verification Email
                  </Button>
                  {resendStatus && (
                    <p className="text-xs text-muted-foreground mt-1">{resendStatus}</p>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <button onClick={handleBackToLogin} className="text-center w-full block text-sm text-primary hover:underline">
                    Back to Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Email Verified</p>
                  <p className="text-sm text-muted-foreground">
                    Your account has been successfully verified. Redirecting to dashboard...
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  )
}
