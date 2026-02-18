"use client"

import { useState, useEffect, type FormEvent } from "react"
import type { Group } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DialogFooter, DialogClose } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Textarea } from "./ui/textarea"

type EditGroupFormProps = {
  group: Group
  onUpdateGroup: (updatedGroupData: Partial<Group> & { id: string }) => void
  onClose: () => void
}

export default function EditGroupForm({ group, onUpdateGroup, onClose }: EditGroupFormProps) {
  const [groupName, setGroupName] = useState(group.name)
  const [searchKeysInput, setSearchKeysInput] = useState((group.searchKeys || []).join(", "))
  const [allowedRolesInput, setAllowedRolesInput] = useState((group.allowedRoles || []).join(", "))
  const { toast } = useToast()

  useEffect(() => {
    setGroupName(group.name)
  setSearchKeysInput((group.searchKeys || []).join(", "))
  setAllowedRolesInput((group.allowedRoles || []).join(", "))
  }, [group])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (groupName.trim()) {
      const updatedSearchKeys = searchKeysInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k)
      const updatedAllowedRoles = allowedRolesInput
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r)
      onUpdateGroup({ id: group.id, name: groupName.trim(), searchKeys: updatedSearchKeys, allowedRoles: updatedAllowedRoles })
      toast({ title: "Group Updated", description: `Group "${groupName}" updated.` })
      onClose()
    } else {
      toast({ variant: "destructive", title: "Error", description: "Group name cannot be empty." })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="editGroupName">Group Name</Label>
        <Input id="editGroupName" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="editSearchKeys">Group Search Keywords (comma-separated)</Label>
        <Textarea
          id="editSearchKeys"
          value={searchKeysInput}
          onChange={(e) => setSearchKeysInput(e.target.value)}
          placeholder="e.g., internal docs, client reports, financial statements"
          rows={3}
        />
        <p className="text-xs text-muted-foreground mt-1">
          These keywords can help prioritize or filter searches within this group.
        </p>
      </div>
      <div>
        <Label htmlFor="editAllowedRoles">Allowed Roles (comma-separated)</Label>
        <Textarea
          id="editAllowedRoles"
          value={allowedRolesInput}
          onChange={(e) => setAllowedRolesInput(e.target.value)}
          placeholder="e.g., admin, editor, viewer"
          rows={2}
        />
        <p className="text-xs text-muted-foreground mt-1">If empty, all roles with base access can view. Otherwise restricted.</p>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Save Changes</Button>
      </DialogFooter>
    </form>
  )
}
