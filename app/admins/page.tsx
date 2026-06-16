'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import { useRouter } from 'next/navigation'
import { RouteGuard } from '@/components/route-guard'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Trash2, Edit2, Plus, Search, AlertCircle, Eye, EyeOff, Ban, Check } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { db, getSecondaryAuth } from '@/lib/firebase'
import { doc, setDoc, deleteDoc, collection, getDocs, updateDoc, onSnapshot } from 'firebase/firestore'
import { canDeleteAdmin, canEditAdmin, shouldDisableDeleteButton, shouldDisableEditButton } from '@/lib/admin-protection'
import { getDefaultAvatarUrl } from '@/lib/assets'

interface Admin {
  uid: string
  name: string
  email: string
  phone?: string
  role: 'root' | 'admin'
  createdAt: string
  status: 'Active' | 'Inactive'
  suspended?: boolean
  lastLogin?: string
}

function AdminsPageContent() {
  const { role, loading, user } = useAuth()
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [search, setSearch] = useState('')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState<Partial<Admin> | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)

  useEffect(() => {
    if (!loading && role !== 'root') {
      router.push('/dashboard')
    }
  }, [loading, role, router])

  useEffect(() => {
    if (!user) return

    const adminsRef = collection(db, 'admins')
    setIsPageLoading(true)

    const unsubscribe = onSnapshot(
      adminsRef,
      (snapshot) => {
        const adminsList: Admin[] = snapshot.docs.map((d) => {
          const data = d.data()
          
          // Determine status dynamically:
          // - Current user is always Active
          // - Others must have status === 'active' AND lastActiveAt within last 10 minutes AND suspended !== true
          let isActive = false
          if (d.id === user.uid) {
            isActive = true
          } else if (data.status === 'active' && data.suspended !== true) {
            if (data.lastActiveAt) {
              let activeTimeMs = 0
              if (typeof data.lastActiveAt.toDate === 'function') {
                activeTimeMs = data.lastActiveAt.toDate().getTime()
              } else {
                activeTimeMs = new Date(data.lastActiveAt).getTime()
              }
              const tenMinsAgo = Date.now() - 10 * 60 * 1000
              if (activeTimeMs > tenMinsAgo) {
                isActive = true
              }
            }
          }

          return {
            uid: d.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            role: data.role || 'admin',
            createdAt: data.createdAt || new Date().toISOString(),
            status: isActive ? 'Active' : 'Inactive',
            suspended: data.suspended ?? false,
            lastLogin: data.lastLogin || null,
          }
        })
        setAdmins(adminsList)
        setIsPageLoading(false)
      },
      (err) => {
        console.error('[Admins] Realtime listener error:', err)
        setMessage({ type: 'error', text: 'Failed to load admins in realtime' })
        setIsPageLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user])

  const handleToggleSuspend = async (uid: string, suspend: boolean) => {
    if (uid === user?.uid) {
      setMessage({ type: 'error', text: 'You cannot suspend your own account' })
      return
    }
    try {
      await updateDoc(doc(db, 'admins', uid), {
        suspended: suspend,
        // Invalidate session immediately if suspending
        ...(suspend ? { sessionValid: false, status: 'inactive' } : {})
      })
      setMessage({
        type: 'success',
        text: `Admin has been successfully ${suspend ? 'suspended' : 'unsuspended'}`
      })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('[Admins] Error toggling suspension:', err)
      setMessage({ type: 'error', text: 'Failed to update suspension status' })
    }
  }

  const filteredAdmins = admins.filter((admin) => {
    if (!admin.name || !admin.email) return false
    return (
      admin.name.toLowerCase().includes(search.toLowerCase()) ||
      admin.email.toLowerCase().includes(search.toLowerCase())
    )
  })

  const handleAddAdmin = () => {
    setFormData({ name: '', email: '', phone: '', role: 'admin', status: 'Active' })
    setPassword('')
    setIsAddDialogOpen(true)
  }

  const handleEditAdmin = (admin: Admin) => {
    const { canEdit, error } = canEditAdmin(admin.uid, user?.uid, role, admin.role)
    if (!canEdit) {
      setMessage({ type: 'error', text: error || 'Edit not allowed' })
      return
    }
    setFormData(admin)
    setSelectedAdmin(admin)
    setIsEditDialogOpen(true)
  }

  const handleDeleteAdmin = async (uid: string, adminRole?: 'root' | 'admin') => {
    // Check if deletion is allowed using centralized protection
    const { canDelete, error } = canDeleteAdmin(uid, user?.uid, role, adminRole)

    if (!canDelete) {
      setMessage({ type: 'error', text: error || 'Deletion not allowed' })
      return
    }

    if (!confirm('Are you sure you want to delete this admin account?')) return

    try {
      await deleteDoc(doc(db, 'admins', uid))
      setAdmins(admins.filter((admin) => admin.uid !== uid))
      setMessage({ type: 'success', text: 'Admin deleted successfully' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete admin' })
    }
  }

  const handleSaveAdmin = async () => {
    if (!formData?.email || !formData?.name) {
      setMessage({ type: 'error', text: 'Please fill all required fields' })
      return
    }

    setIsSaving(true)
    try {
      if (!selectedAdmin) {
        // Create new admin
        if (!password) {
          setMessage({ type: 'error', text: 'Please set a password for new admin' })
          setIsSaving(false)
          return
        }

        // Create account using secondary auth to avoid switching current session.
        const secondaryAuth = getSecondaryAuth()
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, password)
        await updateProfile(userCredential.user, { displayName: formData.name })

        // Save to Firestore with phone number
        const adminData = {
          uid: userCredential.user.uid,
          fullName: formData.name,
          email: formData.email,
          phone: formData.phone ? formData.phone.trim() : '', // Ensure phone is saved even if empty
          role: formData.role || 'admin',
          createdAt: new Date().toISOString(),
          status: 'Active',
          suspended: false,
          emailVerified: false,
          avatar: getDefaultAvatarUrl(),
          photoURL: getDefaultAvatarUrl(),
        }

        await setDoc(doc(db, 'admins', userCredential.user.uid), adminData)

        // Important: ensure we don't keep the secondary session alive.
        await signOut(secondaryAuth)

        setAdmins([
          ...admins,
          {
            uid: userCredential.user.uid,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            role: formData.role || 'admin',
            createdAt: new Date().toISOString(),
            status: 'Active',
          },
        ])
        setMessage({ type: 'success', text: 'Admin created successfully' })
        setIsAddDialogOpen(false)
      } else {
        // Update existing admin
        const { canEdit, error } = canEditAdmin(selectedAdmin.uid, user?.uid, role, selectedAdmin.role)
        if (!canEdit) {
          setMessage({ type: 'error', text: error || 'Edit not allowed' })
          return
        }

        const updateData = {
          fullName: formData.name,
          email: formData.email,
          phone: formData.phone || '',
          role: formData.role || 'admin',
          // Status is session-driven, not manually editable
        }

        await updateDoc(doc(db, 'admins', selectedAdmin.uid), updateData)

        setAdmins(
          admins.map((adm) =>
            adm.uid === selectedAdmin.uid
              ? { ...adm, ...formData }
              : adm
          )
        )
        setMessage({ type: 'success', text: 'Admin updated successfully' })
        setIsEditDialogOpen(false)
        setSelectedAdmin(null)
      }
      setFormData(null)
      setPassword('')
      setTimeout(() => setMessage(null), 3000)
    } catch (err: any) {
      let errorText = 'Failed to save admin'
      if (err.code === 'auth/email-already-in-use') errorText = 'Email already in use'
      else if (err.code === 'auth/weak-password') errorText = 'Password too weak (min 6 characters)'
      setMessage({ type: 'error', text: errorText })
    } finally {
      setIsSaving(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (role !== 'root') {
    return (
      <div className="space-y-8 p-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only Root Administrators can access this page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {isPageLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading admins...</p>
        </div>
      )}

      {!isPageLoading && (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Manage Admins</h1>
              <p className="text-muted-foreground">View and manage system administrator accounts</p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAddAdmin} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Admin
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border bg-card">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Add New Admin</DialogTitle>
                  <DialogDescription>Create a new administrator account</DialogDescription>
                </DialogHeader>
                {/* ✅ Error INSIDE modal, at the top */}
                {message && message.type === 'error' && (
                  <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {message.text}
                  </div>
                )}
                {formData && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">Full Name *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="bg-input text-foreground"
                        placeholder="Enter full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Email Address *</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="bg-input text-foreground"
                        placeholder="Enter email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Phone Number</Label>
                      <Input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="bg-input text-foreground"
                        placeholder="+20 123 456 7890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Password *</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-input text-foreground pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                          placeholder="Enter password (min 6 characters)"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Role</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => setFormData({ ...formData, role: value as 'root' | 'admin' })}
                      >
                        <SelectTrigger className="border-border bg-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="root">Root Admin</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="border-border hover:bg-sidebar-accent bg-transparent"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAdmin} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {isSaving ? 'Creating...' : 'Create Admin'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search admins by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-input text-foreground pl-10"
              />
            </div>
          </div>

          {/* Admins Table */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">System Administrators</CardTitle>
              <CardDescription>{filteredAdmins.length} admins found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmins.map((admin) => (
                      <tr key={admin.uid} className="border-b border-border/50 hover:bg-sidebar-accent transition-colors">
                        <td className="px-4 py-3 text-foreground font-medium">{admin.name}</td>
                        <td className="px-4 py-3 text-foreground text-sm">{admin.email}</td>
                        <td className="px-4 py-3 text-foreground text-sm">{admin.phone || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${admin.role === 'root' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                            {admin.role === 'root' ? 'Root Admin' : 'Admin'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {admin.status === 'Active' && !admin.suspended && (
                              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                            <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                              admin.suspended
                                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                : admin.status === 'Active'
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                            }`}>
                              {admin.suspended ? 'Suspended' : admin.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAdmin(admin)}
                              className="hover:bg-blue-500/10 text-blue-500 hover:text-blue-600"
                              disabled={
                                admin.uid === user?.uid ||
                                shouldDisableEditButton(admin.uid, user?.uid, role, admin.role)
                              }
                              title={
                                admin.uid === user?.uid
                                  ? 'You cannot edit your own admin account'
                                  : shouldDisableEditButton(admin.uid, user?.uid, role, admin.role)
                                    ? 'This admin cannot be edited'
                                    : 'Edit admin'
                              }
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            
                            {admin.uid !== user?.uid && (
                              admin.suspended ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleSuspend(admin.uid, false)}
                                  className="hover:bg-green-500/10 text-green-500 hover:text-green-600"
                                  title="Unsuspend Admin"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleSuspend(admin.uid, true)}
                                  className="hover:bg-yellow-500/10 text-yellow-500 hover:text-yellow-600"
                                  title="Suspend Admin"
                                  disabled={admin.role === 'root'}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAdmin(admin.uid, admin.role)}
                              className="hover:bg-red-500/10 text-red-500 hover:text-red-600"
                              disabled={
                                admin.uid === user?.uid ||
                                shouldDisableDeleteButton(admin.uid, user?.uid, role, admin.role)
                              }
                              title={
                                admin.uid === user?.uid
                                  ? 'You cannot delete your own admin account'
                                  : shouldDisableDeleteButton(admin.uid, user?.uid, role, admin.role)
                                    ? 'This admin cannot be deleted'
                                    : 'Delete admin'
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="text-foreground">Edit Admin</DialogTitle>
                <DialogDescription>Update administrator information</DialogDescription>
              </DialogHeader>
              {/* ✅ Error INSIDE modal, at the top */}
              {message && message.type === 'error' && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {message.text}
                </div>
              )}
              {formData && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Full Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-input text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Email Address</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="bg-input text-foreground"
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Phone Number</Label>
                    <Input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="bg-input text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) => setFormData({ ...formData, role: value as 'root' | 'admin' })}
                    >
                      <SelectTrigger className="border-border bg-input">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">Root Admin</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Status</Label>
                    <p className="text-sm text-muted-foreground px-3 py-2 border border-border rounded-md bg-input/50">
                      {selectedAdmin?.uid === user?.uid ? 'Active' : (selectedAdmin?.status || 'Inactive')}
                      <span className="text-xs text-muted-foreground ml-2">(determined by session)</span>
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  className="border-border hover:bg-sidebar-accent bg-transparent"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setSelectedAdmin(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveAdmin} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

export default function AdminsPage() {
  return (
    <RouteGuard requiredRole="root">
      <AdminsPageContent />
    </RouteGuard>
  )
}
