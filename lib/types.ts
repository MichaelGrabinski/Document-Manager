export type Document = {
  id: string
  name: string
  type: "pdf"
  file?: File // Store the file object client-side for this demo (session only)
  keywords: string[]
  uploadedAt: Date
  uploader: string
  groupId: string | null
  aiSummary?: string // To store summary from AI
  aiExtractedKeywords?: string[] // To store keywords from AI
  fullSimulatedText?: string // Now contains real extracted text from PDF
  originalFileName?: string
  storedFileName?: string
}

export type User = {
  name: string
  roles: string[]
}

export type Group = {
  id: string
  name: string
  parentId: string | null
  searchKeys?: string[]
  subGroups?: Group[]
  allowedRoles?: string[] // Roles that can access documents in this group
}

// Optional explicit role assignment structure if needed later
export type RoleAssignment = {
  userName: string
  roles: string[]
  groupId?: string // If undefined, global roles
}
