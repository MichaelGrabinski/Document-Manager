"use client"

import Link from "next/link"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Home,
  Folder,
  FolderPlus,
  Settings,
  ChevronDown,
  ChevronRight,
  BookOpenText,
  Pencil,
  Search,
} from "lucide-react"
import type { Group } from "@/lib/types"
import type { Document } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type React from "react"
import { useState } from "react"
import { useToast } from "./ui/use-toast"

type AppSidebarProps = {
  groups: Group[]
  documents?: Document[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onAddGroup: (groupName: string, parentId?: string | null) => void
  onOpenEditGroupDialog: (group: Group) => void
  onSearchInGroup: () => void // New prop for "Search in Group" button
}

const CreateGroupForm = ({
  onAddGroup,
  parentId,
  onClose,
}: {
  onAddGroup: (groupName: string, parentId?: string | null) => void
  parentId?: string | null
  onClose: () => void
}) => {
  const [groupName, setGroupName] = useState("")
  const { toast } = useToast()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (groupName.trim()) {
      onAddGroup(groupName.trim(), parentId)
      setGroupName("")
      toast({ title: "Group Created", description: `Group "${groupName}" added successfully.` })
      onClose()
    } else {
      toast({ variant: "destructive", title: "Error", description: "Group name cannot be empty." })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="groupName">Group Name</Label>
        <Input
          id="groupName"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Enter group name"
          autoFocus
        />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Create Group</Button>
      </DialogFooter>
    </form>
  )
}

const GroupItemContentInternal = ({
  group,
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onOpenEditGroupDialog,
  level = 0,
  hasAdminRole,
}: {
  group: Group
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onAddGroup: (groupName: string, parentId?: string | null) => void
  onOpenEditGroupDialog: (group: Group) => void
  level?: number
  hasAdminRole: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreateSubGroupOpen, setIsCreateSubGroupOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const hasSubgroups = group.subGroups && group.subGroups.length > 0

  return (
    <>
      <div className="flex items-center w-full group/item">
        <SidebarMenuButton
          onClick={() => onSelectGroup(group.id)}
          isActive={selectedGroupId === group.id}
          className="flex-grow"
          style={{ paddingLeft: `${0.5 + level * 1}rem` }}
        >
          <Folder size={16} className="mr-2 shrink-0" />
          <span className="truncate">{group.name}</span>
          {group.allowedRoles && group.allowedRoles.length > 0 && (
            <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200">
              {group.allowedRoles.join("|")}
            </span>
          )}
          {hasSubgroups && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6"
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(!isOpen)
              }}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </Button>
          )}
        </SidebarMenuButton>
        {hasAdminRole && (
          <div className="flex items-center shrink-0 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 group-data-[collapsible=icon]:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Edit group"
              onClick={(e) => {
                e.stopPropagation()
                onOpenEditGroupDialog(group)
              }}
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              title="Delete group"
              onClick={(e) => {
                e.stopPropagation()
                if (!confirmingDelete) {
                  setConfirmingDelete(true)
                  setTimeout(() => setConfirmingDelete(false), 3000)
                } else {
                  fetch('/api/groups', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: group.id }) })
                  // Optimistic removal from UI: custom event dispatch for parent to reload or rely on external refresh logic.
                  const ev = new CustomEvent('group-deleted', { detail: { id: group.id } })
                  window.dispatchEvent(ev)
                }
              }}
            >
              {confirmingDelete ? '⚠' : '✕'}
            </Button>
            <Dialog open={isCreateSubGroupOpen} onOpenChange={setIsCreateSubGroupOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Add sub-group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FolderPlus size={14} />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Sub-group in "{group.name}"</DialogTitle>
                </DialogHeader>
                <CreateGroupForm
                  onAddGroup={onAddGroup}
                  parentId={group.id}
                  onClose={() => setIsCreateSubGroupOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
      {hasSubgroups && isOpen && (
        <SidebarMenuSub style={{ marginLeft: `${0.5 + level * 0.5}rem` }}>
          {group.subGroups?.map((subGroup) => (
            <SidebarMenuSubItem key={subGroup.id}>
              <GroupItemContentInternal
                group={subGroup}
                selectedGroupId={selectedGroupId}
                onSelectGroup={onSelectGroup}
                onAddGroup={onAddGroup}
                onOpenEditGroupDialog={onOpenEditGroupDialog}
                level={level + 1}
                hasAdminRole={hasAdminRole}
              />
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </>
  )
}

export default function AppSidebarClient({
  groups,
  documents = [],
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onOpenEditGroupDialog,
  onSearchInGroup, // Destructure new prop
}: AppSidebarProps) {
  const { isMobile } = useSidebar()
  const { hasRole } = useAuth()
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const hasAdminRole = hasRole("admin")

  const buildGroupTree = (allGroupsInput: Group[], parentId: string | null = null): Group[] => {
    if (!Array.isArray(allGroupsInput)) {
      return []
    }
    return allGroupsInput
      .filter((group) => group.parentId === parentId)
      .map((group) => ({
        ...group,
        subGroups: buildGroupTree(allGroupsInput, group.id),
      }))
  }

  const groupTree = buildGroupTree(groups)
  const docCountByGroup: Record<string, number> = {}
  documents.forEach(d => { if (d.groupId) { docCountByGroup[d.groupId] = (docCountByGroup[d.groupId]||0)+1 } })

  return (
    <Sidebar className="border-r bg-background" collapsible={isMobile ? "offcanvas" : "icon"}>
      <SidebarHeader className="p-2 border-b">
        <Link href="/" className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:justify-center">
          <BookOpenText className="h-6 w-6 text-slate-700 dark:text-slate-300" />
          <span className="group-data-[collapsible=icon]:hidden text-slate-800 dark:text-slate-200">DocManager</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => onSelectGroup(null)} isActive={selectedGroupId === null}>
              <Home size={16} className="mr-2" />
              All Documents
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="flex justify-between items-center">
            Document Groups
            {hasAdminRole && (
              <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 group-data-[collapsible=icon]:hidden">
                    <FolderPlus size={16} />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Group</DialogTitle>
                  </DialogHeader>
                  <CreateGroupForm onAddGroup={onAddGroup} onClose={() => setIsCreateGroupOpen(false)} />
                </DialogContent>
              </Dialog>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
        {groupTree.map((group) => (
                <SidebarMenuItem key={group.id}>
                  <GroupItemContentInternal
                    group={group}
                    selectedGroupId={selectedGroupId}
                    onSelectGroup={onSelectGroup}
                    onAddGroup={onAddGroup}
                    onOpenEditGroupDialog={onOpenEditGroupDialog}
                    hasAdminRole={hasAdminRole}
                    level={0}
                  />
          {docCountByGroup[group.id] ? <span className="ml-2 text-[10px] text-muted-foreground">{docCountByGroup[group.id]}</span> : null}
                </SidebarMenuItem>
              ))}
              {groupTree.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No groups created yet.
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t group-data-[collapsible=icon]:justify-center">
        <SidebarMenu>
          {selectedGroupId && ( // Only show if a group is selected
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onSearchInGroup}>
                <Search size={16} className="mr-2" />
                Search in Group
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <Link href="/settings" className="w-full">
              <SidebarMenuButton asChild>
                <span>
                  <Settings size={16} className="mr-2" />
                  Settings
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
