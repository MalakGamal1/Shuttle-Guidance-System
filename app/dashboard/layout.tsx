import React from "react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Just return children - the sidebar is already in the root layout
  return <>{children}</>
}
