'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Users, Search, CheckCircle, Loader2, Ban, Shield } from 'lucide-react'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Matches the Firestore users/{uid} schema
interface Passenger {
  id: string
  name?: string        // Firestore field
  fullName?: string    // legacy fallback
  email: string
  phone?: string
  role: string
  theme?: string
  fcmToken?: string | null
  createdAt?: any
  lastSeenAt?: any
  updatedAt?: any
  isActive?: boolean
  // Block fields
  isBlocked?: boolean
  blockedUntil?: string | null
  blockReason?: string
}

const blockDurations = [
  { label: '1 Day', value: '1' },
  { label: '3 Days', value: '3' },
  { label: '1 Week', value: '7' },
  { label: '2 Weeks', value: '14' },
  { label: '1 Month', value: '30' },
  { label: '3 Months', value: '90' },
  { label: '6 Months', value: '180' },
  { label: '1 Year', value: '365' },
  { label: 'Lifetime', value: 'lifetime' },
]

const getDisplayName = (p: Passenger) => p.name || p.fullName || 'N/A'

export default function PassengersPage() {
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)
  const [selectedPassenger, setSelectedPassenger] = useState<Passenger | null>(null)
  const [blockDuration, setBlockDuration] = useState('7')
  const [blockReason, setBlockReason] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchPassengers()
  }, [])

  const fetchPassengers = async () => {
    try {
      setLoading(true)
      const usersRef = collection(db, 'users')
      const q = query(usersRef, where('role', '==', 'passenger'))
      const querySnapshot = await getDocs(q)

      const passengersData: Passenger[] = []
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data()
        passengersData.push({
          id: docSnap.id,
          name: data.name || '',
          fullName: data.fullName || '',
          email: data.email || '',
          phone: data.phone || '',
          role: data.role || 'passenger',
          theme: data.theme,
          fcmToken: data.fcmToken ?? null,
          createdAt: data.createdAt,
          lastSeenAt: data.lastSeenAt,
          updatedAt: data.updatedAt,
          isActive: data.isActive ?? true,
          isBlocked: data.isBlocked || false,
          blockedUntil: data.blockedUntil || null,
          blockReason: data.blockReason || '',
        })
      })

      setPassengers(passengersData)
    } catch (error) {
      console.error('Error fetching passengers:', error)
      setMessage({ type: 'error', text: 'Failed to load passengers' })
    } finally {
      setLoading(false)
    }
  }

  const filteredPassengers = passengers.filter((passenger) => {
    const name = getDisplayName(passenger)
    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      passenger.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (passenger.phone && passenger.phone.includes(searchTerm))

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && passenger.isActive && !passenger.isBlocked) ||
      (statusFilter === 'blocked' && passenger.isBlocked) ||
      (statusFilter === 'inactive' && !passenger.isActive)

    return matchesSearch && matchesStatus
  })

  const handleBlockPassenger = (passenger: Passenger) => {
    setSelectedPassenger(passenger)
    setBlockDuration('7')
    setBlockReason('')
    setIsBlockDialogOpen(true)
  }

  const handleUnblockPassenger = async (passenger: Passenger) => {
    if (!confirm(`Are you sure you want to unblock ${getDisplayName(passenger)}?`)) return

    try {
      await updateDoc(doc(db, 'users', passenger.id), {
        isBlocked: false,
        blockedUntil: null,
        blockReason: '',
        updatedAt: serverTimestamp(),
      })

      await fetchPassengers()
      setMessage({ type: 'success', text: 'Passenger unblocked successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error unblocking passenger:', error)
      setMessage({ type: 'error', text: 'Failed to unblock passenger' })
    }
  }

  const handleConfirmBlock = async () => {
    if (!selectedPassenger) return

    try {
      let blockedUntil: string | null = null
      if (blockDuration !== 'lifetime') {
        const days = parseInt(blockDuration)
        const date = new Date()
        date.setDate(date.getDate() + days)
        blockedUntil = date.toISOString()
      }

      await updateDoc(doc(db, 'users', selectedPassenger.id), {
        isBlocked: true,
        blockedUntil: blockedUntil,
        blockReason: blockReason || 'No reason provided',
        updatedAt: serverTimestamp(),
      })

      await fetchPassengers()
      setIsBlockDialogOpen(false)
      setSelectedPassenger(null)
      setBlockReason('')
      setMessage({ type: 'success', text: 'Passenger blocked successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error blocking passenger:', error)
      setMessage({ type: 'error', text: 'Failed to block passenger' })
    }
  }

  const getBlockStatus = (passenger: Passenger) => {
    if (!passenger.isBlocked) return null
    if (!passenger.blockedUntil) return 'Lifetime'
    const expiry = new Date(passenger.blockedUntil)
    if (expiry < new Date()) return 'Expired'
    const daysLeft = Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return `${daysLeft} days left`
  }

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A'
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return 'N/A' }
  }

  const activeCount = passengers.filter((p) => p.isActive && !p.isBlocked).length
  const blockedCount = passengers.filter((p) => p.isBlocked).length
  const totalCount = passengers.length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Passenger Management</h1>
          <p className="text-muted-foreground">Manage registered passengers and their status</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {totalCount} total passengers
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Passengers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Currently registered & active</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked Passengers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{blockedCount}</div>
            <p className="text-xs text-muted-foreground">Currently blocked</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Registered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            <p className="text-xs text-primary">{totalCount - activeCount} inactive/blocked</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-input text-foreground"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 border-border bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Passengers Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Registered Passengers</CardTitle>
          <CardDescription>{filteredPassengers.length} passengers found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left font-medium text-foreground">Name</th>
                  <th className="py-3 text-left font-medium text-foreground">Email</th>
                  <th className="py-3 text-left font-medium text-foreground">Phone</th>
                  <th className="py-3 text-left font-medium text-foreground">Joined</th>
                  <th className="py-3 text-left font-medium text-foreground">Status</th>
                  <th className="py-3 text-center font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPassengers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No passengers found
                    </td>
                  </tr>
                ) : (
                  filteredPassengers.map((passenger) => (
                    <tr
                      key={passenger.id}
                      className="border-b border-border/50 hover:bg-sidebar-accent transition-colors"
                    >
                      <td className="py-3 font-medium text-foreground">{getDisplayName(passenger)}</td>
                      <td className="py-3 text-xs text-muted-foreground">{passenger.email}</td>
                      <td className="py-3 text-xs text-muted-foreground">{passenger.phone || 'N/A'}</td>
                      <td className="py-3 text-xs text-muted-foreground">{formatDate(passenger.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex flex-col gap-1">
                          <Badge
                            className={
                              passenger.isActive && !passenger.isBlocked
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-gray-500/20 text-gray-400'
                            }
                          >
                            {passenger.isActive && !passenger.isBlocked && <CheckCircle className="mr-1 h-3 w-3" />}
                            {passenger.isActive && !passenger.isBlocked ? 'Active' : 'Inactive'}
                          </Badge>
                          {passenger.isBlocked && (
                            <Badge className="bg-red-500/20 text-red-400 flex items-center gap-1">
                              <Ban className="h-3 w-3" />
                              Blocked · {getBlockStatus(passenger)}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-2">
                          {passenger.isBlocked ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnblockPassenger(passenger)}
                              className="hover:bg-green-500/10 text-green-500 hover:text-green-600"
                            >
                              <Shield className="h-4 w-4 mr-1" />
                              Unblock
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleBlockPassenger(passenger)}
                              className="hover:bg-red-500/10 text-red-500 hover:text-red-600"
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Block
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Block Dialog */}
      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              Block Passenger
            </DialogTitle>
            <DialogDescription>
              Block {selectedPassenger ? getDisplayName(selectedPassenger) : ''} from using the shuttle service
            </DialogDescription>
          </DialogHeader>
          {/* ✅ Error INSIDE modal, at the top */}
          {message && message.type === 'error' && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {message.text}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Block Duration</Label>
              <Select value={blockDuration} onValueChange={setBlockDuration}>
                <SelectTrigger className="border-border bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {blockDurations.map((duration) => (
                    <SelectItem key={duration.value} value={duration.value}>
                      {duration.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Reason (Optional)</Label>
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="bg-input text-foreground"
                placeholder="Enter reason for blocking..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => setIsBlockDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Block Passenger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
