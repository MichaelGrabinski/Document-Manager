"use client"

import type { Document, Group } from "@/lib/types"
import { useMemo } from "react"
import { useAuth } from "@/lib/auth"
import DocumentCard from "./document-card"

type DocumentListProps = {
  documents: Document[]
  onDeleteDocument: (id: string) => void
  onViewDocument: (doc: Document) => void
  isTestModeEnabled: boolean // New prop
  onViewFullText: (doc: Document) => void // New prop
  groups?: Group[]
}

export default function DocumentList({
  documents,
  onDeleteDocument,
  onViewDocument,
  isTestModeEnabled,
  onViewFullText,
  groups = [],
}: DocumentListProps) {
  const groupMap = useMemo(() => {
    const m: Record<string, Group> = {}
    groups.forEach(g => { m[g.id] = g })
    return m
  }, [groups])
  if (documents.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <p className="text-center text-muted-foreground py-8">
          No documents found. Try adjusting your search or upload new documents.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {documents.map((doc) => {
        const group = doc.groupId ? groupMap[doc.groupId] : null
        return (
          <DocumentCard
            key={doc.id}
            doc={doc}
            onDelete={onDeleteDocument}
            onView={onViewDocument}
            isTestModeEnabled={isTestModeEnabled}
            onViewFullText={onViewFullText}
            group={group}
          />
        )
      })}
    </div>
  )
}
