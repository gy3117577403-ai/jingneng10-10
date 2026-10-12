import { useState, type CSSProperties } from "react"
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ListTree,
  Network,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { PersonAvatar, UnitIcon } from "./shared"
import { membersIn, unitPath } from "@/lib/organization"
import type { Member, Unit } from "@/data/demo"

export function Directory({
  units,
  members,
  selected,
  onSelect,
  onSearch,
}: {
  units: Unit[]
  members: Member[]
  selected: string
  onSelect: (id: string) => void
  onSearch: () => void
}) {
  const [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(
      new Set(["company", "sales", "production", "workshop"])
    )
  const { setOpenMobile, isMobile } = useSidebar()
  const match = (u: Unit) =>
    !query ||
    units.some(
      (candidate) =>
        candidate.name.includes(query) &&
        unitPath(units, candidate.id).some((p) => p.id === u.id)
    )
  function select(id: string) {
    onSelect(id)
    if (isMobile) setOpenMobile(false)
  }
  function renderUnit(unit: Unit, depth: number) {
    if (!match(unit)) return null
    const children = units.filter((u) => u.parentId === unit.id),
      open = !!query || expanded.has(unit.id)
    return (
      <div className="directory-branch" key={unit.id}>
        <div
          className={`directory-row ${selected === unit.id ? "active" : ""}`}
          style={{ "--depth": depth } as CSSProperties}
        >
          {children.length ? (
            <button
              className="directory-toggle"
              aria-label={`${open ? "收起目录" : "展开目录"} ${unit.name}`}
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(unit.id)) next.delete(unit.id)
                  else next.add(unit.id)
                  return next
                })
              }
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="directory-toggle" />
          )}
          <button
            className="directory-select"
            onClick={() => select(unit.id)}
            aria-label={`选择组织 ${unit.name}`}
            aria-current={selected === unit.id ? "true" : undefined}
          >
            <UnitIcon kind={unit.kind} />
            <span title={unit.name}>{unit.name}</span>
            <small>{membersIn(units, members, unit.id).length}</small>
          </button>
        </div>
        {open && children.map((child) => renderUnit(child, depth + 1))}
      </div>
    )
  }
  return (
    <Sidebar collapsible="offcanvas" className="workspace-sidebar">
      <SidebarHeader className="brand-area">
        <div className="brand-mark">
          <Building2 size={20} />
        </div>
        <div>
          <strong>京能制造</strong>
          <span>企业协作空间</span>
        </div>
        <ChevronsUpDown size={14} className="muted-icon" />
      </SidebarHeader>
      <SidebarContent>
        <div className="sidebar-shortcuts">
          <Button
            variant="outline"
            className="workspace-search"
            onClick={onSearch}
          >
            <Search size={14} />
            <span>搜索组织与成员</span>
            <kbd>Ctrl K</kbd>
          </Button>
          <div className="active-module">
            <Network size={16} />
            <strong>组织与成员</strong>
            <span>{members.length}</span>
          </div>
        </div>
        <div className="directory-heading">
          <span>组织目录</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="展开全部组织目录"
            onClick={() => setExpanded(new Set(units.map((u) => u.id)))}
          >
            <ListTree size={14} />
          </Button>
        </div>
        <div className="directory-search search-input">
          <Search size={13} />
          <Input
            aria-label="查找组织"
            placeholder="查找组织…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="清空组织搜索" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <nav className="directory-tree" aria-label="组织目录">
          {units.filter((u) => !u.parentId).map((unit) => renderUnit(unit, 0))}
          {query && !units.some((u) => u.name.includes(query)) && (
            <p className="directory-empty">没有匹配的组织</p>
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="sidebar-status">
          <span />
          本地演示空间
        </div>
        <div className="current-user">
          <PersonAvatar name="管理员" />
          <div>
            <strong>演示管理员</strong>
            <span>总管理员</span>
          </div>
          <span className="admin-indicator" aria-label="演示管理员">
            管
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
