'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Mail, Phone, Calendar, AlertCircle, Lock, Shield, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { sendPasswordResetEmail, multiFactor } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { PhoneEnrollment } from '@/components/auth/phone-enrollment'

export default function ProfilePage() {
  const { profile, loading, user } = useAuth()
  const [isSending, setIsSending] = useState(false)
  const [isUnenrolling, setIsUnenrolling] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [enrolledPhone, setEnrolledPhone] = useState('')
  const [show2FAModal, setShow2FAModal] = useState(false)
  const [firestorePhone, setFirestorePhone] = useState('')

  // Check 2FA enrollment status
  useEffect(() => {
    if (!user) return
    const factors = multiFactor(user).enrolledFactors
    setTwoFAEnabled(factors.length > 0)
    // Extract phone display from enrolled factor
    const phoneFactor = factors.find((f) => f.factorId === 'phone')
    if (phoneFactor) {
      setEnrolledPhone((phoneFactor as any).phoneNumber ?? '')
    }
  }, [user, show2FAModal])

  // Fetch phone from Firestore to pre-fill enrollment form
  useEffect(() => {
    if (!user) return
    const fetchPhone = async () => {
      try {
        const snap = await getDoc(doc(db, 'admins', user.uid))
        if (snap.exists()) setFirestorePhone(snap.data()?.phone ?? '')
      } catch { /* ignore */ }
    }
    fetchPhone()
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  if (!profile || !user) {
    return (
      <div className="space-y-8 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Unable to load profile. Please try again.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const handlePasswordReset = async () => {
    try {
      setIsSending(true)
      await sendPasswordResetEmail(auth, user.email || '')
      setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' })
      setTimeout(() => setMessage(null), 5000)
    } catch {
      setMessage({ type: 'error', text: 'Failed to send password reset email.' })
    } finally {
      setIsSending(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication?')) return
    try {
      setIsUnenrolling(true)
      const factors = multiFactor(user).enrolledFactors
      if (factors.length > 0) {
        await multiFactor(user).unenroll(factors[0])
        setTwoFAEnabled(false)
        setEnrolledPhone('')
        setMessage({ type: 'success', text: 'Two-Factor Authentication has been disabled.' })
        setTimeout(() => setMessage(null), 5000)
      }
    } catch (err: any) {
      let msg = 'Failed to disable 2FA.'
      if (err.code === 'auth/requires-recent-login')
        msg = 'Please log out and log back in before disabling 2FA.'
      setMessage({ type: 'error', text: msg })
    } finally {
      setIsUnenrolling(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return 'N/A'
    }
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground">View and manage your account information</p>
      </div>

      {/* Alert Messages */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Profile Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar — Read Only */}
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 bg-primary">
              <AvatarImage src={profile.photoURL || profile.avatar || undefined} alt={profile.fullName} />
              <AvatarFallback className="text-lg font-bold text-primary-foreground">
                {profile.fullName.split(' ').map((n) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-foreground">{profile.fullName}</p>
              <p className="text-sm text-muted-foreground capitalize">{profile.role}</p>
              {twoFAEnabled && (
                <span className="inline-flex items-center gap-1 mt-1 text-xs text-green-600 font-medium">
                  <Shield className="h-3 w-3" /> 2FA Enabled
                </span>
              )}
            </div>
          </div>

          {/* Personal Information */}
          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="font-semibold text-foreground">Personal Information</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <User className="h-4 w-4" /> Full Name
                </Label>
                <p className="text-foreground font-medium">{profile.fullName}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email Address
                </Label>
                <p className="text-foreground font-medium">{profile.email}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Phone Number
                </Label>
                <p className="text-foreground font-medium">
                  {profile.phone && profile.phone.trim() ? profile.phone : 'Not provided'}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Join Date
                </Label>
                <p className="text-foreground font-medium">{formatDate(profile.createdAt)}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Role
                </Label>
                <p className="text-foreground font-medium capitalize">{profile.role}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Settings Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Account Settings</CardTitle>
          <CardDescription>Manage your account security and preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Two-Factor Authentication */}
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Two-Factor Authentication (2FA)
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Status:{' '}
                  <span className={twoFAEnabled ? 'text-green-600 font-semibold' : 'text-yellow-600 font-semibold'}>
                    {twoFAEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </p>
                {twoFAEnabled && enrolledPhone && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Enrolled phone: <span className="font-medium text-foreground">{enrolledPhone}</span>
                  </p>
                )}
                {!twoFAEnabled && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Protect your account with SMS verification on every login.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-border hover:bg-sidebar-accent bg-transparent shrink-0"
                onClick={twoFAEnabled ? handleDisable2FA : () => setShow2FAModal(true)}
                disabled={isUnenrolling}
              >
                {isUnenrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {twoFAEnabled ? 'Disable 2FA' : 'Enable 2FA'}
              </Button>
            </div>
          </div>

          {/* Change Password */}
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-foreground flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Change Password
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  A reset link will be sent to your email address.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-border hover:bg-sidebar-accent bg-transparent shrink-0"
                onClick={handlePasswordReset}
                disabled={isSending}
              >
                {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isSending ? 'Sending…' : 'Reset Password'}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── 2FA Enrollment Modal ── */}
      {show2FAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-sm mx-4 border-border bg-card shadow-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-foreground text-base">Enable Two-Factor Auth</CardTitle>
                  <CardDescription>Secure your account with SMS codes</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PhoneEnrollment
                user={user}
                defaultPhone={firestorePhone}
                onEnrolled={(phone) => {
                  setTwoFAEnabled(true)
                  setEnrolledPhone(phone)
                  setShow2FAModal(false)
                  setMessage({ type: 'success', text: 'Two-Factor Authentication enabled successfully!' })
                  setTimeout(() => setMessage(null), 6000)
                }}
                onCancel={() => setShow2FAModal(false)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
