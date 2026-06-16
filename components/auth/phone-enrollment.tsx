'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
    PhoneAuthProvider,
    PhoneMultiFactorGenerator,
    RecaptchaVerifier,
    multiFactor,
    User,
} from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'

interface PhoneEnrollmentProps {
    user: User
    defaultPhone?: string
    onEnrolled: (phoneNumber: string) => void
    onCancel: () => void
}

type Step = 'phone' | 'code' | 'done'

/** Safely destroy a RecaptchaVerifier and wipe the DOM container. */
function destroyRecaptcha(ref: React.MutableRefObject<RecaptchaVerifier | null>, containerId: string) {
    try { ref.current?.clear() } catch { /* ignore */ }
    ref.current = null
    const el = document.getElementById(containerId)
    if (el) el.innerHTML = ''
}

export function PhoneEnrollment({ user, defaultPhone = '', onEnrolled, onCancel }: PhoneEnrollmentProps) {
    const CONTAINER_ID = 'phone-enrollment-recaptcha'

    const [step, setStep] = useState<Step>('phone')
    const [phoneNumber, setPhoneNumber] = useState(defaultPhone)
    const [otpCode, setOtpCode] = useState('')
    const [verificationId, setVerificationId] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [canResend, setCanResend] = useState(false)
    const [countdown, setCountdown] = useState(0)
    const [error, setError] = useState('')
    const [billingError, setBillingError] = useState(false)
    const recaptchaRef = useRef<RecaptchaVerifier | null>(null)
    // Guard against StrictMode double-fire
    const sendingRef = useRef(false)

    useEffect(() => {
        if (defaultPhone && !phoneNumber) setPhoneNumber(defaultPhone)
    }, [defaultPhone]) // eslint-disable-line

    // Countdown timer
    useEffect(() => {
        if (countdown <= 0) return
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
        return () => clearTimeout(t)
    }, [countdown])

    useEffect(() => {
        if (countdown === 0 && step === 'code') setCanResend(true)
    }, [countdown, step])

    // Cleanup on unmount
    useEffect(() => {
        return () => destroyRecaptcha(recaptchaRef, CONTAINER_ID)
    }, [])

    const initRecaptcha = useCallback(() => {
        destroyRecaptcha(recaptchaRef, CONTAINER_ID)
        recaptchaRef.current = new RecaptchaVerifier(auth, CONTAINER_ID, { size: 'invisible' })
    }, [])

    const handleSendCode = useCallback(async () => {
        if (sendingRef.current) return
        const phone = phoneNumber.trim()
        if (!phone) { setError('Please enter a phone number.'); return }
        if (!/^\+/.test(phone)) { setError('Use international format, e.g. +201234567890'); return }

        sendingRef.current = true
        setError('')
        setBillingError(false)
        setIsLoading(true)
        try {
            initRecaptcha()
            const session = await multiFactor(user).getSession()
            const phoneAuthProvider = new PhoneAuthProvider(auth)
            const id = await phoneAuthProvider.verifyPhoneNumber(
                { phoneNumber: phone, session },
                recaptchaRef.current!
            )
            setVerificationId(id)
            setStep('code')
            setOtpCode('')
            setCanResend(false)
            setCountdown(60)
        } catch (err: any) {
            console.error('[PhoneEnrollment] sendCode:', err)
            if (err.code === 'auth/billing-not-enabled') {
                setBillingError(true)
                setError('Firebase billing is not enabled. SMS MFA requires upgrading to the Blaze plan.')
            } else if (err.code === 'auth/invalid-phone-number') {
                setError('Invalid phone number. Use international format: +201234567890')
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many requests. Please wait a moment.')
            } else if (err.code === 'auth/requires-recent-login') {
                setError('Security check: please log out and log back in before enabling 2FA.')
            } else if (err.code === 'auth/network-request-failed') {
                setError('Network error. Check your connection.')
            } else {
                setError('Failed to send verification code. Please try again.')
            }
        } finally {
            setIsLoading(false)
            sendingRef.current = false
        }
    }, [phoneNumber, user, initRecaptcha])

    const handleResend = async () => {
        setOtpCode('')
        setCanResend(false)
        await handleSendCode()
    }

    const handleVerifyCode = async () => {
        if (!otpCode.trim() || otpCode.length < 6) {
            setError('Please enter the 6-digit verification code.')
            return
        }
        setError('')
        setIsLoading(true)
        try {
            const credential = PhoneAuthProvider.credential(verificationId, otpCode.trim())
            const assertion = PhoneMultiFactorGenerator.assertion(credential)
            await multiFactor(user).enroll(assertion, 'Phone 2FA')

            try {
                await updateDoc(doc(db, 'admins', user.uid), {
                    phone: phoneNumber.trim(),
                    updatedAt: serverTimestamp(),
                })
            } catch { /* non-fatal */ }

            setStep('done')
            setTimeout(() => onEnrolled(phoneNumber.trim()), 1500)
        } catch (err: any) {
            console.error('[PhoneEnrollment] verifyCode:', err)
            let msg = 'Verification failed. Please try again.'
            if (err.code === 'auth/invalid-verification-code') msg = 'Invalid code. Please check and retry.'
            if (err.code === 'auth/code-expired') msg = 'Code expired. Please request a new one.'
            if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please wait.'
            setError(msg)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Invisible reCAPTCHA anchor — must be in DOM before RecaptchaVerifier init */}
            <div id={CONTAINER_ID} />

            {/* ✅ Error INSIDE modal, at the top */}
            {error && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                    {billingError && (
                        <a
                            href="https://console.firebase.google.com/project/_/usage/details"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 mt-2 underline text-xs"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Upgrade Firebase plan
                        </a>
                    )}
                </div>
            )}

            {step === 'done' && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <p className="font-medium text-foreground text-center">2FA Enabled Successfully!</p>
                    <p className="text-sm text-muted-foreground text-center">
                        Your account is now protected with SMS verification.
                    </p>
                </div>
            )}

            {step === 'phone' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-foreground">Phone Number</Label>
                        <Input
                            type="tel"
                            placeholder="+201234567890"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="bg-input text-foreground"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                        />
                        <p className="text-xs text-muted-foreground">
                            International format required, e.g. +201234567890
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="flex-1 border-border hover:bg-sidebar-accent bg-transparent"
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handleSendCode}
                            disabled={isLoading}
                        >
                            {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send Code'}
                        </Button>
                    </div>
                </>
            )}

            {step === 'code' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-foreground">Verification Code</Label>
                        <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="123456"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="bg-input text-foreground text-center text-xl tracking-widest font-mono"
                            maxLength={6}
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                        />
                        <p className="text-xs text-muted-foreground">
                            Code sent to <span className="font-medium text-foreground">{phoneNumber}</span>
                        </p>
                    </div>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={!canResend || isLoading}
                            className="text-sm text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Processing…' : canResend ? 'Resend Code' : `Resend in ${countdown}s`}
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="flex-1 border-border hover:bg-sidebar-accent bg-transparent"
                            onClick={() => { setStep('phone'); setOtpCode('') }}
                            disabled={isLoading}
                        >
                            Back
                        </Button>
                        <Button
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handleVerifyCode}
                            disabled={isLoading || otpCode.length < 6}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}
