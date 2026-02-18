"use client"

import { DialogTrigger } from "@/components/ui/dialog"

import { useState, useEffect, useMemo, useCallback } from "react"
import SearchBar from "@/components/search-bar"
import DocumentList from "@/components/document-list"
import DocumentUploadForm from "@/components/document-upload-form"
import type { Document, Group } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { PlusCircle, TestTube2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import AppSidebarClient from "@/components/app-sidebar"
import DocumentViewer from "@/components/document-viewer"
import EditGroupForm from "@/components/edit-group-form"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function HomePage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [isEditGroupDialogOpen, setIsEditGroupDialogOpen] = useState(false)
  const [isTestModeEnabled, setIsTestModeEnabled] = useState(false)
  const [viewingFullTextDoc, setViewingFullTextDoc] = useState<Document | null>(null)

  const { user, hasRole } = useAuth()

  useEffect(() => {
    // Load documents from backend API
    fetch("/api/documents")
      .then((res) => res.json())
      .then((docs) => {
        setDocuments(
          docs.map((doc: any) => ({
            ...doc,
            uploadedAt: new Date(doc.uploadedAt),
            keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
            aiExtractedKeywords: Array.isArray(doc.aiExtractedKeywords) ? doc.aiExtractedKeywords : [],
          })),
        )
      })
      .catch(() => setDocuments([]))
    // Load groups from backend API
    fetch("/api/groups")
      .then(res => res.json())
      .then(gs => setGroups(gs.map((g: any) => ({
        ...g,
        searchKeys: Array.isArray(g.searchKeys) ? g.searchKeys : [],
        allowedRoles: Array.isArray(g.allowedRoles) ? g.allowedRoles : [],
      }))))
      .catch(() => setGroups([{ id: "default-group", name: "General", parentId: null, searchKeys: ["general", "uncategorized"] }]))
    // Test mode still from localStorage
    if (typeof window !== "undefined") {
      const storedTestMode = localStorage.getItem("isTestModeEnabled")
      if (storedTestMode) {
        setIsTestModeEnabled(JSON.parse(storedTestMode))
      }
    }
  }, [])

  useEffect(() => {
    function handleGroupDeleted(e: any) {
      const id = e.detail?.id
      if (id) setGroups(g => g.filter(gr => gr.id !== id))
    }
    window.addEventListener('group-deleted', handleGroupDeleted)
    return () => window.removeEventListener('group-deleted', handleGroupDeleted)
  }, [])

  // Removed automatic syncing; now using direct API calls in handlers

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("isTestModeEnabled", JSON.stringify(isTestModeEnabled))
    }
  }, [isTestModeEnabled])

  const handleAddDocument = (newDoc: Document) => {
    // Enforce group allowedRoles if any
    if (newDoc.groupId) {
      const group = groups.find(g => g.id === newDoc.groupId)
      if (group?.allowedRoles && group.allowedRoles.length > 0) {
        const hasAllowed = group.allowedRoles.some(r => user?.roles.includes(r))
        if (!hasAllowed) {
          alert("You do not have permission to add documents to this group.")
          return
        }
      }
    }
    setDocuments((prevDocs) => [newDoc, ...prevDocs])
    // Persist immediately
    fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDoc),
    })
    setIsUploadDialogOpen(false)
  }

  const handleDeleteDocument = (id: string) => {
    const doc = documents.find(d => d.id === id)
    if (!doc) return
    // Base role requirement
    if (!hasRole("editor") && !hasRole("admin")) return
    // Group specific allowedRoles check
    if (doc.groupId) {
      const group = groups.find(g => g.id === doc.groupId)
      if (group?.allowedRoles && group.allowedRoles.length > 0) {
        const hasAllowed = group.allowedRoles.some(r => user?.roles.includes(r))
        if (!hasAllowed) return
      }
    }
    setDocuments((prevDocs) => prevDocs.filter((doc) => doc.id !== id))
    fetch("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
  }

  const handleViewDocument = (doc: Document) => {
    if (doc.file) {
      setViewingDocument(doc)
    } else {
      alert("Viewing not available. File data is only kept for the current session.")
    }
  }

  const handleAddGroup = useCallback(
    (groupName: string, parentId: string | null = null) => {
      if (!hasRole("admin")) return
      const newGroup: Group = { id: crypto.randomUUID(), name: groupName, parentId: parentId, searchKeys: [] }
      setGroups((prevGroups) => [...prevGroups, newGroup])
      fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newGroup) })
    },
    [hasRole],
  )

  const handleOpenEditGroupDialog = useCallback((group: Group) => {
    setEditingGroup(group)
    setIsEditGroupDialogOpen(true)
  }, [])

  const handleUpdateGroup = useCallback((updatedGroupData: Partial<Group> & { id: string }) => {
    setGroups((prevGroups) => prevGroups.map((g) => (g.id === updatedGroupData.id ? { ...g, ...updatedGroupData } : g)))
    fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedGroupData) })
    setIsEditGroupDialogOpen(false)
    setEditingGroup(null)
  }, [])

  const handleSearchInGroup = useCallback(() => {
    setSearchTerm("")
  }, [])

  const handleViewFullText = useCallback((doc: Document) => {
    setViewingFullTextDoc(doc)
  }, [])

  const getSubGroupIds = useCallback((groupId: string, allGroups: Group[]): string[] => {
    let ids: string[] = [groupId]
    const children = allGroups.filter((g) => g.parentId === groupId)
    children.forEach((child) => {
      ids = [...ids, ...getSubGroupIds(child.id, allGroups)]
    })
    return ids
  }, [])

  // Debounce searchTerm to reduce recalculation while typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 140)
    return () => clearTimeout(t)
  }, [searchTerm])

  const filteredDocuments = useMemo(() => {
  let docsToFilter = documents
    let groupSearchKeys: string[] = []

    if (selectedGroupId) {
      const allGroupIdsToFilter = getSubGroupIds(selectedGroupId, groups)
      docsToFilter = documents.filter((doc) => doc.groupId && allGroupIdsToFilter.includes(doc.groupId))
      let currentGroup = groups.find((g) => g.id === selectedGroupId)
      while (currentGroup) {
        if (currentGroup.searchKeys) groupSearchKeys.push(...currentGroup.searchKeys)
        currentGroup = groups.find((g) => g.id === currentGroup?.parentId)
      }
      groupSearchKeys = [...new Set(groupSearchKeys)]
    }

  if (!debouncedSearchTerm.trim() && (!selectedGroupId || groupSearchKeys.length === 0)) {
      return docsToFilter
    }

  const lowerSearchTerm = debouncedSearchTerm.toLowerCase()
  // Support multi-term queries separated by comma or whitespace; all terms must match (AND logic)
  const terms = lowerSearchTerm.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean)

    return docsToFilter.filter((doc) => {
      // Pre-lowercase heavy fields once per doc for multi-term search to reduce repeated work
      const lowName = doc.name.toLowerCase()
      const lowKeywords = doc.keywords.map(k=>k.toLowerCase())
      const lowAiKeywords = (doc.aiExtractedKeywords||[]).map(k=>k.toLowerCase())
      const lowSummary = doc.aiSummary ? doc.aiSummary.toLowerCase() : ''
      const lowFull = doc.fullSimulatedText ? doc.fullSimulatedText.toLowerCase() : ''
      // Group role access enforcement
      if (doc.groupId) {
        const group = groups.find(g => g.id === doc.groupId)
        if (group && group.allowedRoles && group.allowedRoles.length > 0) {
          const hasAllowed = group.allowedRoles.some(r => user?.roles.includes(r))
          if (!hasAllowed) return false
        }
      }
      function docMatchesAllTerms() {
        if (terms.length === 0) return true
        return terms.every(term => {
          const nameMatch = lowName.includes(term)
            || lowKeywords.some(kw=>kw.includes(term))
            || lowAiKeywords.some(kw=>kw.includes(term))
            || (lowSummary && lowSummary.includes(term))
            || (lowFull && lowFull.includes(term))
          return nameMatch
        })
      }

      const groupKeyDocMatch =
        selectedGroupId &&
        groupSearchKeys.length > 0 &&
        groupSearchKeys.some(gsk => {
          const term = gsk.toLowerCase()
          return lowName.includes(term) || lowKeywords.some(k=>k.includes(term)) || lowAiKeywords.some(k=>k.includes(term)) || (lowSummary && lowSummary.includes(term)) || (lowFull && lowFull.includes(term))
        })

    if (debouncedSearchTerm.trim()) {
        const termSearch = docMatchesAllTerms()
        if (selectedGroupId && groupSearchKeys.length > 0) {
          return termSearch || groupKeyDocMatch
        }
        return termSearch
      } else if (selectedGroupId && groupSearchKeys.length > 0) {
        return groupKeyDocMatch
      }
      return true
    })
  }, [documents, debouncedSearchTerm, selectedGroupId, groups, getSubGroupIds])

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Please log in to access the document manager.</p>
      </div>
    )
  }

  return (
  <div className="flex min-h-full">
      <AppSidebarClient
        groups={groups}
  documents={documents}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        onAddGroup={handleAddGroup}
        onOpenEditGroupDialog={handleOpenEditGroupDialog}
        onSearchInGroup={handleSearchInGroup}
      />

      {/* Main content area - fixed layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Fixed header with search and controls */}
        <div className="flex-shrink-0 p-4 md:p-6 border-b bg-background">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:flex-grow">
              <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant={isTestModeEnabled ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIsTestModeEnabled(!isTestModeEnabled)}
                className="w-full sm:w-auto"
                title={isTestModeEnabled ? "Disable Test Mode" : "Enable Test Mode"}
              >
                <TestTube2 className="mr-2 h-4 w-4" />
                Test Mode {isTestModeEnabled ? "On" : "Off"}
              </Button>
              {(hasRole("editor") || hasRole("admin")) && (
                <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto bg-slate-600 hover:bg-slate-700 text-white" title="Select one or many PDF files">
                      <PlusCircle className="mr-2 h-5 w-5" /> Upload / Mass Upload
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                      <DialogTitle>Upload New Document</DialogTitle>
                    </DialogHeader>
                    <DocumentUploadForm onDocumentAdd={handleAddDocument} groups={groups} />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
  <div className="flex-1 p-4 md:p-6 min-h-0">
          <DocumentList
            documents={filteredDocuments}
            onDeleteDocument={handleDeleteDocument}
            onViewDocument={handleViewDocument}
            isTestModeEnabled={isTestModeEnabled}
            onViewFullText={handleViewFullText}
            groups={groups}
          />
        </div>
      </div>

      <DocumentViewer
        doc={viewingDocument}
        isOpen={!!viewingDocument}
        onOpenChange={(isOpen) => {
          if (!isOpen) setViewingDocument(null)
        }}
      />

      {editingGroup && (
        <Dialog open={isEditGroupDialogOpen} onOpenChange={setIsEditGroupDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Group: {editingGroup.name}</DialogTitle>
            </DialogHeader>
            <EditGroupForm
              group={editingGroup}
              onUpdateGroup={handleUpdateGroup}
              onClose={() => setIsEditGroupDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog for Viewing Full Extracted Text */}
      {viewingFullTextDoc && (
        <Dialog
          open={!!viewingFullTextDoc}
          onOpenChange={(isOpen) => {
            if (!isOpen) setViewingFullTextDoc(null)
          }}
        >
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Full Extracted Text: {viewingFullTextDoc.name}</DialogTitle>
              <DialogDescription>
                This shows the text content that was extracted/analyzed from the PDF.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[60vh] mt-4 p-4 border rounded-md bg-muted/20">
              <pre className="text-sm whitespace-pre-wrap break-words">{viewingFullTextDoc.fullSimulatedText}</pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
