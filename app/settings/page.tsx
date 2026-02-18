"use client"
import { useState, useRef, useEffect } from "react"
import { useAuth } from "@/lib/auth"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import type { Group } from "@/lib/types"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"

export default function SettingsPage() {
  const [folderFiles, setFolderFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, { status: 'queued'|'processing'|'success'|'error'; message?: string }>>({})
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  useEffect(() => {
    // load groups for assignment
    fetch('/api/groups').then(r=>r.json()).then((gs:Group[]) => {
      setGroups(gs.map(g=>({ ...g, searchKeys: Array.isArray(g.searchKeys)?g.searchKeys:[], allowedRoles: Array.isArray(g.allowedRoles)?g.allowedRoles:[] })))
    }).catch(()=>{})
  }, [])
  const { toast } = useToast()
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const { users, addUser, updateUserRoles, deleteUser, user } = useAuth()
  const [newUserName, setNewUserName] = useState("")
  const [newUserRoles, setNewUserRoles] = useState("viewer")
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editingRoles, setEditingRoles] = useState("")

  useEffect(() => {
    if (folderInputRef.current) {
      // Add non-typed directory selection attributes
      folderInputRef.current.setAttribute("webkitdirectory", "")
      folderInputRef.current.setAttribute("directory", "")
    }
  }, [])

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
  const pdfs = fileList.filter(f => f.type === "application/pdf")
  setFolderFiles(pdfs)
  const statusMap: Record<string, {status:'queued'|'processing'|'success'|'error'; message?:string}> = {}
  pdfs.forEach(f=> statusMap[f.name] = { status: 'queued' })
  setUploadStatuses(statusMap)
  toast({ title: "Folder scanned", description: `${pdfs.length} PDF(s) ready.` })
  }

  const handleMassUpload = async () => {
    if (folderFiles.length === 0) {
      toast({ variant: "destructive", title: "No PDFs", description: "Select a folder with PDF files first." })
      return
    }
    setIsUploading(true)
    let success = 0
    for (const f of folderFiles) {
      setUploadStatuses(prev => ({ ...prev, [f.name]: { status: 'processing' } }))
      const fd = new FormData()
      fd.append('file', f)
      fd.append('uploader', user?.name || 'unknown')
      if (selectedGroupId) fd.append('groupId', selectedGroupId)
      // Provide overrideName without folder prefix
      const cleanName = f.name.split(/[\\/]/).pop() || f.name
      fd.append('overrideName', cleanName)
      try {
        const res = await fetch('/api/documents/create-from-upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok || data?.error) {
          setUploadStatuses(prev => ({ ...prev, [f.name]: { status: 'error', message: data?.error || res.statusText } }))
        } else {
          success++
          setUploadStatuses(prev => ({ ...prev, [f.name]: { status: 'success' } }))
        }
      } catch (err:any) {
        setUploadStatuses(prev => ({ ...prev, [f.name]: { status: 'error', message: err?.message || 'Failed' } }))
      }
    }
    setIsUploading(false)
    toast({ title: 'Mass Upload Complete', description: `${success}/${folderFiles.length} processed.` })
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="space-y-4 border p-4 rounded-md">
        <h2 className="text-lg font-medium">User & Role Management</h2>
  <p className="text-sm text-muted-foreground">Manage users & roles (stored in DB). Roles are comma-separated.</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="newUser">Username</Label>
            <Input id="newUser" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="e.g., analyst" />
          </div>
            <div className="flex-1 min-w-[160px]">
            <Label htmlFor="newUserRoles">Roles (comma)</Label>
            <Input id="newUserRoles" value={newUserRoles} onChange={(e) => setNewUserRoles(e.target.value)} placeholder="viewer,editor" />
          </div>
          <Button
            onClick={async () => {
              if (!newUserName.trim()) return
              const roles = newUserRoles.split(",").map(r => r.trim()).filter(r => r)
              await addUser(newUserName.trim(), roles.length ? roles : ["viewer"]) 
              setNewUserName("")
              toast({ title: "User added" })
            }}
            className="bg-slate-600 hover:bg-slate-700 text-white"
          >Add User</Button>
        </div>
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.name} className="border rounded p-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <span className="font-medium">{u.name}</span>{u.name === user?.name && <span className="ml-2 text-xs px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">current</span>}<br />
                <span className="text-xs text-muted-foreground">Roles: {u.roles.join(", ")}</span>
              </div>
              {editingUser === u.name ? (
                <div className="flex flex-col gap-2 w-full md:w-auto">
                  <Input value={editingRoles} onChange={(e) => setEditingRoles(e.target.value)} placeholder="admin,editor,viewer" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => { await updateUserRoles(u.name, editingRoles.split(",").map(r=>r.trim()).filter(r=>r)); setEditingUser(null); toast({ title: "Roles updated" }) }}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditingUser(u.name); setEditingRoles(u.roles.join(", ")) }}>Edit Roles</Button>
                  <Button size="sm" variant="destructive" onClick={async () => { await deleteUser(u.name); toast({ title: "User deleted" }) }}>Delete</Button>
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && <p className="text-xs text-muted-foreground">No users defined.</p>}
        </div>
      </section>
      <section className="space-y-4 border p-4 rounded-md">
        <h2 className="text-lg font-medium">Mass Upload (Folder)</h2>
        <p className="text-sm text-muted-foreground">Select a folder (or multiple files) of PDFs. Your browser will expose the files; they aren't uploaded until you click Mass Upload.</p>
        <div>
          <Label className="block mb-1 text-sm font-medium">Assign Group (optional)</Label>
          <Select value={selectedGroupId || ''} onValueChange={(val)=> setSelectedGroupId(val==='none'?null:val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Group</SelectItem>
              {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="folder-input" className="block mb-1 text-sm font-medium">Select Folder</Label>
          <Input id="folder-input" type="file" ref={folderInputRef} multiple onChange={handleFolderSelect} />
          <p className="text-xs text-muted-foreground mt-1">Browser support required (Chromium-based for directory mode).</p>
        </div>
        {folderFiles.length > 0 && (
          <div className="text-sm text-muted-foreground">{folderFiles.length} PDF(s) queued.</div>
        )}
        {folderFiles.length > 0 && (
          <div className="max-h-64 overflow-auto border rounded p-2 space-y-1 text-xs">
            {folderFiles.map(f => {
              const s = uploadStatuses[f.name]?.status || 'queued'
              const msg = uploadStatuses[f.name]?.message
              let color = 'text-gray-500'
              if (s==='processing') color='text-blue-600'
              else if (s==='success') color='text-green-600'
              else if (s==='error') color='text-red-600'
              return <div key={f.name} className="flex justify-between gap-2"><span className="truncate max-w-[60%]" title={f.name}>{f.name}</span><span className={`${color}`}>{s}{msg?`: ${msg}`:''}</span></div>
            })}
          </div>
        )}
        <Button onClick={handleMassUpload} disabled={isUploading || folderFiles.length === 0} className="bg-slate-600 hover:bg-slate-700 text-white">
          {isUploading ? "Uploading..." : "Mass Upload PDFs"}
        </Button>
      </section>
    </div>
  )
}
