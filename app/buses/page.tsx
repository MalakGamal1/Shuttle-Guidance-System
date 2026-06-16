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
import { Bus, Plus, Search, AlertCircle, CheckCircle, Loader2, Edit2, Trash2, Activity } from 'lucide-react'
import { db } from '@/lib/firebase'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'

// ── Firestore schema: shuttles/{shuttleId} ─────────────────────────────────────

interface Shuttle {
  id: string
  plateNumber: string
  model: string
  capacity: number
  status: 'idle' | 'on_trip' | 'maintenance'
  isActive: boolean
  createdAt?: any
  updatedAt?: any
}

interface ShuttleForm {
  plateNumber: string
  model: string
  capacity: string   // string for input, converted to number on save
  status: 'idle' | 'on_trip' | 'maintenance'
  isActive: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultForm = (): ShuttleForm => ({
  plateNumber: '',
  model: '',
  capacity: '',
  status: 'idle',
  isActive: true,
})

const statusConfig: Record<string, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'bg-gray-500/20 text-gray-400' },
  on_trip: { label: 'On Trip', className: 'bg-primary text-primary-foreground' },
  maintenance: { label: 'Maintenance', className: 'bg-yellow-500/20 text-yellow-500' },
}

/** Validate shuttle form — returns error string or null */
function validateShuttleForm(form: ShuttleForm): string | null {
  if (!form.plateNumber.trim()) return 'Plate number is required.'
  const cap = parseInt(form.capacity)
  if (!form.capacity || isNaN(cap) || cap < 1) return 'Capacity must be a positive number.'
  if (cap > 200) return 'Capacity cannot exceed 200 seats.'
  if (!form.model.trim()) return 'Model is required.'
  if (form.model.trim().length < 2) return 'Model must be at least 2 characters.'
  // Maintenance shuttles cannot be active
  if (form.status === 'maintenance' && form.isActive) {
    return 'A shuttle in Maintenance cannot be Active.'
  }
  return null
}

// ── Shared form fields ─────────────────────────────────────────────────────────

