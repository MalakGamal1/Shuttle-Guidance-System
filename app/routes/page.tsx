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
  MapPin,
  Plus,
  Search,
  CheckCircle,
  Loader2,
  Edit2,
  Trash2,
  Users,
  Navigation,
} from 'lucide-react'
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

// ── Firestore schema: stations/{stationId} ─────────────────────────────────────

interface Station {
  id: string
  name: string
  lat: number
  lng: number
  isActive: boolean
  expectedPassengersPerDay: number
  createdAt?: any
  lastUpdated?: any
}

interface StationForm {
  name: string
  lat: string
  lng: string
  isActive: boolean
  expectedPassengersPerDay: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultForm = (): StationForm => ({
  name: '',
  lat: '',
  lng: '',
  isActive: true,
  expectedPassengersPerDay: '',
})

const formatTimestamp = (ts: any) => {
  if (!ts) return 'N/A'
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return 'N/A' }
}

// ── Shared form fields ─────────────────────────────────────────────────────────

function StationFormFields({
  form,
  onChange,
}: {
  form: StationForm
  onChange: (f: StationForm) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-foreground">Station Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="bg-input text-foreground"
          placeholder="e.g. Main Gate"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-foreground">Latitude *</Label>
          <Input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => onChange({ ...form, lat: e.target.value })}
            className="bg-input text-foreground"
            placeholder="30.0444"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Longitude *</Label>
          <Input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => onChange({ ...form, lng: e.target.value })}
            className="bg-input text-foreground"
            placeholder="31.2357"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-foreground">Expected Passengers/Day</Label>
          <Input
            type="number"
            min={0}
            value={form.expectedPassengersPerDay}
            onChange={(e) => onChange({ ...form, expectedPassengersPerDay: e.target.value })}
            className="bg-input text-foreground"
            placeholder="100"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Status</Label>
          <Select
            value={form.isActive ? 'active' : 'inactive'}
            onValueChange={(v) => onChange({ ...form, isActive: v === 'active' })}
          >
            <SelectTrigger className="border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StationsPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<StationForm>(defaultForm())

  const [editingStation, setEditingStation] = useState<Station | null>(null)
  const [editForm, setEditForm] = useState<StationForm>(defaultForm())

  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { fetchStations() }, [])

  const fetchStations = async () => {
    try {
      setLoading(true)
      const snapshot = await getDocs(collection(db, 'stations'))
      const data: Station[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data()
        return {
          id: docSnap.id,
          name: d.name || '',
          lat: d.lat ?? 0,
          lng: d.lng ?? 0,
          isActive: d.isActive ?? true,
          expectedPassengersPerDay: d.expectedPassengersPerDay ?? 0,
          createdAt: d.createdAt,
          lastUpdated: d.lastUpdated,
        }
      })
      setStations(data)
    } catch (err) {
      console.error('Error fetching stations:', err)
      showMsg('error', 'Failed to load stations')
    } finally {
      setLoading(false)
    }
  }

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const validateForm = (form: StationForm): string | null => {
    if (!form.name.trim()) return 'Station name is required'
    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    if (form.lat && (isNaN(lat) || lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90'
    if (form.lng && (isNaN(lng) || lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180'
    return null
  }

  const filteredStations = stations.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.isActive) ||
      (statusFilter === 'inactive' && !s.isActive)
    return matchSearch && matchStatus
  })

  // ── Stats
  const activeCount = stations.filter((s) => s.isActive).length
  const totalExpected = stations.reduce((sum, s) => sum + (s.expectedPassengersPerDay || 0), 0)

  // ── Add ──────────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const err = validateForm(addForm)
    if (err) { showMsg('error', err); return }
    setIsSaving(true)
    try {
      await addDoc(collection(db, 'stations'), {
        name: addForm.name.trim(),
        lat: addForm.lat ? parseFloat(addForm.lat) : 0,
        lng: addForm.lng ? parseFloat(addForm.lng) : 0,
        isActive: addForm.isActive,
        expectedPassengersPerDay: addForm.expectedPassengersPerDay
          ? parseInt(addForm.expectedPassengersPerDay)
          : 0,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      })
      await fetchStations()
      setIsAddOpen(false)
      setAddForm(defaultForm())
      showMsg('success', 'Station added successfully')
    } catch (e) {
      console.error('Error adding station:', e)
      showMsg('error', 'Failed to add station')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const handleOpenEdit = (station: Station) => {
    setEditForm({
      name: station.name,
      lat: station.lat ? String(station.lat) : '',
      lng: station.lng ? String(station.lng) : '',
      isActive: station.isActive,
      expectedPassengersPerDay: station.expectedPassengersPerDay
        ? String(station.expectedPassengersPerDay)
        : '',
    })
    setEditingStation(station)
  }

  const handleSaveEdit = async () => {
    if (!editingStation) return
    const err = validateForm(editForm)
    if (err) { showMsg('error', err); return }
    setIsSaving(true)
    try {
      await updateDoc(doc(db, 'stations', editingStation.id), {
        name: editForm.name.trim(),
        lat: editForm.lat ? parseFloat(editForm.lat) : 0,
        lng: editForm.lng ? parseFloat(editForm.lng) : 0,
        isActive: editForm.isActive,
        expectedPassengersPerDay: editForm.expectedPassengersPerDay
          ? parseInt(editForm.expectedPassengersPerDay)
          : 0,
        lastUpdated: serverTimestamp(),
      })
      await fetchStations()
      setEditingStation(null)
      showMsg('success', 'Station updated successfully')
    } catch (e) {
      console.error('Error updating station:', e)
      showMsg('error', 'Failed to update station')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (station: Station) => {
    if (!confirm(`Delete station "${station.name}"? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'stations', station.id))
      setStations((prev) => prev.filter((s) => s.id !== station.id))
      showMsg('success', 'Station deleted successfully')
    } catch (e) {
      console.error('Error deleting station:', e)
      showMsg('error', 'Failed to delete station')
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
          <h1 className="text-3xl font-bold text-foreground">Station Management</h1>
          <p className="text-muted-foreground">Manage shuttle pickup and drop-off stations</p>
        </div>
        <Button
          onClick={() => { setAddForm(defaultForm()); setIsAddOpen(true) }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Station
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Stations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stations.length}</div>
            <p className="text-xs text-muted-foreground">Registered in system</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Stations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{activeCount}</div>
            <p className="text-xs text-muted-foreground">
              {stations.length - activeCount} inactive
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expected Passengers/Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalExpected.toLocaleString()}</div>
            <p className="text-xs text-primary">Across all stations</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by station name..."
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

      {/* Stations Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Stations Overview</CardTitle>
          <CardDescription>{filteredStations.length} stations found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 text-left font-medium text-foreground">Name</th>
                  <th className="py-3 text-left font-medium text-foreground">Coordinates</th>
                  <th className="py-3 text-left font-medium text-foreground">Passengers/Day</th>
                  <th className="py-3 text-left font-medium text-foreground">Status</th>
                  <th className="py-3 text-left font-medium text-foreground">Last Updated</th>
                  <th className="py-3 text-center font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No stations found
                    </td>
                  </tr>
                ) : (
                  filteredStations.map((station) => (
                    <tr
                      key={station.id}
                      className="border-b border-border/50 hover:bg-sidebar-accent transition-colors"
                    >
                      <td className="py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                          {station.name}
                        </div>
                      </td>
                      <td className="py-3">
                        {station.lat || station.lng ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Navigation className="h-3 w-3" />
                            {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">Not set</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1 text-foreground font-medium">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {station.expectedPassengersPerDay.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge
                          className={
                            station.isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-gray-500/20 text-gray-400'
                          }
                        >
                          {station.isActive && <CheckCircle className="mr-1 h-3 w-3" />}
                          {station.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {formatTimestamp(station.lastUpdated)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(station)}
                            className="hover:bg-blue-500/10 text-blue-500 hover:text-blue-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(station)}
                            className="hover:bg-red-500/10 text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => !open && setIsAddOpen(false)}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Station</DialogTitle>
            <DialogDescription>Enter station details to add it to the system</DialogDescription>
          </DialogHeader>
          {/* ✅ Error INSIDE modal, at the top */}
          {message && message.type === 'error' && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {message.text}
            </div>
          )}
          <StationFormFields form={addForm} onChange={setAddForm} />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => setIsAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Station
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingStation} onOpenChange={(open) => !open && setEditingStation(null)}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Station</DialogTitle>
            <DialogDescription>
              Update details for &quot;{editingStation?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          {/* ✅ Error INSIDE modal, at the top */}
          {message && message.type === 'error' && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {message.text}
            </div>
          )}
          <StationFormFields form={editForm} onChange={setEditForm} />
          <DialogFooter>
            <Button
              variant="outline"
              className="border-border hover:bg-sidebar-accent bg-transparent"
              onClick={() => setEditingStation(null)}
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
    </div>
  )
}
