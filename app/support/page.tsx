'use client'

import { useState, useEffect, useRef } from 'react'
import emailjs from '@emailjs/browser'
import {
    collection, addDoc, doc, setDoc, getDoc, onSnapshot,
    query, orderBy, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Send, Clock, User, Mail, MessageSquare, AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

/* ═══════════════════ Helpers ═══════════════════ */

function isBusinessHours(): boolean {
    const now = new Date()
    const day = now.getDay() // 0=Sun, 6=Sat
    const hour = now.getHours()
    return day >= 1 && day <= 5 && hour >= 10 && hour < 18
}

function formatTime(ts: any): string {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: any): string {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(ts: any): string {
    if (!ts) return '—'
    return `${formatDate(ts)}, ${formatTime(ts)}`
}

/* ═══════════════════ Types ═══════════════════ */

interface ChatMessage {
    id: string
    senderId: string
    senderName: string
    senderRole: 'admin' | 'root'
    message: string
    timestamp: any
    read: boolean
    sentByEmail?: boolean
}

interface ChatThread {
    adminUid: string
    adminName: string
    adminEmail: string
    lastMessage: string
    lastMessageAt: any
    unreadByRoot: number
    unreadByAdmin: number
}

/* ═══════════════════ Component ═══════════════════ */

export default function SupportPage() {
    const { user, profile, role } = useAuth()

    if (role === 'root') return <RootAdminView />
    return <AdminView />
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ADMIN VIEW — single chat with root admin
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AdminView() {
    const { user, profile } = useAuth()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [newMsg, setNewMsg] = useState('')
    const [sending, setSending] = useState(false)
    const [online, setOnline] = useState(isBusinessHours())
    const scrollRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()

    const chatId = user?.uid || ''
    const senderName = profile?.fullName || user?.displayName || 'Admin'
    const senderEmail = profile?.email || user?.email || ''

    // Update business hours every minute
    useEffect(() => {
        const interval = setInterval(() => setOnline(isBusinessHours()), 60_000)
        return () => clearInterval(interval)
    }, [])

    // Ensure chat thread doc exists
    useEffect(() => {
        if (!chatId) return
        const threadRef = doc(db, 'support_chats', chatId)
        getDoc(threadRef).then((snap) => {
            if (!snap.exists()) {
                setDoc(threadRef, {
                    adminUid: chatId,
                    adminName: senderName,
                    adminEmail: senderEmail,
                    lastMessage: '',
                    lastMessageAt: serverTimestamp(),
                    unreadByRoot: 0,
                    unreadByAdmin: 0,
                })
            }
        })
    }, [chatId, senderName, senderEmail])

    // Real-time messages listener
    useEffect(() => {
        if (!chatId) return
        const q = query(
            collection(db, 'support_chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        )
        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)))
            // Mark unread messages from root as read
            snap.docs.forEach((d) => {
                const data = d.data()
                if (data.senderRole === 'root' && !data.read) {
                    updateDoc(d.ref, { read: true })
                }
            })
            // Reset unread counter for admin
            updateDoc(doc(db, 'support_chats', chatId), { unreadByAdmin: 0 }).catch(() => { })
        })
        return () => unsub()
    }, [chatId])

    // Auto-scroll on new messages
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend() {
        if (!newMsg.trim() || !chatId) return
        setSending(true)
        const text = newMsg.trim()
        setNewMsg('')

        try {
            const isOnline = isBusinessHours()
            const msgData = {
                senderId: chatId,
                senderName,
                senderRole: 'admin' as const,
                message: text,
                timestamp: serverTimestamp(),
                read: false,
                sentByEmail: !isOnline,
            }

            // Save to Firestore
            await addDoc(collection(db, 'support_chats', chatId, 'messages'), msgData)
            await updateDoc(doc(db, 'support_chats', chatId), {
                lastMessage: text,
                lastMessageAt: serverTimestamp(),
                unreadByRoot: (messages.filter((m) => m.senderRole === 'admin' && !m.read).length || 0) + 1,
                adminName: senderName,
                adminEmail: senderEmail,
            })

            // If outside business hours → also send via EmailJS
            if (!isOnline) {
                const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID
                const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
                const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
                if (serviceId && templateId && publicKey) {
                    try {
                        await emailjs.send(serviceId, templateId, {
                            from_name: senderName,
                            from_email: senderEmail,
                            subject: `Support message from ${senderName}`,
                            message: text,
                        }, publicKey)
                    } catch (e) {
                        console.warn('EmailJS send failed (non-fatal):', e)
                    }
                }
                toast({ title: 'Message sent by email', description: 'We are offline. Your message was also emailed.' })
            }
        } catch (err: any) {
            console.error('Send error:', err)
            toast({ title: 'Error', description: 'Failed to send message.', variant: 'destructive' })
            setNewMsg(text) // restore the text
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] p-6">
            {/* Header */}
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-foreground">Support Chat</h1>
                <p className="text-sm text-muted-foreground">Chat with the root administrator</p>
            </div>

            {/* Offline banner */}
            {!online && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    We are currently offline. Your message will be sent by email.
                </div>
            )}

            {/* Chat area */}
            <Card className="flex-1 flex flex-col border-border bg-card overflow-hidden">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                        {messages.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <MessageSquare className="mx-auto h-10 w-10 opacity-50 mb-3" />
                                <p>No messages yet. Start a conversation!</p>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, i) => {
                                    const isMe = msg.senderRole === 'admin'
                                    const showDate = i === 0 || formatDate(msg.timestamp) !== formatDate(messages[i - 1]?.timestamp)
                                    return (
                                        <div key={msg.id}>
                                            {showDate && (
                                                <div className="text-center my-4">
                                                    <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                                        {formatDate(msg.timestamp)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[75%] ${isMe ? 'order-1' : ''}`}>
                                                    <div className={`rounded-2xl px-4 py-2.5 ${isMe
                                                            ? 'bg-primary text-primary-foreground rounded-br-md'
                                                            : 'bg-muted text-foreground rounded-bl-md'
                                                        }`}>
                                                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                                    </div>
                                                    <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : ''}`}>
                                                        <span className="text-[11px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                                                        {msg.sentByEmail && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                                                <Mail className="h-2.5 w-2.5 mr-0.5" /> email
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={scrollRef} />
                            </>
                        )}
                    </div>
                </ScrollArea>

                {/* Input */}
                <div className="border-t border-border p-3">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend() }}
                        className="flex items-center gap-2"
                    >
                        <Input
                            value={newMsg}
                            onChange={(e) => setNewMsg(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-background"
                            disabled={sending}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={sending || !newMsg.trim()}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </Card>
        </div>
    )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROOT ADMIN VIEW — inbox list + chat panel
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function RootAdminView() {
    const { user, profile } = useAuth()
    const [threads, setThreads] = useState<ChatThread[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [newMsg, setNewMsg] = useState('')
    const [sending, setSending] = useState(false)
    const [loadingThreads, setLoadingThreads] = useState(true)
    const scrollRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()

    const rootName = profile?.fullName || user?.displayName || 'Root Admin'

    // Listen to all chat threads
    useEffect(() => {
        const q = query(collection(db, 'support_chats'), orderBy('lastMessageAt', 'desc'))
        const unsub = onSnapshot(q, (snap) => {
            setThreads(snap.docs.map((d) => ({ ...d.data(), adminUid: d.id } as ChatThread)))
            setLoadingThreads(false)
        })
        return () => unsub()
    }, [])

    // Listen to selected chat messages
    useEffect(() => {
        if (!selectedId) { setMessages([]); return }
        const q = query(
            collection(db, 'support_chats', selectedId, 'messages'),
            orderBy('timestamp', 'asc')
        )
        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)))
            // Mark admin messages as read
            snap.docs.forEach((d) => {
                const data = d.data()
                if (data.senderRole === 'admin' && !data.read) {
                    updateDoc(d.ref, { read: true })
                }
            })
            // Reset unread counter for root
            updateDoc(doc(db, 'support_chats', selectedId), { unreadByRoot: 0 }).catch(() => { })
        })
        return () => unsub()
    }, [selectedId])

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend() {
        if (!newMsg.trim() || !selectedId) return
        setSending(true)
        const text = newMsg.trim()
        setNewMsg('')

        try {
            await addDoc(collection(db, 'support_chats', selectedId, 'messages'), {
                senderId: user?.uid || '',
                senderName: rootName,
                senderRole: 'root' as const,
                message: text,
                timestamp: serverTimestamp(),
                read: false,
                sentByEmail: false,
            })
            await updateDoc(doc(db, 'support_chats', selectedId), {
                lastMessage: text,
                lastMessageAt: serverTimestamp(),
                unreadByAdmin: (messages.filter((m) => m.senderRole === 'root' && !m.read).length || 0) + 1,
            })
        } catch (err: any) {
            console.error('Send error:', err)
            toast({ title: 'Error', description: 'Failed to send reply.', variant: 'destructive' })
            setNewMsg(text)
        } finally {
            setSending(false)
        }
    }

    const selectedThread = threads.find((t) => t.adminUid === selectedId)

    return (
        <div className="flex h-[calc(100vh-2rem)] p-6 gap-4">
            {/* ── Left: Thread list ── */}
            <div className="w-80 flex-shrink-0 flex flex-col">
                <div className="mb-4">
                    <h1 className="text-2xl font-bold text-foreground">Support Inbox</h1>
                    <p className="text-sm text-muted-foreground">
                        {threads.length} conversation{threads.length !== 1 ? 's' : ''}
                    </p>
                </div>

                <Card className="flex-1 border-border bg-card overflow-hidden">
                    <ScrollArea className="h-full">
                        {loadingThreads ? (
                            <div className="p-6 text-center text-muted-foreground">Loading...</div>
                        ) : threads.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                <MessageSquare className="mx-auto h-8 w-8 opacity-50 mb-2" />
                                <p className="text-sm">No conversations yet</p>
                            </div>
                        ) : (
                            threads.map((t) => (
                                <button
                                    key={t.adminUid}
                                    onClick={() => setSelectedId(t.adminUid)}
                                    className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-sidebar-accent ${selectedId === t.adminUid ? 'bg-sidebar-accent' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                            <User className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="font-medium text-foreground text-sm truncate">{t.adminName}</p>
                                                {t.unreadByRoot > 0 && (
                                                    <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 min-w-[20px] h-5 flex items-center justify-center">
                                                        {t.unreadByRoot}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">{t.lastMessage || 'No messages'}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(t.lastMessageAt)}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </ScrollArea>
                </Card>
            </div>

            {/* ── Right: Chat panel ── */}
            <div className="flex-1 flex flex-col">
                {!selectedId ? (
                    <Card className="flex-1 flex items-center justify-center border-border bg-card">
                        <div className="text-center text-muted-foreground">
                            <MessageSquare className="mx-auto h-12 w-12 opacity-50 mb-3" />
                            <p className="font-medium">Select a conversation</p>
                            <p className="text-sm">Choose an admin from the list to start chatting</p>
                        </div>
                    </Card>
                ) : (
                    <>
                        {/* Chat header */}
                        <div className="mb-3 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">{selectedThread?.adminName}</p>
                                <p className="text-xs text-muted-foreground">{selectedThread?.adminEmail}</p>
                            </div>
                        </div>

                        {/* Messages */}
                        <Card className="flex-1 flex flex-col border-border bg-card overflow-hidden">
                            <ScrollArea className="flex-1 p-4">
                                <div className="space-y-4">
                                    {messages.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <p>No messages in this conversation yet.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {messages.map((msg, i) => {
                                                const isMe = msg.senderRole === 'root'
                                                const showDate = i === 0 || formatDate(msg.timestamp) !== formatDate(messages[i - 1]?.timestamp)
                                                return (
                                                    <div key={msg.id}>
                                                        {showDate && (
                                                            <div className="text-center my-4">
                                                                <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                                                    {formatDate(msg.timestamp)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <div className={`max-w-[75%]`}>
                                                                <div className={`rounded-2xl px-4 py-2.5 ${isMe
                                                                        ? 'bg-primary text-primary-foreground rounded-br-md'
                                                                        : 'bg-muted text-foreground rounded-bl-md'
                                                                    }`}>
                                                                    {!isMe && (
                                                                        <p className="text-xs font-medium opacity-70 mb-0.5">{msg.senderName}</p>
                                                                    )}
                                                                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                                                </div>
                                                                <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : ''}`}>
                                                                    <span className="text-[11px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                                                                    {msg.sentByEmail && (
                                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                                                            <Mail className="h-2.5 w-2.5 mr-0.5" /> email
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            <div ref={scrollRef} />
                                        </>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Input */}
                            <div className="border-t border-border p-3">
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleSend() }}
                                    className="flex items-center gap-2"
                                >
                                    <Input
                                        value={newMsg}
                                        onChange={(e) => setNewMsg(e.target.value)}
                                        placeholder="Type a reply..."
                                        className="flex-1 bg-background"
                                        disabled={sending}
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={sending || !newMsg.trim()}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </form>
                            </div>
                        </Card>
                    </>
                )}
            </div>
        </div>
    )
}
