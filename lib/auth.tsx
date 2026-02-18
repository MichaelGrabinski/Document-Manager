"use client"

import { useState, useEffect, createContext, useContext, type ReactNode } from "react"
import type { User } from "./types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserCircle } from "lucide-react"

type AuthContextType = {
  user: User | null
  login: (username: string) => void
  windowsLogin: (username: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  hasRole: (role: string) => boolean
  users: User[]
  addUser: (name: string, roles: string[]) => void
  updateUserRoles: (name: string, roles: string[]) => void
  deleteUser: (name: string) => void
  lastError?: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Dev escape hatch: set NEXT_PUBLIC_DISABLE_AUTH=true to bypass auth UI entirely.
const DISABLE_AUTH = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [usernameInput, setUsernameInput] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [passwordInput, setPasswordInput] = useState("")
  const [lastError, setLastError] = useState<string|null>(null)
  const [autoDebug, setAutoDebug] = useState<string|undefined>()

  // If auth is disabled, immediately set a permissive demo user.
  useEffect(() => {
    if (!DISABLE_AUTH) return
    const demo: User = { name: 'demo', roles: ['admin', 'editor', 'viewer'] }
    setUser(demo)
    setUsers([demo])
    setIsLoading(false)
  }, [])

  // initial load from API
  useEffect(() => {
  if (DISABLE_AUTH) return
    let cancelled = false
    const load = async () => {
      try {
        // 1. Try auto Windows header login (if proxy provides header)
        // Try auto Windows header login regardless of build-time flag; server decides if enabled
        try {
          const autoRes = await fetch('/api/auth/auto')
          const txt = await autoRes.text()
          let autoJson: any = null
          try { autoJson = JSON.parse(txt) } catch {}
          if (autoRes.ok && autoJson?.success && autoJson.user) {
            setUser(autoJson.user)
            setAutoDebug('auto-success')
          } else {
            setAutoDebug(`auto-fail ${autoRes.status} ${(autoJson&&autoJson.reason)||''}`)
          }
        } catch (e:any) {
          setAutoDebug('auto-error')
        }
        // 2. Validate existing session cookie
        if (!user) {
          const sessionRes = await fetch('/api/auth/session')
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            if (sessionData?.authenticated && sessionData.user) {
              setUser(sessionData.user)
            }
          }
        }
        const res = await fetch('/api/users')
        const data = await res.json()
        if (!cancelled) setUsers(data || [])
      } catch (e) {
        console.error('Failed loading users', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const login = async (username: string) => {
    if (!username.trim()) return
    setIsSaving(true)
    try {
      setLastError(null)
      const baseRoles = username.toLowerCase().includes('admin') ? ['admin','editor','viewer'] : username.toLowerCase().includes('editor') ? ['editor','viewer'] : ['viewer']
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name: username.trim(), roles: baseRoles }) })
      const data = await res.json()
      if (data?.user) {
        setUser(data.user)
        sessionStorage.setItem('currentUserName', data.user.name)
        // refresh users list (ensure roles synced)
        setUsers(prev => {
          const idx = prev.findIndex(u=>u.name===data.user.name)
            if (idx === -1) return [...prev, data.user]
            const copy = [...prev]; copy[idx]=data.user; return copy
        })
      }
    } catch (e) {
      console.error('login failed', e)
      setLastError('Login failed')
    } finally {
      setIsSaving(false)
      setUsernameInput('')
    }
  }

  const windowsLogin = async (username: string, password: string) => {
    if (!username || !password) return
    setIsSaving(true)
    setLastError(null)
    try {
      const res = await fetch('/api/auth/windows', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await res.json()
      if (!res.ok) {
        setLastError(data?.error || 'Windows auth failed')
      } else if (data?.user) {
        const u: User = { name: data.user.name, roles: data.user.roles }
        setUser(u)
        sessionStorage.setItem('currentUserName', u.name)
        // refresh users list
        setUsers(prev => prev.find(p=>p.name===u.name) ? prev.map(p=>p.name===u.name?u:p) : [...prev, u])
      }
    } catch (e) {
      console.error('windows login error', e)
      setLastError('Windows auth error')
    } finally {
      setIsSaving(false)
      setUsernameInput('')
      setPasswordInput('')
    }
  }

  const handleLogin = () => {
    if (usernameInput.trim()) {
      login(usernameInput.trim())
    }
  }

  const logout = () => {
  fetch('/api/auth/logout', { method: 'POST' }).catch(()=>{})
  sessionStorage.removeItem('currentUserName')
  setUser(null)
  }

  const hasRole = (role: string): boolean => {
    return user?.roles.includes(role) ?? false
  }

  const addUser = async (name: string, roles: string[]) => {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim(), roles }) })
      const data = await res.json()
      if (data?.user) {
        setUsers(prev => prev.find(p=>p.name===data.user.name) ? prev.map(p=>p.name===data.user.name?data.user:p) : [...prev, data.user])
      }
    } finally { setIsSaving(false) }
  }

  const updateUserRoles = async (name: string, roles: string[]) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, roles }) })
      const data = await res.json()
      if (data?.user) {
        setUsers(prev => prev.map(u=>u.name===name?data.user:u))
        if (user?.name === name) setUser(data.user)
      }
    } finally { setIsSaving(false) }
  }

  const deleteUser = async (name: string) => {
    setIsSaving(true)
    try {
      await fetch('/api/users', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) })
      setUsers(prev => prev.filter(u=>u.name!==name))
      if (user?.name === name) logout()
    } finally { setIsSaving(false) }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading authentication...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-xs p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold text-center mb-4 text-gray-800 dark:text-gray-200">Login</h2>
          <p className="text-sm text-center mb-4 text-gray-600 dark:text-gray-400">Local demo login or Windows (AD) login if enabled.</p>
          {autoDebug && <p className="text-[10px] text-center mb-2 text-gray-500">Auto: {autoDebug}</p>}
          <div className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-gray-700 dark:text-gray-300">Username</Label>
              <Input id="username" type="text" value={usernameInput} onChange={(e)=>setUsernameInput(e.target.value)} placeholder="e.g., admin or jdoe" className="mt-1 w-full" />
            </div>
            <div>
              <Label htmlFor="password" className="text-gray-700 dark:text-gray-300 flex justify-between">
                <span>Password (Windows)</span>
                <button type="button" className="text-xs underline" onClick={()=>{ setPasswordInput(''); setLastError(null) }}>clear</button>
              </Label>
              <Input id="password" type="password" value={passwordInput} onChange={(e)=>setPasswordInput(e.target.value)} placeholder="Windows password" className="mt-1 w-full" />
            </div>
            <Button onClick={handleLogin} disabled={isSaving} className="w-full bg-slate-600 hover:bg-slate-700 text-white">{isSaving ? 'Signing in...' : 'Local Login'}</Button>
            <Button onClick={()=>windowsLogin(usernameInput.trim(), passwordInput)} disabled={isSaving || !passwordInput} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{isSaving ? 'Authenticating...' : 'Windows Login'}</Button>
            {lastError && <p className="text-xs text-red-500 text-center">{lastError}</p>}
          </div>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={{ user, login: (u:string)=>{void login(u)}, windowsLogin, logout, isLoading, hasRole, users, addUser, updateUserRoles, deleteUser, lastError }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const UserProfile = () => {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <UserCircle className="h-6 w-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">Roles: {user.roles.join(", ")}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
