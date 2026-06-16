'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Bell, Eye, Moon, Sun } from 'lucide-react'

type SettingsType = {
  emailNotifications: boolean
  pushNotifications: boolean
  dataRetention: string
  timeFormat: string
  updateFrequency: string
}

type ToggleKey = 'emailNotifications' | 'pushNotifications'
type ChangeKey = 'dataRetention' | 'timeFormat' | 'updateFrequency'

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType>({
    emailNotifications: true,
    pushNotifications: false,
    dataRetention: '90',
    timeFormat: '24h',
    updateFrequency: 'realtime',
  })

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleToggle = (key: ToggleKey) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleChange = (key: ChangeKey, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  if (!mounted) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Customize your dashboard preferences and system settings</p>
      </div>

      {/* Notification Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>Manage how you receive alerts and updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive alerts and updates via email</p>
            </div>
            <Switch checked={settings.emailNotifications} onCheckedChange={() => handleToggle('emailNotifications')} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-sm text-muted-foreground">Get instant notifications on your device</p>
            </div>
            <Switch checked={settings.pushNotifications} onCheckedChange={() => handleToggle('pushNotifications')} />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Update Frequency</Label>
            <Select value={settings.updateFrequency} onValueChange={value => handleChange('updateFrequency', value)}>
              <SelectTrigger className="border-border bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Real-time Updates</SelectItem>
                <SelectItem value="5min">Every 5 Minutes</SelectItem>
                <SelectItem value="15min">Every 15 Minutes</SelectItem>
                <SelectItem value="30min">Every 30 Minutes</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Eye className="h-5 w-5 text-primary" />
            Display Preferences
          </CardTitle>
          <CardDescription>Customize the appearance and layout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dark Mode Switch */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">Use dark theme across the dashboard</p>
              </div>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>

          {/* Time Format */}
          <div className="space-y-2">
            <Label className="text-foreground">Time Format</Label>
            <Select value={settings.timeFormat} onValueChange={value => handleChange('timeFormat', value)}>
              <SelectTrigger className="border-border bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-Hour Format</SelectItem>
                <SelectItem value="12h">12-Hour Format</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Settings className="h-5 w-5 text-primary" />
            System Information
          </CardTitle>
          <CardDescription>Details about your system and current version</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <p className="text-sm text-muted-foreground">Application Version</p>
            <p className="font-medium text-foreground">2.1.0</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <p className="text-sm text-muted-foreground">Last Updated</p>
            <p className="font-medium text-foreground">Mar 1, 2024</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <p className="text-sm text-muted-foreground">API Version</p>
            <p className="font-medium text-foreground">1.5.2</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
