'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  getMultiFactorResolver,
  MultiFactorResolver,
  reload,
  User,
  signOut,
} from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { MFAChallenge } from '@/components/auth/mfa-challenge'

const faqs = [
  {
    id: 1,
    question: 'How do I add a new route to the system?',
    answer:
      'To add a new route, navigate to Route Management and click the "Create Route" button. Fill in the route details including starting point, ending point, and number of stops. You can then assign buses to the route and set the schedule.',
  },
  {
    id: 2,
    question: 'Can I schedule multiple trips for the same route in a day?',
    answer:
      'Yes, absolutely! You can schedule multiple trips per route. Go to Schedule Management, select your route, and add multiple departure times for each day of the week.',
  },
  {
    id: 3,
    question: 'How do I track real-time bus locations?',
    answer:
      'Enable GPS tracking for your buses through the Bus Management page. Once enabled, you can view real-time locations, speed, and route adherence from the main dashboard.',
  },
  {
    id: 4,
    question: 'What happens if a bus needs maintenance?',
    answer:
      'Mark the bus as "Maintenance" in Bus Management. The system will automatically reassign its trips to other available buses. You can update the maintenance status once the work is complete.',
  },
  {
    id: 5,
    question: 'How do I generate performance reports?',
    answer:
      'Go to Reports & Analytics and select your desired date range. Choose from various report types including monthly performance, fleet maintenance, revenue analysis, and safety incidents.',
  },
]

