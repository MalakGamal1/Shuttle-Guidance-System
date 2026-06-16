'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
    MultiFactorResolver,
    PhoneAuthProvider,
    PhoneMultiFactorGenerator,
    RecaptchaVerifier,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Loader2, AlertCircle, MessageSquare, ExternalLink } from 'lucide-react'

interface MFAChallengeProps {
    resolver: MultiFactorResolver
    onSuccess: () => void
    onCancel: () => void
}

/** Safely clear a RecaptchaVerifier instance AND wipe its DOM container. */
function destroyRecaptcha(ref: React.MutableRefObject<RecaptchaVerifier | null>, containerId: string) {
    try { ref.current?.clear() } catch { /* ignore */ }
    ref.current = null
    // Wipe the DOM node so reCAPTCHA can render fresh
    const el = document.getElementById(containerId)
    if (el) el.innerHTML = ''
}

export function MFAChallenge({ resolver, onSuccess, onCancel }: MFAChallengeProps) {
    const CONTAINER_ID = 'mfa-recaptcha-container'

    const [otpCode, setOtpCode] = useState('')
    const [verificationId, setVerificationId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSendingOtp, setIsSendingOtp] = useState(false)
    const [error, setError] = useState('')
    const [codeSent, setCodeSent] = useState(false)
    const [canResend, setCanResend] = useState(false)
    const [countdown, setCountdown] = useState(0)
    const [billingError, setBillingError] = useState(false)
    const recaptchaRef = useRef<RecaptchaVerifier | null>(null)
    // Prevent double-init in React StrictMode
    const sendingRef = useRef(false)

    const phoneHint = resolver.hints.find((h) => h.factorId === PhoneMultiFactorGenerator.FACTOR_ID)
    const phoneDisplay = (phoneHint as any)?.phoneNumber ?? 'your registered phone'

    // Cleanup on unmount
    useEffect(() => {
        return () => destroyRecaptcha(recaptchaRef, CONTAINER_ID)
    }, [])

    // Countdown
    useEffect(() => {
        if (countdown <= 0) return
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
        return () => clearTimeout(t)
    }, [countdown])

    useEffect(() => {
        if (countdown === 0 && codeSent) setCanResend(true)
    }, [countdown, codeSent])

    const initRecaptcha = useCallback(() => {
        destroyRecaptcha(recaptchaRef, CONTAINER_ID)
        recaptchaRef.current = new RecaptchaVerifier(auth, CONTAINER_ID, { size: 'invisible' })
    }, [])

    const sendOTP = useCallback(async () => {
        if (sendingRef.current) return          // guard against StrictMode double-call
        sendingRef.current = true
        setError('')
        setBillingError(false)
        setIsSendingOtp(true)
        try {
            initRecaptcha()
            const phoneInfoOptions = {
                multiFactorHint: resolver.hints[0],
                session: resolver.session,
            }
            const phoneAuthProvider = new PhoneAuthProvider(auth)
            const id = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaRef.current!)
            setVerificationId(id)
            setCodeSent(true)
            setCanResend(false)
            setCountdown(60)
        } catch (err: any) {
            console.error('[MFAChallenge] sendOTP:', err)
            if (err.code === 'auth/billing-not-enabled') {
                setBillingError(true)
                setError('Firebase billing is not enabled. SMS MFA requires the Blaze plan.')
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please wait before retrying.')
            } else if (err.code === 'auth/network-request-failed') {
                setError('Network error. Check your connection.')
            } else {
                setError('Failed to send verification code. Please try again.')
            }
        } finally {
            setIsSendingOtp(false)
            sendingRef.current = false
        }
    }, [resolver, initRecaptcha])

    // Auto-send OTP once on mount
    useEffect(() => {
        sendOTP()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleVerify = async () => {
        if (!verificationId) { setError('Please wait for the code to be sent.'); return }
        if (otpCode.length < 6) { setError('Please enter the 6-digit code.'); return }
        setError('')
        setIsLoading(true)
        try {
            const credential = PhoneAuthProvider.credential(verificationId, otpCode.trim())
            const assertion = PhoneMultiFactorGenerator.assertion(credential)
            await resolver.resolveSignIn(assertion)
            onSuccess()
        } catch (err: any) {
            console.error('[MFAChallenge] verify:', err)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {/* Invisible reCAPTCHA anchor — MUST exist in DOM before RecaptchaVerifier is created */}
            <div id={CONTAINER_ID} />

            <Card className="w-full max-w-sm mx-4 border-border bg-card shadow-2xl">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-foreground">Two-Factor Authentication</CardTitle>
                    <CardDescription>
                        {codeSent
                            ? `Enter the code sent to ${phoneDisplay}`
                            : 'Sending verification code…'}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
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

                    {!codeSent && isSendingOtp && (
                        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Sending SMS code…</span>
                        </div>
                    )}

                    {codeSent && (
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
                                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                />
                            </div>
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={sendOTP}
                                    disabled={!canResend || isSendingOtp}
                                    className="text-sm text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isSendingOtp ? 'Sending…' : canResend ? 'Resend Code' : `Resend in ${countdown}s`}
                                </button>
                            </div>
                        </>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1 border-border hover:bg-sidebar-accent bg-transparent"
                            onClick={onCancel}
                            disabled={isLoading || isSendingOtp}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={handleVerify}
                            disabled={!codeSent || isLoading || otpCode.length < 6}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                        </Button>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                        <MessageSquare className="inline h-3 w-3 mr-1" />
                        Code sent via SMS to your enrolled phone number
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
