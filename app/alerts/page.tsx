'use client'

import { useState, useEffect } from 'react'
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Bell, Trash2, Check, Plus, Send } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

/* ───────────────────────── Types ───────────────────────── */

interface Alert {
  id: string
  title: string
  description: string
  type: 'info' | 'warning' | 'critical'
  status: 'unread' | 'read'
  createdAt: any // Firestore Timestamp
}

const typeColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
}

const typeBorderColors: Record<string, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
}

const typeIcons: Record<string, typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertCircle,
  info: Bell,
}

/* ───────────────── Helper: relative time ───────────────── */

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

/* ══════════════════════════ Page ═══════════════════════════ */

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [severityFilter, setSeverityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  // ── Create Alert dialog state ──
  const [createOpen, setCreateOpen] = useState(false)
  const [newAlert, setNewAlert] = useState({ title: '', description: '', type: 'info' })
  const [creating, setCreating] = useState(false)

  // ── Send Notification dialog state ──
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notification, setNotification] = useState({ title: '', body: '' })
  const [sending, setSending] = useState(false)

  /* ────── Real-time Firestore listener ────── */
  useEffect(() => {
    const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Alert))
      setAlerts(data)
      setLoading(false)
    }, (err) => {
      console.error('Alerts listener error:', err)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  /* ────── Computed ────── */
  const filteredAlerts = alerts.filter((a) =>
    severityFilter === 'all' ? true : a.type === severityFilter
  )
  const unreadCount = alerts.filter((a) => a.status === 'unread').length

  /* ────── Handlers ────── */

  async function handleCreateAlert() {
    if (!newAlert.title.trim()) {
      toast({ title: 'Validation Error', description: 'Alert title is required.', variant: 'destructive' })
      return
    }
    if (!newAlert.description.trim()) {
      toast({ title: 'Validation Error', description: 'Alert description is required.', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      // 1. Save to Firestore
      await addDoc(collection(db, 'alerts'), {
        title: newAlert.title,
        description: newAlert.description,
        type: newAlert.type,
        status: 'unread',
        createdAt: serverTimestamp(),
      })

      // 2. Broadcast FCM notification via internal API
      let notificationSent = false
      let notificationError = ''
      try {
        const res = await fetch('/api/notifications/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newAlert.title,
            body: newAlert.description,
            type: newAlert.type,
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          notificationError = errData.error || `HTTP ${res.status}`
        } else {
          notificationSent = true
        }
      } catch (fcmErr: any) {
        console.warn('FCM broadcast failed (non-fatal):', fcmErr)
        notificationError = fcmErr.message || 'Network error'
      }

      if (notificationSent) {
        toast({ title: 'Alert Created', description: 'Alert saved and push notification broadcast.' })
      } else {
        toast({
          title: 'Alert Created with Warning',
          description: `Alert saved, but push notification failed: ${notificationError}`,
          variant: 'destructive',
        })
      }
      setNewAlert({ title: '', description: '', type: 'info' })
      setCreateOpen(false)
    } catch (err) {
      console.error('Create alert error:', err)
      toast({ title: 'Error', description: 'Failed to create alert.', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  async function handleSendNotification() {
    if (!notification.title.trim()) {
      toast({ title: 'Validation Error', description: 'Notification title is required.', variant: 'destructive' })
      return
    }
    if (!notification.body.trim()) {
      toast({ title: 'Validation Error', description: 'Notification message is required.', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notification.title,
          body: notification.body,
          type: 'info',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      toast({ title: 'Notification Sent', description: 'Push notification broadcast to all users.' })
      setNotification({ title: '', body: '' })
      setNotifyOpen(false)
    } catch (err: any) {
      console.error('Send notification error:', err)
      toast({ title: 'Error', description: err.message || 'Failed to send notification.', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  async function handleMarkAsRead(id: string) {
    await updateDoc(doc(db, 'alerts', id), { status: 'read' })
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, 'alerts', id))
  }

  async function handleMarkAllAsRead() {
    const unread = alerts.filter((a) => a.status === 'unread')
    await Promise.all(unread.map((a) => updateDoc(doc(db, 'alerts', a.id), { status: 'read' })))
  }

  /* ══════════════════════ Render ═══════════════════════ */

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Alerts &amp; Notifications
            {unreadCount > 0 && (
              <Badge className="ml-3 bg-destructive text-destructive-foreground">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            System alerts and important notifications
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={handleMarkAllAsRead}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark All as Read
            </Button>
          )}

          {/* ── Create Alert Dialog ── */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" />
                Create Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Create New Alert</DialogTitle>
                <DialogDescription>
                  This alert will be saved and an FCM notification will be broadcast to all users.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="alert-title">Title</Label>
                  <Input
                    id="alert-title"
                    value={newAlert.title}
                    onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                    placeholder="e.g. Bus #12 Maintenance Due"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-desc">Description</Label>
                  <Textarea
                    id="alert-desc"
                    value={newAlert.description}
                    onChange={(e) => setNewAlert({ ...newAlert, description: e.target.value })}
                    placeholder="Describe the alert..."
                    className="min-h-[100px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newAlert.type} onValueChange={(v) => setNewAlert({ ...newAlert, type: v })}>
                    <SelectTrigger className="border-border bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">ℹ️ Info</SelectItem>
                      <SelectItem value="warning">⚠️ Warning</SelectItem>
                      <SelectItem value="critical">🚨 Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateAlert}
                  disabled={creating || !newAlert.title.trim() || !newAlert.description.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {creating ? 'Creating...' : 'Create & Notify'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Send Notification Dialog ── */}
          <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border hover:bg-sidebar-accent bg-transparent">
                <Send className="mr-2 h-4 w-4" />
                Send Notification
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Broadcast Notification</DialogTitle>
                <DialogDescription>
                  Send a custom push notification to all users (drivers &amp; passengers).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="notif-title">Title</Label>
                  <Input
                    id="notif-title"
                    value={notification.title}
                    onChange={(e) => setNotification({ ...notification, title: e.target.value })}
                    placeholder="Notification title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notif-body">Message</Label>
                  <Textarea
                    id="notif-body"
                    value={notification.body}
                    onChange={(e) => setNotification({ ...notification, body: e.target.value })}
                    placeholder="Notification message..."
                    className="min-h-[100px] resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNotifyOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSendNotification}
                  disabled={sending || !notification.title.trim() || !notification.body.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {sending ? 'Sending...' : 'Broadcast Now'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40 border-border bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Loading alerts...</p>
            </CardContent>
          </Card>
        ) : filteredAlerts.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
              <p className="text-muted-foreground">No alerts to display</p>
            </CardContent>
          </Card>
        ) : (
          filteredAlerts.map((alert) => {
            const Icon = typeIcons[alert.type] || Bell
            const createdDate = alert.createdAt?.toDate?.() ?? new Date()
            return (
              <Card
                key={alert.id}
                className={`border-l-4 transition-all ${alert.status === 'unread'
                  ? typeColors[alert.type] || ''
                  : 'border-border bg-card hover:bg-card/80'
                  } ${typeBorderColors[alert.type] || ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Icon className="h-6 w-6 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{alert.title}</p>
                          <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs capitalize">{alert.type}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(createdDate)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {alert.status === 'unread' && (
                            <div className="h-3 w-3 rounded-full bg-primary flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {alert.status === 'unread' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(alert.id)}
                          className="hover:bg-foreground/10"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(alert.id)}
                        className="hover:bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
