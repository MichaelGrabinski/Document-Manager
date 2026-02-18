"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import type { Document, Group } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { UploadCloud, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type DocumentUploadFormProps = {
  onDocumentAdd: (doc: Document) => void
  groups: Group[]
}

const generateGroupSelectOptions = (
  allGroups: Group[],
  parentId: string | null = null,
  level = 0,
): { value: string; label: string; disabled?: boolean }[] => {
  let options: { value: string; label: string }[] = []
  const children = allGroups.filter((g) => g.parentId === parentId)

  for (const group of children) {
    options.push({
      value: group.id,
      label: `${"---".repeat(level)} ${group.name}`,
    })
    options = options.concat(generateGroupSelectOptions(allGroups, group.id, level + 1))
  }
  return options
}

export default function DocumentUploadForm({ onDocumentAdd, groups }: DocumentUploadFormProps) {
  const [fileNames, setFileNames] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [keywordsInput, setKeywordsInput] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])
  const { user } = useAuth()
  const { toast } = useToast()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const groupOptions = useMemo(() => generateGroupSelectOptions(groups), [groups])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const first = (event.target.files || [])[0]
    if (first && first.type === "application/pdf") {
      setFiles([first])
      setFileNames([first.name])
      toast({ title: "File selected", description: `${first.name} ready for AI processing.` })
    } else {
      toast({ variant: "destructive", title: "Invalid file type", description: "Please upload a PDF file." })
      setFiles([])
      setFileNames([])
    }
  }

  const handleAddKeyword = () => {
    if (keywordsInput.trim() !== "") {
      const newKeywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k !== "")
      setKeywords((prev) => [...new Set([...prev, ...newKeywords])])
      setKeywordsInput("")
    }
  }

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setKeywords((prev) => prev.filter((k) => k !== keywordToRemove))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (files.length === 0 || !user) {
      toast({ variant: "destructive", title: "Error", description: "Files and user information are required." })
      return
    }

    for (const [idx, file] of files.entries()) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("uploader", user.name)
      if (selectedGroupId) formData.append("groupId", selectedGroupId)
      formData.append("keywords", keywords.join(","))
      try {
        const res = await fetch("/api/documents/create-from-upload", { method: "POST", body: formData })
        const data = await res.json()
        if (res.ok && data.doc) {
          // Attach the File client-side for viewing/downloading session-only
            const newDocument: Document = { ...data.doc, file, uploadedAt: new Date(data.doc.uploadedAt) }
            onDocumentAdd(newDocument)
            toast({ title: `Uploaded (${idx + 1}/${files.length})`, description: `${newDocument.name} created${data.ai ? ' with AI' : ''}.` })
        } else {
          toast({ variant: "destructive", title: "Upload failed", description: data.error || "Unknown error" })
        }
      } catch (e:any) {
        toast({ variant: "destructive", title: "Server error", description: e.message || 'Failed to upload' })
      }
    }

    setFileNames([])
    setFiles([])
    setKeywordsInput("")
    setKeywords([])
    setSelectedGroupId(null)
    const fileInput = document.getElementById("file-upload") as HTMLInputElement
    if (fileInput) fileInput.value = ""
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 border rounded-lg bg-card shadow-sm">
      <div>
        <Label htmlFor="file-upload" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Upload PDF Document
        </Label>
        <div className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
          <UploadCloud className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-2" />
          <label
            htmlFor="file-upload"
            className="relative cursor-pointer bg-background rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-ring"
          >
            <span>Select a PDF file</span>
            <Input
              id="file-upload"
              name="file-upload"
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              accept=".pdf"
            />
          </label>
          <p className="pl-1 text-xs text-muted-foreground">PDF up to 10MB - AI will extract text</p>
        </div>
        {fileNames.length > 0 && (
          <div className="mt-2 text-sm text-muted-foreground">
            Selected: {fileNames[0]}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="group" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Assign to Group (Optional)
        </Label>
        <Select
          value={selectedGroupId || ""}
          onValueChange={(value) => setSelectedGroupId(value === "none" ? null : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Group (Root)</SelectItem>
            {groupOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="keywords" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Document Keywords (comma-separated)
        </Label>
        <div className="flex items-center space-x-2">
          <Input
            id="keywords"
            type="text"
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="e.g., report, q3, finance"
            className="flex-grow"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddKeyword}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Add
          </Button>
        </div>
        {keywords.length > 0 && (
          <div className="mt-2 space-x-1 space-y-1">
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="relative group">
                {kw}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="ml-1.5 opacity-50 group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove ${kw}`}
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

  <Button type="submit" disabled={files.length === 0} className="w-full bg-slate-600 hover:bg-slate-700 text-white">
        Add Document & Process with AI
      </Button>
    </form>
  )
}
