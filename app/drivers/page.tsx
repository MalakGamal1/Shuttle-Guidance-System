'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Trash2, Edit2, Search, Phone, Mail, User,
  Loader2, CheckCircle, Plus, AlertCircle,
  Eye, EyeOff, KeyRound, IdCard,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import {
  collection, query, where, getDocs,
  updateDoc, deleteDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '@/context/auth-context'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Driver {
  id: string
  uid?: string
  name: string
  fullName?: string
  email: string
  phone?: string
  employeeId?: string
  role: string
  licenseNumber?: string
  vehicleAssigned?: string
  isActive?: boolean
  rating?: number
  createdAt?: any
  updatedAt?: any
}

interface DriverForm {
  name: string
  email: string
  phone: string
  employeeId: string
  password: string
  confirmPassword: string
  licenseNumber: string
  vehicleAssigned: string   // shuttleId or empty
  isActive: boolean
}

interface ShuttleOption {
  id: string
  plateNumber: string
  model: string
  status: 'idle' | 'on_trip' | 'maintenance'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const getDisplayName = (d: Driver) => d.name || d.fullName || 'N/A'

const defaultForm = (): DriverForm => ({
  name: '',
  email: '',
  phone: '+20',    // pre-fill Egypt country code
  employeeId: '',
  password: '',
  confirmPassword: '',
  licenseNumber: '',
  vehicleAssigned: '',
  isActive: true,
})

/** Validate form — returns error string or null */
function validateDriverForm(form: DriverForm, mode: 'add' | 'edit'): string | null {
  if (!form.name.trim()) return 'Full name is required.'
  if (form.name.trim().length < 3) return 'Name must be at least 3 characters.'
  if (!form.email.trim()) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Please enter a valid email address.'
  }
  if (!form.phone.trim() || form.phone.trim() === '+20') return 'Phone number is required.'
  if (!/^\+\d{7,15}$/.test(form.phone.trim().replace(/\s/g, ''))) {
    return 'Phone must be in international format, e.g. +201234567890'
  }
  if (!form.employeeId.trim()) return 'Employee ID is required.'
  if (mode === 'add') {
    if (!form.password) return 'Password is required.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
  }
  return null
}

// ── Shared form fields ─────────────────────────────────────────────────────────

function DriverFormFields({
  form,
  onChange,
  error,
  shuttles,
  mode,
}: {
  form: DriverForm
  onChange: (f: DriverForm) => void
  error?: string
  shuttles: ShuttleOption[]
  mode: 'add' | 'edit'
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Check if the currently selected shuttle is in maintenance
  const selectedShuttle = shuttles.find((s) => s.id === form.vehicleAssigned)
  const isMaintenanceShuttle = selectedShuttle?.status === 'maintenance'
  // Keep "+20" prefix intact when user types
  const handlePhone = (val: string) => {
    if (!val.startsWith('+20')) {
      onChange({ ...form, phone: '+20' })
    } else {
      const after = val.slice(3).replace(/\D/g, '')
      onChange({ ...form, phone: '+20' + after })
    }
  }

  return (
    <div className="space-y-4">
      {/* ✅ Error INSIDE modal, at the top */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-foreground">Full Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="bg-input text-foreground"
          placeholder="Ahmed Mohamed"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Email <span className="text-destructive">*</span></Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          className="bg-input text-foreground"
          placeholder="driver@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Phone <span className="text-destructive">*</span></Label>
        <Input
          type="tel"
          value={form.phone}
          onChange={(e) => handlePhone(e.target.value)}
          className="bg-input text-foreground font-mono"
          placeholder="+201234567890"
          maxLength={15}
        />
        <p className="text-xs text-muted-foreground">Egypt format: +20XXXXXXXXXX</p>
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Employee ID <span className="text-destructive">*</span></Label>
        <div className="relative">
          <IdCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={form.employeeId}
            onChange={(e) => onChange({ ...form, employeeId: e.target.value })}
            className="bg-input text-foreground pl-10"
            placeholder="EMP-001"
          />
        </div>
        <p className="text-xs text-muted-foreground">Unique identifier for driver login</p>
      </div>

      {/* Password fields — only shown in Add mode */}
      {mode === 'add' && (
        <>
          <div className="space-y-2">
            <Label className="text-foreground">Password <span className="text-destructive">*</span></Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => onChange({ ...form, password: e.target.value })}
                className="bg-input text-foreground pl-10 pr-10"
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Confirm Password <span className="text-destructive">*</span></Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => onChange({ ...form, confirmPassword: e.target.value })}
                className="bg-input text-foreground pl-10 pr-10"
                placeholder="Re-enter password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label className="text-foreground">License Number</Label>
        <Input
          value={form.licenseNumber}
          onChange={(e) => onChange({ ...form, licenseNumber: e.target.value })}
          className="bg-input text-foreground"
          placeholder="LIC-12345"
        />
      </div>

      {/* Vehicle dropdown from shuttles collection */}
      <div className="space-y-2">
        <Label className="text-foreground">Vehicle Assigned</Label>
        <Select
          value={form.vehicleAssigned || 'none'}
          onValueChange={(v) => {
            const shuttleId = v === 'none' ? '' : v
            const shuttle = shuttles.find((s) => s.id === shuttleId)
            // If selected shuttle is in maintenance, force driver inactive
            if (shuttle?.status === 'maintenance') {
              onChange({ ...form, vehicleAssigned: shuttleId, isActive: false })
            } else {
              onChange({ ...form, vehicleAssigned: shuttleId })
            }
          }}
        >
          <SelectTrigger className="border-border bg-input">
            <SelectValue placeholder="Select a shuttle..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">— No vehicle —</span>
            </SelectItem>
            {shuttles.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No shuttles available
              </SelectItem>
            ) : (
              shuttles.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="font-medium">{s.plateNumber}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{s.model}</span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Shuttles loaded from fleet</p>
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Status</Label>
        <Select
          value={form.isActive ? 'active' : 'inactive'}
          onValueChange={(v) => onChange({ ...form, isActive: v === 'active' })}
          disabled={isMaintenanceShuttle}
        >
          <SelectTrigger className="border-border bg-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {isMaintenanceShuttle && (
          <p className="text-xs text-yellow-500">Driver must be Inactive while assigned shuttle is in Maintenance.</p>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const { role } = useAuth()
  const canManage = role === 'admin' || role === 'root'

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [shuttles, setShuttles] = useState<ShuttleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Add
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<DriverForm>(defaultForm())
  const [addError, setAddError] = useState('')

  // Edit
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [editForm, setEditForm] = useState<DriverForm>(defaultForm())
  const [editError, setEditError] = useState('')

  // Password reset
  const [resetPwDriver, setResetPwDriver] = useState<Driver | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [resetPwError, setResetPwError] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  // Page-level message for non-modal errors (fetch, delete)
  const [pageMsg, setPageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  /** Load shuttles first, then drivers, then sync maintenance rule */
  const loadAll = async () => {
    const shuttleList = await fetchShuttles()
    await fetchDrivers(shuttleList)
  }

  const fetchShuttles = async (): Promise<ShuttleOption[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'shuttles'))
      const list = snapshot.docs.map((docSnap) => {
        const d = docSnap.data()
        return {
          id: docSnap.id,
          plateNumber: d.plateNumber || docSnap.id,
          model: d.model || '',
          status: (d.status || 'idle') as ShuttleOption['status'],
        }
      })
      setShuttles(list)
      return list
    } catch (err) {
      console.error('Error fetching shuttles:', err)
      return []
    }
  }

  const fetchDrivers = async (shuttleList?: ShuttleOption[]) => {
    try {
      setLoading(true)
      const q = query(collection(db, 'users'), where('role', '==', 'driver'))
      const snapshot = await getDocs(q)
      const sMap = new Map((shuttleList ?? shuttles).map((s) => [s.id, s]))

      const driverList = snapshot.docs.map((docSnap) => {
        const d = docSnap.data()
        const vehicleId = d.vehicleAssigned || ''
        const assignedShuttle = sMap.get(vehicleId)
        // Enforce: driver must be inactive if shuttle is in maintenance
        let active = d.isActive ?? true
        if (assignedShuttle?.status === 'maintenance' && active) {
          active = false
          // Write correction back to Firestore (fire-and-forget)
          updateDoc(doc(db, 'users', docSnap.id), { isActive: false, updatedAt: serverTimestamp() }).catch(() => {})
        }
        return {
          id: docSnap.id,
          uid: d.uid || docSnap.id,
          name: d.name || '',
          fullName: d.fullName || '',
          email: d.email || '',
          phone: d.phone || '',
          employeeId: d.employeeId || '',
          role: d.role || 'driver',
          licenseNumber: d.licenseNumber || '',
          vehicleAssigned: vehicleId,
          isActive: active,
          rating: d.rating ?? 0,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }
      })
      setDrivers(driverList)
    } catch (err) {
      console.error('Error fetching drivers:', err)
      showPageMsg('error', 'Failed to load drivers')
    } finally {
      setLoading(false)
    }
  }

  const showPageMsg = (type: 'success' | 'error', text: string) => {
    setPageMsg({ type, text })
    setTimeout(() => setPageMsg(null), 4000)
  }

  const filteredDrivers = drivers.filter((d) => {
    const name = getDisplayName(d)
    const matchSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      (d.phone && d.phone.includes(search)) ||
      (d.employeeId && d.employeeId.toLowerCase().includes(search.toLowerCase()))
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && d.isActive) ||
      (statusFilter === 'inactive' && !d.isActive)
    return matchSearch && matchStatus
  })

  // ── Add ──────────────────────────────────────────────────────────────────────

  const handleAddDriver = async () => {
    const err = validateDriverForm(addForm, 'add')
    if (err) { setAddError(err); return }
    setAddError('')
    setIsSaving(true)
    try {
      // Enforce: if assigned shuttle is maintenance, force inactive
      const assignedShuttle = shuttles.find((s) => s.id === addForm.vehicleAssigned)
      const isActive = assignedShuttle?.status === 'maintenance' ? false : addForm.isActive

      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: addForm.name.trim(),
          email: addForm.email.trim(),
          password: addForm.password,
          employeeId: addForm.employeeId.trim(),
          phone: addForm.phone.trim(),
          licenseNumber: addForm.licenseNumber.trim(),
          vehicleAssigned: addForm.vehicleAssigned.trim(),
          isActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to create driver.')
        return
      }

      await loadAll()
      setIsAddOpen(false)
      setAddForm(defaultForm())
      showPageMsg('success', 'Driver created successfully — they can now log in from the mobile app.')
    } catch (err) {
      console.error('Error adding driver:', err)
      setAddError('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const handleOpenEdit = (driver: Driver) => {
    const phone = driver.phone || '+20'
    setEditForm({
      name: driver.name || driver.fullName || '',
      email: driver.email || '',
      phone: phone.startsWith('+') ? phone : '+20' + phone,
      employeeId: driver.employeeId || '',
      password: '',
      confirmPassword: '',
      licenseNumber: driver.licenseNumber || '',
      vehicleAssigned: driver.vehicleAssigned || '',
      isActive: driver.isActive ?? true,
    })
    setEditError('')
    setEditingDriver(driver)
  }

  const handleSaveEdit = async () => {
    if (!editingDriver) return
    const err = validateDriverForm(editForm, 'edit')
    if (err) { setEditError(err); return }
    setEditError('')
    setIsSaving(true)
    try {
      // Enforce: if assigned shuttle is maintenance, force inactive
      const assignedShuttle = shuttles.find((s) => s.id === editForm.vehicleAssigned)
      const isActive = assignedShuttle?.status === 'maintenance' ? false : editForm.isActive

      // Use uid if available, otherwise fall back to doc id
      const driverUid = editingDriver.uid || editingDriver.id

      const res = await fetch('/api/drivers/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: driverUid,
          fullName: editForm.name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          employeeId: editForm.employeeId.trim(),
          licenseNumber: editForm.licenseNumber.trim(),
          vehicleAssigned: editForm.vehicleAssigned.trim(),
          isActive,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error || 'Failed to update driver.')
        return
      }

      await loadAll()
      setEditingDriver(null)
      showPageMsg('success', 'Driver updated successfully')
    } catch (err) {
      console.error('Error updating driver:', err)
      setEditError('Failed to update. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Password Reset ──────────────────────────────────────────────────────────

  const handleOpenResetPw = (driver: Driver) => {
    setResetPwDriver(driver)
    setNewPassword('')
    setConfirmNewPassword('')
    setResetPwError('')
    setShowNewPw(false)
  }

  const handleResetPassword = async () => {
    if (!resetPwDriver) return
    if (!newPassword || newPassword.length < 8) {
      setResetPwError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setResetPwError('Passwords do not match.')
      return
    }
    setResetPwError('')
    setIsSaving(true)
    try {
      const driverUid = resetPwDriver.uid || resetPwDriver.id
      const res = await fetch('/api/drivers/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: driverUid, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetPwError(data.error || 'Failed to reset password.')
        return
      }
      setResetPwDriver(null)
      showPageMsg('success', `Password reset for ${getDisplayName(resetPwDriver)}`)
    } catch (err) {
      console.error('Error resetting password:', err)
      setResetPwError('Failed to reset password. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (driver: Driver) => {
    if (!confirm(`Delete driver ${getDisplayName(driver)}? This will remove them from both the database and Firebase Auth. This cannot be undone.`)) return
    try {
      const driverUid = driver.uid || driver.id

      const res = await fetch('/api/drivers/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: driverUid }),
      })

      const data = await res.json()
      if (!res.ok) {
        showPageMsg('error', data.error || 'Failed to delete driver.')
        return
      }

      setDrivers((prev) => prev.filter((d) => d.id !== driver.id))
      showPageMsg('success', 'Driver removed from Auth and database')
    } catch (err) {
      console.error('Error deleting driver:', err)
      showPageMsg('error', 'Failed to delete driver')
    }
  }

  const activeCount = drivers.filter((d) => d.isActive).length
  const inactiveCount = drivers.filter((d) => !d.isActive).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {pageMsg && (
        <Alert variant={pageMsg.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{pageMsg.text}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Driver Management</h1>
          <p className="text-muted-foreground">View and manage shuttle drivers</p>
        </div>
        {canManage && (
          <Button
            onClick={() => { setAddForm(defaultForm()); setAddError(''); setIsAddOpen(true) }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Driver
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{inactiveCount}</div>
            <p className="text-xs text-muted-foreground">Currently inactive</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{drivers.length}</div>
            <p className="text-xs text-primary">Registered in system</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or Employee ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Drivers Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Registered Drivers</CardTitle>
          <CardDescription>{filteredDrivers.length} drivers found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left font-medium text-foreground">Name</th>
                  <th className="py-3 text-left font-medium text-foreground">Employee ID</th>
                  <th className="py-3 text-left font-medium text-foreground">Contact</th>
                  <th className="py-3 text-left font-medium text-foreground">License #</th>
                  <th className="py-3 text-left font-medium text-foreground">Vehicle</th>
                  <th className="py-3 text-left font-medium text-foreground">Rating</th>
                  <th className="py-3 text-left font-medium text-foreground">Status</th>
                  <th className="py-3 text-center font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No drivers found
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((driver) => {
                    const rating = driver.rating ?? 0
                    const pct = Math.round((rating / 5) * 100)
                    return (
                      <tr
                        key={driver.id}
                        className="border-b border-border/50 hover:bg-sidebar-accent transition-colors"
                      >
                        <td className="py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {getDisplayName(driver)}
                          </div>
                        </td>
                        <td className="py-3">
                          {driver.employeeId ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {driver.employeeId}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-0.5">
                            {driver.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />{driver.email}
                              </div>
                            )}
                            {driver.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" />{driver.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">{driver.licenseNumber || 'N/A'}</td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {driver.vehicleAssigned
                            ? shuttles.find((s) => s.id === driver.vehicleAssigned)?.plateNumber || 'Unknown'
                            : 'Not Assigned'}
                        </td>
                        <td className="py-3">
                          {/* Rating visual bar */}
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-sidebar-accent overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground font-medium">
                              {rating.toFixed(1)}/5
                            </span>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            className={
                              driver.isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-gray-500/20 text-gray-400'
                            }
                          >
                            {driver.isActive && <CheckCircle className="mr-1 h-3 w-3" />}
                            {driver.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(driver)}
                              className="hover:bg-blue-500/10 text-blue-500 hover:text-blue-600"
                              title="Edit driver"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenResetPw(driver)}
                                className="hover:bg-amber-500/10 text-amber-500 hover:text-amber-600"
                                title="Reset password"
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(driver)}
                              className="hover:bg-red-500/10 text-red-500 hover:text-red-600"
                              title="Delete driver"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { if (!open) { setIsAddOpen(false); setAddError('') } }}>
        <DialogContent className="border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Driver</DialogTitle>
            <DialogDescription>
              Fill in the driver details below. A Firebase Auth account will be created automatically so the driver can log in from the mobile app.
            </DialogDescription>
          </DialogHeader>
          <DriverFormFields form={addForm} onChange={setAddForm} error={addError} shuttles={shuttles} mode="add" />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => { setIsAddOpen(false); setAddError('') }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDriver}
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingDriver} onOpenChange={(open) => { if (!open) { setEditingDriver(null); setEditError('') } }}>
        <DialogContent className="border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Driver</DialogTitle>
            <DialogDescription>
              Update info for {editingDriver ? getDisplayName(editingDriver) : ''}
            </DialogDescription>
          </DialogHeader>
          <DriverFormFields form={editForm} onChange={setEditForm} error={editError} shuttles={shuttles} mode="edit" />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => { setEditingDriver(null); setEditError('') }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!resetPwDriver} onOpenChange={(open) => { if (!open) { setResetPwDriver(null); setResetPwError('') } }}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset Driver Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetPwDriver ? getDisplayName(resetPwDriver) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {resetPwError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {resetPwError}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-foreground">New Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-input text-foreground pl-10 pr-10"
                  placeholder="Minimum 8 characters"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Confirm New Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showNewPw ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="bg-input text-foreground pl-10 pr-10"
                  placeholder="Re-enter new password"
                />
              </div>
              {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => { setResetPwDriver(null); setResetPwError('') }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isSaving}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
