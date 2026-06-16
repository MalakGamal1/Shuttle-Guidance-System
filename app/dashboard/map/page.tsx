'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const AdminMapClient = dynamic(() => import('./AdminMapClient'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full bg-background flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">جاري تحميل الخريطة...</p>
    </div>
  ),
})

export default function MapPage() {
  return <AdminMapClient />
}
