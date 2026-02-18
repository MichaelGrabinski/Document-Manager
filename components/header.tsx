"use client"

import { UserProfile } from "@/lib/auth"
import { SidebarTrigger } from "@/components/ui/sidebar" // [^1]

export default function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <SidebarTrigger className="md:hidden" /> {/* [^1] Trigger for mobile */}
      <div className="flex items-center">{/* Optional: Can add breadcrumbs or page title here later */}</div>
      <div className="ml-auto flex items-center gap-2">
        <UserProfile />
      </div>
    </header>
  )
}