function ShuttleFormFields({
  form,
  onChange,
  error,
}: {
  form: ShuttleForm
  onChange: (f: ShuttleForm) => void
  error?: string
}) {
  const cap = parseInt(form.capacity) || 0
  // Show a preview bar of capacity (capped at 200 for visual)
  const capPct = Math.min(100, Math.round((cap / 200) * 100))

  return (
    <div className="space-y-4">
      {/* ✅ Error INSIDE modal, at the top */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-foreground">Plate Number *</Label>
          <Input
            value={form.plateNumber}
            onChange={(e) => onChange({ ...form, plateNumber: e.target.value.toUpperCase() })}
            className="bg-input text-foreground uppercase"
            placeholder="ABC-1234"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Capacity * <span className="text-muted-foreground font-normal text-xs">(max 200)</span></Label>
          <Input
            type="number"
            min={1}
            max={200}
            value={form.capacity}
            onChange={(e) => onChange({ ...form, capacity: e.target.value })}
            className="bg-input text-foreground"
            placeholder="50"
          />
          {/* Live capacity visual */}
          {cap > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-2 rounded-full bg-sidebar-accent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${capPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-medium w-14">{cap}/200 seats</span>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-foreground">Model *</Label>
        <Input
          value={form.model}
          onChange={(e) => onChange({ ...form, model: e.target.value })}
          className="bg-input text-foreground"
          placeholder="e.g. Volvo B9R"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-foreground">Status</Label>
          <Select value={form.status} onValueChange={(v: any) => {
            const newStatus = v as ShuttleForm['status']
            // If switching to maintenance, force inactive
            if (newStatus === 'maintenance') {
              onChange({ ...form, status: newStatus, isActive: false })
            } else {
              onChange({ ...form, status: newStatus })
            }
          }}>
            <SelectTrigger className="border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="on_trip">On Trip</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Active</Label>
          <Select
            value={form.isActive ? 'yes' : 'no'}
            onValueChange={(v) => onChange({ ...form, isActive: v === 'yes' })}
            disabled={form.status === 'maintenance'}
          >
            <SelectTrigger className="border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
          {form.status === 'maintenance' && (
            <p className="text-xs text-yellow-500 mt-1">Shuttles in Maintenance are automatically set to Inactive.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BusesPage() {
  const [shuttles, setShuttles] = useState<Shuttle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<ShuttleForm>(defaultForm())
  const [addError, setAddError] = useState('')

  const [editingShuttle, setEditingShuttle] = useState<Shuttle | null>(null)
  const [editForm, setEditForm] = useState<ShuttleForm>(defaultForm())
  const [editError, setEditError] = useState('')

  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { fetchShuttles() }, [])

  const fetchShuttles = async () => {
    try {
      setLoading(true)
      const snapshot = await getDocs(collection(db, 'shuttles'))
      const data: Shuttle[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data()
        const s: Shuttle = {
          id: docSnap.id,
          plateNumber: d.plateNumber || '',
          model: d.model || '',
          capacity: d.capacity ?? 0,
          status: d.status || 'idle',
          isActive: d.isActive ?? true,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }
        // Auto-correct: maintenance shuttle must not be active
        if (s.status === 'maintenance' && s.isActive) {
          s.isActive = false
          updateDoc(doc(db, 'shuttles', s.id), { isActive: false, updatedAt: serverTimestamp() }).catch(() => {})
        }
        return s
      })
      setShuttles(data)
    } catch (err) {
      console.error('Error fetching shuttles:', err)
      showMsg('error', 'Failed to load shuttles')
    } finally {
      setLoading(false)
    }
  }

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const filteredShuttles = shuttles.filter((s) => {
    const matchSearch =
      s.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.model.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  // ── Stats
  const totalCapacity = shuttles.reduce((sum, s) => sum + s.capacity, 0)
  const onTripCount = shuttles.filter((s) => s.status === 'on_trip').length
  const maintCount = shuttles.filter((s) => s.status === 'maintenance').length

  // ── Add ──────────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const err = validateShuttleForm(addForm)
    if (err) { setAddError(err); return }
    setAddError('')
    setIsSaving(true)
    try {
      await addDoc(collection(db, 'shuttles'), {
        plateNumber: addForm.plateNumber.trim().toUpperCase(),
        model: addForm.model.trim(),
        capacity: parseInt(addForm.capacity),
        status: addForm.status,
        isActive: addForm.status === 'maintenance' ? false : addForm.isActive,
        lastLocation: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await fetchShuttles()
      setIsAddOpen(false)
      setAddForm(defaultForm())
      showMsg('success', 'Shuttle added successfully')
    } catch (err) {
      console.error('Error adding shuttle:', err)
      setAddError('Failed to save. Check Firestore permissions.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const handleOpenEdit = (shuttle: Shuttle) => {
    setEditForm({
      plateNumber: shuttle.plateNumber,
      model: shuttle.model,
      capacity: String(shuttle.capacity),
      status: shuttle.status,
      isActive: shuttle.isActive,
    })
    setEditError('')
    setEditingShuttle(shuttle)
  }

  const handleSaveEdit = async () => {
    if (!editingShuttle) return
    const err = validateShuttleForm(editForm)
    if (err) { setEditError(err); return }
    setEditError('')
    setIsSaving(true)
    try {
      await updateDoc(doc(db, 'shuttles', editingShuttle.id), {
        plateNumber: editForm.plateNumber.trim().toUpperCase(),
        model: editForm.model.trim(),
        capacity: parseInt(editForm.capacity),
        status: editForm.status,
        isActive: editForm.status === 'maintenance' ? false : editForm.isActive,
        updatedAt: serverTimestamp(),
      })
      await fetchShuttles()
      setEditingShuttle(null)
      showMsg('success', 'Shuttle updated successfully')
    } catch (err) {
      console.error('Error updating shuttle:', err)
      showMsg('error', 'Failed to update shuttle')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (shuttle: Shuttle) => {
    if (!confirm(`Delete shuttle ${shuttle.plateNumber}? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'shuttles', shuttle.id))
      setShuttles((prev) => prev.filter((s) => s.id !== shuttle.id))
      showMsg('success', 'Shuttle deleted successfully')
    } catch (err) {
      console.error('Error deleting shuttle:', err)
      showMsg('error', 'Failed to delete shuttle')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
          <h1 className="text-3xl font-bold text-foreground">Bus Management</h1>
          <p className="text-muted-foreground">Manage your fleet of shuttles</p>
        </div>
        <Button
          onClick={() => { setAddForm(defaultForm()); setIsAddOpen(true) }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Shuttle
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Shuttles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{shuttles.length}</div>
            <p className="text-xs text-muted-foreground">In the fleet</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">On Trip</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{onTripCount}</div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{maintCount}</div>
            <p className="text-xs text-muted-foreground">In service</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalCapacity}</div>
            <p className="text-xs text-muted-foreground">Seats across fleet</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by plate or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-input text-foreground"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 border-border bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="idle">Idle</SelectItem>
            <SelectItem value="on_trip">On Trip</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shuttles Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Fleet Overview</CardTitle>
          <CardDescription>{filteredShuttles.length} shuttles found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left font-medium text-foreground">Plate #</th>
                  <th className="py-3 text-left font-medium text-foreground">Model</th>
                  <th className="py-3 text-left font-medium text-foreground">Capacity</th>
                  <th className="py-3 text-left font-medium text-foreground">Status</th>
                  <th className="py-3 text-left font-medium text-foreground">Active</th>
                  <th className="py-3 text-center font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShuttles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No shuttles found
                    </td>
                  </tr>
                ) : (
                  filteredShuttles.map((shuttle) => {
                    const cfg = statusConfig[shuttle.status] ?? statusConfig.idle
                    return (
                      <tr
                        key={shuttle.id}
                        className="border-b border-border/50 hover:bg-sidebar-accent transition-colors"
                      >
                        <td className="py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <Bus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {shuttle.plateNumber}
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">{shuttle.model}</td>
                        <td className="py-3 text-foreground font-medium">{shuttle.capacity} seats</td>
                        <td className="py-3">
                          <Badge className={cfg.className}>
                            {shuttle.status === 'on_trip' && <Activity className="mr-1 h-3 w-3" />}
                            {shuttle.status === 'maintenance' && <AlertCircle className="mr-1 h-3 w-3" />}
                            {shuttle.status === 'idle' && <CheckCircle className="mr-1 h-3 w-3" />}
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-xs font-medium ${shuttle.isActive ? 'text-green-500' : 'text-gray-400'}`}
                          >
                            {shuttle.isActive ? '● Active' : '○ Inactive'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(shuttle)}
                              className="hover:bg-blue-500/10 text-blue-500 hover:text-blue-600"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(shuttle)}
                              className="hover:bg-red-500/10 text-red-500 hover:text-red-600"
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
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Shuttle</DialogTitle>
            <DialogDescription>Enter the shuttle details to add it to the fleet</DialogDescription>
          </DialogHeader>
          <ShuttleFormFields form={addForm} onChange={setAddForm} error={addError} />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => { setIsAddOpen(false); setAddError('') }}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Shuttle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingShuttle} onOpenChange={(open) => { if (!open) { setEditingShuttle(null); setEditError('') } }}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Shuttle</DialogTitle>
            <DialogDescription>
              Update details for {editingShuttle?.plateNumber}
            </DialogDescription>
          </DialogHeader>
          <ShuttleFormFields form={editForm} onChange={setEditForm} error={editError} />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => { setEditingShuttle(null); setEditError('') }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
