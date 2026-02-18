"use client"

import type { Document, Group } from "@/lib/types"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, Tag, CalendarDays, User, Trash2, Download, Eye, Brain, Sparkles, FileSearch } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import { useState } from 'react'

type DocumentCardProps = {
  doc: Document
  onDelete: (id: string) => void
  onView: (doc: Document) => void
  isTestModeEnabled: boolean
  onViewFullText: (doc: Document) => void
  group?: Group | null
}

export default function DocumentCard({ doc, onDelete, onView, isTestModeEnabled, onViewFullText, group }: DocumentCardProps) {
  const { hasRole } = useAuth()
  const canEditKeywords = hasRole('editor') || hasRole('admin')
  const [editing, setEditing] = useState(false)
  const [kwInput, setKwInput] = useState('')

  const saveKeywords = async (newKeywords: string[]) => {
    // optimistic UI update via direct mutation isn't ideal; instead dispatch event or callback.
    await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, name: doc.name, type: 'pdf', uploader: doc.uploader, groupId: doc.groupId, keywords: newKeywords, aiSummary: doc.aiSummary, aiExtractedKeywords: doc.aiExtractedKeywords, fullSimulatedText: doc.fullSimulatedText, originalFileName: doc.originalFileName, storedFileName: doc.storedFileName }) })
  }

  const handleAddKw = () => {
    if (!kwInput.trim()) return
    const add = kwInput.split(',').map(k=>k.trim()).filter(Boolean)
    const merged = Array.from(new Set([...(doc.keywords||[]), ...add]))
    saveKeywords(merged)
    ;(doc as any).keywords = merged
    setKwInput('')
  }
  const handleRemoveKw = (k: string) => {
    const filtered = (doc.keywords||[]).filter(x=>x!==k)
    saveKeywords(filtered)
    ;(doc as any).keywords = filtered
  }
  const groupRestricted = group && group.allowedRoles && group.allowedRoles.length > 0

  const buildServerUrl = () => doc.storedFileName ? `/api/file/${encodeURIComponent(doc.storedFileName)}` : null

  const handleDownload = () => {
    if (doc.file) {
      const url = URL.createObjectURL(doc.file)
      const a = document.createElement("a")
      a.href = url
      a.download = `${doc.name}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
    const serverUrl = buildServerUrl()
    if (serverUrl) {
      const a = document.createElement('a')
      a.href = serverUrl
      a.download = `${doc.name}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else {
      alert("Download not available.")
    }
  }

  const handleView = () => {
    if (doc.file) {
      onView(doc)
      return
    }
    const serverUrl = buildServerUrl()
    if (serverUrl) {
      // create a lightweight Document clone with a fetched Blob for viewer
      fetch(serverUrl).then(r=>r.blob()).then(blob => {
        const file = new File([blob], `${doc.name}.pdf`, { type: 'application/pdf' })
        onView({ ...doc, file })
      }).catch(()=> alert('Failed to load PDF'))
    } else {
      alert("Viewing not available.")
    }
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle
          className="flex items-center text-lg cursor-pointer hover:text-primary/80 truncate"
          onClick={handleView}
          title={doc.name}
        >
          <FileText className="mr-2 h-5 w-5 text-primary flex-shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-[170px] md:max-w-[190px] lg:max-w-[210px]">{doc.name}</span>
          {group && (
            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {group.name}
            </span>
          )}
          {groupRestricted && (
            <span className="ml-2 text-[10px] font-semibold px-1 py-0.5 rounded bg-purple-600 text-white">Restricted</span>
          )}
        </CardTitle>
        <CardDescription className="flex items-center text-xs text-muted-foreground">
          <CalendarDays className="mr-1 h-3 w-3" /> Uploaded on {new Date(doc.uploadedAt).toLocaleDateString()}
          <User className="ml-3 mr-1 h-3 w-3" /> By {doc.uploader}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-3">
        <div>
          <h4 className="text-sm font-medium mb-1 flex items-center">
            <Tag className="mr-1 h-4 w-4 text-muted-foreground" />
            Manual Keywords
          </h4>
          {doc.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {doc.keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="group relative">
                  {kw}
                  {canEditKeywords && (
                    <button className="ml-1 opacity-40 group-hover:opacity-100" onClick={(e)=>{ e.preventDefault(); handleRemoveKw(kw) }} title="Remove keyword">×</button>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No manual keywords.</p>
          )}
          {canEditKeywords && (
            <div className="mt-2 flex items-center gap-2">
              <Input placeholder="Add keywords (comma separated)" value={kwInput} onChange={e=>setKwInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); handleAddKw() } }} />
              <Button type="button" size="sm" variant="outline" onClick={handleAddKw}>Add</Button>
            </div>
          )}
        </div>

        {doc.aiExtractedKeywords && doc.aiExtractedKeywords.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center">
              <Sparkles className="mr-1 h-4 w-4 text-amber-500" />
              AI Extracted Keywords
            </h4>
            <div className="flex flex-wrap gap-1">
              {doc.aiExtractedKeywords.map((kw) => (
                <Badge key={kw} variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {doc.aiSummary && (
          <div>
            <h4 className="text-sm font-medium mb-1 flex items-center">
              <Brain className="mr-1 h-4 w-4 text-sky-500" />
              AI Summary
            </h4>
            <p className="text-sm text-muted-foreground line-clamp-3">{doc.aiSummary}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center pt-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleView}
            className="bg-background text-foreground hover:bg-accent"
            disabled={!doc.file && !doc.storedFileName}
          >
            <Eye className="mr-1 h-4 w-4" /> View
          </Button>
          {isTestModeEnabled && doc.fullSimulatedText && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewFullText(doc)}
              className="bg-background text-foreground hover:bg-accent"
              title="View Extracted Text"
            >
              <FileSearch className="mr-1 h-4 w-4" /> Text
            </Button>
          )}
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="bg-background text-foreground hover:bg-accent"
            title="Download"
            disabled={!doc.file}
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Download</span>
          </Button>
          {(hasRole("editor") || hasRole("admin")) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(doc.id)}
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
