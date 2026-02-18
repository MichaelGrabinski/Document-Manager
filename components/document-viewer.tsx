"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { Document } from "@/lib/types"
import { useEffect, useState } from 'react'

type DocumentViewerProps = {
  doc: Document | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

export default function DocumentViewer({ doc, isOpen, onOpenChange }: DocumentViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    async function prepare() {
      if (!doc) { setObjectUrl(null); return }
      if (doc.file) {
        const url = URL.createObjectURL(doc.file)
        setObjectUrl(url)
        return
      }
      if (doc.storedFileName) {
        try {
          const res = await fetch(`/api/file/${encodeURIComponent(doc.storedFileName)}`)
          if (!res.ok) throw new Error('fetch failed')
          const blob = await res.blob()
          if (revoked) return
          const url = URL.createObjectURL(blob)
            setObjectUrl(url)
        } catch (e) {
          setObjectUrl(null)
        }
      } else {
        setObjectUrl(null)
      }
    }
    prepare()
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc])

  if (!doc || !objectUrl) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>{doc.name}</DialogTitle>
          <DialogDescription>Viewing PDF document. You might need a browser PDF plugin.</DialogDescription>
        </DialogHeader>
        <div className="h-[calc(90vh-80px)]">
          {" "}
          {/* Adjust height based on header/footer */}
          <iframe
            src={objectUrl}
            title={doc.name}
            width="100%"
            height="100%"
            style={{ border: "none" }}
            // cleanup handled in effect cleanup
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
