import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth"
import { Toaster } from "@/components/ui/toaster"
import { SidebarProvider } from "@/components/ui/sidebar" // [^1]
import AppSidebar from "@/components/app-sidebar" // We'll create this
import Header from "@/components/header" // Moving Header here for consistent layout

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Document Manager",
  description: "Manage and search your documents efficiently.",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <SidebarProvider defaultOpen={true}>
              {" "}
              {/* [^1] Default sidebar to open */}
              <div className="flex min-h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1">
                  <Header /> {/* Header now part of the main content area next to sidebar */}
                  <main className="flex-1 p-4 md:p-6 lg:p-8 bg-muted/40">{children}</main>
                  <footer className="py-4 text-center text-sm text-muted-foreground border-t bg-background">
                    Document Manager App &copy; {new Date().getFullYear()}
                  </footer>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
