'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth'
import { db, getSecondaryAuth } from '@/lib/firebase'
import { getDefaultAvatarUrl } from '@/lib/assets'
import { doc, setDoc } from 'firebase/firestore'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match')
        setIsLoading(false)
        return
      }

      if (!formData.name || !formData.email || !formData.password) {
        setError('Please fill in all fields')
        setIsLoading(false)
        return
      }

      // Create account using secondary auth so we never switch the current session.
      const secondaryAuth = getSecondaryAuth()
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password)
      
      // Store user profile in Firestore
      await setDoc(doc(db, 'admins', userCredential.user.uid), {
        fullName: formData.name,
        email: formData.email,
        phone: '',
        role: 'admin',
        createdAt: new Date().toISOString(),
        status: 'active',
        avatar: getDefaultAvatarUrl(),
        photoURL: getDefaultAvatarUrl(),
      })

      // Send email verification
      await sendEmailVerification(userCredential.user)

      // Sign out the secondary session only (do NOT affect current admin session).
      await signOut(secondaryAuth)

      // Show success state
      setIsSuccess(true)
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err: any) {
      let errorMessage = 'Registration failed. Please try again.'
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Email already in use. Please use a different email.'
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password too weak. Use at least 6 characters.'
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.'
      }
      
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
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

          {/* Success Card */}
          <Card className="border-border bg-card">
            <CardContent className="pt-8">
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle className="h-12 w-12 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-foreground text-lg">Account Created Successfully</p>
                  <p className="text-sm text-muted-foreground">
                    A verification email has been sent to <span className="font-medium text-foreground">{formData.email}</span>
                  </p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Next steps:</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Check your email inbox</li>
                    <li>Click the verification link</li>
                    <li>Return here and login</li>
                  </ol>
                </div>
                <p className="text-xs text-muted-foreground">
                  Redirecting to login in a moment...
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Go to Login
            </Link>
          </p>
        </div>
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
            Create your admin account
          </p>
        </div>

        {/* Register Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
            <CardDescription>
              Register as an administrator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">
                  Full Name
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-input text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@university.edu"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-input text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-input text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-input text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Login here
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