const supportChannels = [
  {
    title: 'Email Support',
    description: 'Send us an email',
    contact: 'malakgamal485@gmail.com',
    hours: 'Response within 24 hours',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    title: 'Phone Support',
    description: 'Call our support team',
    contact: '+20 1212192694',
    hours: 'Mon-Fri, 9 AM - 5 PM',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [suspendedEmails, setSuspendedEmails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)

  // MFA challenge state
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null)

  React.useEffect(() => {
    const isSuspended = localStorage.getItem('suspended_logout') === 'true'
    if (isSuspended) {
      const storedEmails = localStorage.getItem('suspended_root_emails')
      let emails: string[] = []
      if (storedEmails) {
        try {
          emails = JSON.parse(storedEmails)
        } catch {}
      }
      setError('You are suspended. Please connect with a Root Admin.')
      setSuspendedEmails(emails)
      // Clean up
      localStorage.removeItem('suspended_logout')
      localStorage.removeItem('suspended_root_emails')
    }
  }, [])

  // After successful sign-in, decide whether to go to /dashboard or /verify.
  const proceedToDashboard = async (freshUser: User) => {
    // Step 1: reload to get fresh Firebase Auth state
    try { await reload(freshUser) } catch { /* non-fatal */ }

    console.log('1. Firebase emailVerified:', freshUser.emailVerified);

    try {
      // Step 2: Check Firestore admins/{uid}
      const adminDoc = await getDoc(doc(db, 'admins', freshUser.uid));
      console.log('2. Firestore data:', adminDoc.data());
      console.log('3. Firestore emailVerified:', adminDoc.data()?.emailVerified);

      if (!adminDoc.exists()) {
        setError('Account not found');
        setIsLoading(false);
        return;
      }

      const adminData = adminDoc.data();

      // Check if suspended
      if (adminData?.suspended === true) {
        let rootEmails: string[] = []
        try {
          const adminsSnap = await getDocs(collection(db, 'admins'))
          adminsSnap.forEach((docSnap) => {
            const d = docSnap.data()
            if (d.role === 'root' && d.email) {
              rootEmails.push(d.email)
            }
          })
        } catch (err) {
          console.error('Failed to fetch root emails on manual login:', err)
        }

        // Log out immediately
        await signOut(auth)

        setError('You are suspended. Please connect with a Root Admin.')
        setSuspendedEmails(rootEmails)
        setIsLoading(false)
        return
      }

      // Step 3: Fast path - already verified in Firestore
      if (adminData?.emailVerified === true) {
        console.log('4. Redirecting to /dashboard (Firestore verified)');
        router.push('/dashboard');
        return;
      }
    } catch (err) {
      console.error('Error fetching admin doc:', err);
    }

    // Step 4: Check Firebase Auth emailVerified
    if (freshUser.emailVerified) {
      // Update Firestore and redirect
      try {
        await updateDoc(doc(db, 'admins', freshUser.uid), {
          emailVerified: true,
          updatedAt: new Date()
        });
      } catch { /* non-fatal */ }
      router.push('/dashboard');
      return;
    }

    // Step 5: Not verified → send email and redirect to /verify
    try { await sendEmailVerification(freshUser) } catch { /* already sent / rate-limited */ }
    localStorage.setItem('pendingEmail', freshUser.email ?? email);
    localStorage.setItem('emailVerificationRequired', 'true');
    router.push('/verify');
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuspendedEmails([])
    setIsLoading(true)

    try {
      if (!email || !password) {
        setError('Please enter both email and password')
        setIsLoading(false)
        return
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      // No MFA enrolled — proceed normally (pass the fresh user object directly)
      await proceedToDashboard(userCredential.user)
    } catch (err: any) {
      if (err.code === 'auth/multi-factor-auth-required') {
        // User has MFA enrolled — show the challenge modal
        const resolver = getMultiFactorResolver(auth, err)
        setMfaResolver(resolver)
        setIsLoading(false)
        return
      }

      let errorMessage = 'Login failed. Please try again.'
      if (err.code === 'auth/user-not-found') errorMessage = 'No account found with this email address.'
      else if (err.code === 'auth/wrong-password') errorMessage = 'Incorrect password. Please try again.'
      else if (err.code === 'auth/invalid-email') errorMessage = 'Please enter a valid email address.'
      else if (err.code === 'auth/too-many-requests') errorMessage = 'Too many login attempts. Please try again later.'
      else if (err.code === 'auth/invalid-credential') errorMessage = 'Invalid email or password. Please try again.'

      setError(errorMessage)
      setIsLoading(false)
    }
  }

  // Called when MFA challenge is successfully resolved
  const handleMFASuccess = async () => {
    const currentUser = auth.currentUser
    if (currentUser) {
      await proceedToDashboard(currentUser)  // currentUser is fresh after MFA
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="https://uspmtthirtlemqfznyyl.supabase.co/storage/v1/object/public/avatars/u-removebg-preview.png"
            alt="UniGo Logo"
            width={120}
            height={120}
            className="mb-6 object-contain"
          />
          <h1 className="text-3xl font-bold text-foreground mb-2">UniGo Admin</h1>
          <p className="text-center text-muted-foreground">Shuttle Management System</p>
        </div>

        {/* Login Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <AlertDescription>
                    <div>{error}</div>
                    {suspendedEmails.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-destructive/20 text-xs space-y-1">
                        <span className="font-semibold block">Root Admin Emails:</span>
                        <ul className="list-disc list-inside">
                          {suspendedEmails.map((email) => (
                            <li key={email} className="font-mono">{email}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email Address</Label>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="bg-input text-foreground placeholder:text-muted-foreground pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                    style={{ WebkitTextSecurity: showPassword ? 'none' : undefined } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isLoading ? 'Logging in…' : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help?{' '}
          <button
            onClick={() => setShowHelpModal(true)}
            className="text-primary hover:underline font-medium"
          >
            Contact Support
          </button>
        </p>
      </div>

      {/* ── MFA Challenge Modal ── */}
      {mfaResolver && (
        <MFAChallenge
          resolver={mfaResolver}
          onSuccess={handleMFASuccess}
          onCancel={() => {
            setMfaResolver(null)
            setError('Sign-in cancelled. Please try again.')
          }}
        />
      )}

      {/* ── Help Modal ── */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-[59] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowHelpModal(false)}
        >
          {/* Modal box — stops click propagation so backdrop click closes but inner clicks don't */}
          <div
            className="relative z-[60] w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed header — never scrolls */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-bold text-foreground">Help &amp; Support</h2>
                <p className="text-sm text-muted-foreground">Find answers and get support</p>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="rounded-full p-2 hover:bg-sidebar-accent transition-colors"
              >
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            {/* Scrollable content — always starts at the top */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Support Channels */}
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">Contact Support</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {supportChannels.map((channel) => (
                    <div
                      key={channel.title}
                      className={`p-4 border border-border rounded-lg ${channel.bg} hover:opacity-80 transition-opacity`}
                    >
                      <p className={`font-semibold ${channel.color}`}>{channel.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
                      <p className="text-sm font-medium text-foreground mt-2">{channel.contact}</p>
                      <p className="text-xs text-muted-foreground mt-1">{channel.hours}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQs */}
              <div>
                <h3 className="text-base font-semibold text-foreground mb-3">Frequently Asked Questions</h3>
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((faq) => (
                    <AccordionItem key={faq.id} value={faq.id.toString()} className="border-b border-border/50">
                      <AccordionTrigger className="hover:no-underline hover:bg-sidebar-accent px-4 py-3 rounded-lg transition-colors">
                        <span className="text-left font-medium text-foreground">{faq.question}</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 py-3 text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}