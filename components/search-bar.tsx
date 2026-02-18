"use client"

import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

type SearchBarProps = {
  searchTerm: string
  onSearchChange: (term: string) => void
}

export default function SearchBar({ searchTerm, onSearchChange }: SearchBarProps) {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search: use commas or spaces for multiple terms (e.g. 2005, permits)"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 rounded-md border"
      />
    </div>
  )
}
