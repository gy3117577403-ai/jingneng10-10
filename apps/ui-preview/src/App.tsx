import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  Command,
  Layers3,
  MoreHorizontal,
  Network,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react"
import type { Viewport } from "reactflow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  defaultFilters,
  MembersTable,
} from "@/components/workspace/MembersTable"
import { OrganizationChart } from "@/components/workspace/OrganizationChart"
import {
  MemberDetails,
  NewMemberDialog,
  UnitDetails,
  UnitDialog,
} from "@/components/workspace/Details"
import { Directory } from "@/components/workspace/Directory"
import { PersonAvatar, UnitIcon } from "@/components/workspace/shared"
import {
  demoMembers,
  demoUnits,
  loadDemo,
  STORAGE_KEY,
  type Member,
  type Unit,
} from "@/data/demo"
import { membersIn, unitPath, type Filters } from "@/lib/organization"
import "./workspace.css"
import "./motion.css"
import { AnimatePresence, motion } from "motion/react"

type Inspector =
  | { type: "unit"; id: string }
  | { type: "member"; id: string; from?: string; edit?: boolean; key: number }
  | null
type View = "organization" | "members"
export default function App() {
  const [data, setData] = useState(loadDemo),
    { units, members } = data
  const [view, setView] = useState<View>(
    new URLSearchParams(location.search).get("view") === "members"
      ? "members"
      : "organization"
  )
  const [scope, setScope] = useState("production"),
    [rootId, setRootId] = useState("production")
  const [expanded, setExpanded] = useState(new Set(["production", "workshop"])),
    [showPeople, setShowPeople] = useState(false)
  const [inspector, setInspector] = useState<Inspector>(null),
    [filters, setFilters] = useState<Filters>(defaultFilters)
  const [viewport, setViewport] = useState<Viewport | null>(null),
    [fitSignal, setFitSignal] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false),
    [searchQuery, setSearchQuery] = useState("")
  const [modal, setModal] = useState<
      "member" | "unit" | "help" | "reset" | null
    >(null),
    [editingUnit, setEditingUnit] = useState<Unit | undefined>()
  const [toast, setToast] = useState(""),
    [dirty, setDirty] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  const scopedMembers = useMemo(
    () => membersIn(units, members, scope),
    [units, members, scope]
  )
  const inspectorUnit =
    inspector?.type === "unit"
      ? units.find((u) => u.id === inspector.id)
      : undefined
  const person =
    inspector?.type === "member"
      ? members.find((p) => p.id === inspector.id)
      : undefined
  const notify = useCallback((message: string) => setToast(message), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(""), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set("view", view)
    history.replaceState(null, "", url)
  }, [view])
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("beforeunload", listener)
    return () => window.removeEventListener("beforeunload", listener)
  }, [dirty])
  const attempt = useCallback(
    (action: () => void) => {
      if (dirty) {
        pending.current = action
        setDiscardOpen(true)
      } else action()
    },
    [dirty]
  )
  const closeDetails = useCallback(
    () => attempt(() => setInspector(null)),
    [attempt]
  )
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        inspector &&
        !modal &&
        !searchOpen &&
        !discardOpen &&
        !document.querySelector(
          '[data-slot="select-content"], [data-slot="dropdown-menu-content"], [data-slot="popover-content"]'
        )
      ) {
        event.preventDefault()
        closeDetails()
      }
    }
    document.addEventListener("keydown", listener)
    return () => document.removeEventListener("keydown", listener)
  }, [inspector, modal, searchOpen, discardOpen, closeDetails])
  const selectNode = useCallback(
    (id: string) =>
      attempt(() => {
        setScope(id)
        if (showPeople) setExpanded((current) => new Set([...current, id]))
        setInspector({ type: "unit", id })
      }),
    [attempt, showPeople]
  )
  const openPerson = useCallback(
    (id: string) =>
      attempt(() =>
        setInspector((previous) => ({
          type: "member",
          id,
          from: previous?.type === "unit" ? previous.id : undefined,
          key: Date.now(),
        }))
      ),
    [attempt]
  )
  const editPerson = useCallback(
    (id: string) =>
      attempt(() =>
        setInspector({ type: "member", id, edit: true, key: Date.now() })
      ),
    [attempt]
  )
  const selectDirectory = useCallback(
    (id: string) =>
      attempt(() => {
        setScope(id)
        setRootId(id)
        setExpanded((current) => new Set([...current, id]))
        setInspector(null)
        setViewport(null)
        setFitSignal((value) => value + 1)
        setFilters(defaultFilters)
      }),
    [attempt]
  )
  const openMembers = useCallback(
    (id: string) =>
      attempt(() => {
        setScope(id)
        setView("members")
        setInspector(null)
        setFilters(defaultFilters)
      }),
    [attempt]
  )
  const toggleBranch = useCallback(
    (id: string) =>
      attempt(() => {
        setExpanded((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        if (
          expanded.has(id) &&
          scope !== id &&
          unitPath(units, scope).some((u) => u.id === id)
        ) {
          setScope(id)
          if (inspector) setInspector({ type: "unit", id })
        }
      }),
    [attempt, expanded, scope, units, inspector]
  )
  function locate(id: string) {
    attempt(() => {
      const path = unitPath(units, id),
        root = path[Math.max(0, path.length - 2)].id
      setView("organization")
      setScope(id)
      setRootId(root)
      setExpanded(new Set(path.map((u) => u.id)))
      setInspector({ type: "unit", id })
      setViewport(null)
      setFitSignal((value) => value + 1)
    })
  }
  function store(next: typeof data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...next }))
      setData(next)
      return null
    } catch {
      return "当前浏览器无法保存演示数据。请检查存储空间后重试，输入已保留。"
    }
  }
  function saveMember(member: Member) {
    const existing = members.some((p) => p.id === member.id)
    const failure = store({
      units,
      members: existing
        ? members.map((p) => (p.id === member.id ? member : p))
        : [...members, member],
    })
    if (failure) return failure
    notify(existing ? "已保存到本地演示" : "已添加演示成员")
    if (!existing) {
      setScope(member.unitId)
      setView("members")
      setFilters(defaultFilters)
      setInspector({ type: "member", id: member.id, key: Date.now() })
    }
    return null
  }
  function saveUnit(next: Unit) {
    if (!next.name) return "请填写组织名称。"
    if (
      units.some(
        (u) =>
          u.id !== next.id &&
          u.parentId === next.parentId &&
          u.name === next.name
      )
    )
      return "同一上级下已有这个名称，请换一个名称。"
    if (
      next.parentId &&
      unitPath(units, next.parentId).some((u) => u.id === next.id)
    )
      return "组织不能成为自身或下级组织的子组织。"
    const existing = units.some((u) => u.id === next.id)
    const failure = store({
      members,
      units: existing
        ? units.map((u) => (u.id === next.id ? next : u))
        : [...units, next],
    })
    if (failure) return failure
    setExpanded((current) => new Set([...current, next.parentId || next.id]))
    setScope(next.id)
    setInspector({ type: "unit", id: next.id })
    notify(existing ? "演示组织已更新" : "演示组织已创建")
    return null
  }
  const searchUnits = units
    .filter((u) => !searchQuery || u.name.includes(searchQuery))
    .slice(0, 5)
  const searchPeople = members
    .filter(
      (p) =>
        !searchQuery ||
        `${p.name} ${p.title} ${p.code}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    )
    .slice(0, 6)
  return (
    <TooltipProvider delay={300}>
      <SidebarProvider
        className="workspace-root"
        style={{ "--sidebar-width": "224px" } as CSSProperties}
      >
        <Directory
          units={units}
          members={members}
          selected={scope}
          onSelect={selectDirectory}
          onSearch={() => setSearchOpen(true)}
        />
        <SidebarInset className="workspace-main">
          <header className="app-header">
            <SidebarTrigger aria-label="切换侧栏" />
            <span className="header-divider" />
            <h1>组织与成员</h1>
            <Badge variant="outline" className="preview-badge">
              组件预览
            </Badge>
            <Tabs
              value={view}
              onValueChange={(value) =>
                attempt(() => {
                  setView(value as View)
                  setInspector(null)
                })
              }
            >
              <TabsList aria-label="组织与成员视图">
                <TabsTrigger value="organization">
                  <Network size={14} />
                  组织架构
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users size={14} />
                  成员<span className="tab-count">{scopedMembers.length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="header-end">
              <Button
                variant="ghost"
                size="icon"
                aria-label="搜索组织与成员"
                onClick={() => setSearchOpen(true)}
              >
                <Search />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="预览说明"
                onClick={() => setModal("help")}
              >
                <CircleHelp />
              </Button>
              <span className="header-divider" />
              <PersonAvatar name="管理员" />
            </div>
          </header>

          <div className="context-toolbar">
            <nav className="breadcrumbs" aria-label="当前位置">
              {unitPath(units, scope).map((u, i, path) => (
                <span key={u.id}>
                  {i > 0 && <ChevronRight size={12} />}
                  <button
                    onClick={() => selectDirectory(u.id)}
                    aria-current={i === path.length - 1 ? "page" : undefined}
                  >
                    {u.id === "company" ? "全部组织" : u.name}
                  </button>
                </span>
              ))}
            </nav>
            <span className="tools-spacer" />
            {view === "organization" ? (
              <div className="chart-actions">
                <label className="show-members">
                  <Switch
                    size="sm"
                    checked={showPeople}
                    onCheckedChange={(value) => {
                      setShowPeople(!!value)
                      if (value)
                        setExpanded((current) => new Set([...current, scope]))
                      setFitSignal((current) => current + 1)
                    }}
                  />
                  显示成员
                </label>
                <span className="toolbar-divider" />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="展开全部架构"
                  onClick={() => setExpanded(new Set(units.map((u) => u.id)))}
                >
                  <ChevronsUpDown size={14} />
                  展开
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="收起全部架构"
                  onClick={() =>
                    attempt(() => {
                      setExpanded(new Set([rootId]))
                      setScope(rootId)
                      if (inspector) setInspector({ type: "unit", id: rootId })
                    })
                  }
                >
                  <ChevronsDownUp size={14} />
                </Button>
              </div>
            ) : (
              <span className="scope-meta">
                {scopedMembers.length} 位成员<span>·</span>
                {
                  scopedMembers.filter((p) => p.review === "pending").length
                }{" "}
                位待核对
              </span>
            )}
            {view === "organization" ? (
              <Button
                onClick={() =>
                  attempt(() => {
                    setEditingUnit(undefined)
                    setModal("unit")
                  })
                }
              >
                <Plus size={15} />
                新增组织
              </Button>
            ) : (
              <Button onClick={() => attempt(() => setModal("member"))}>
                <Plus size={15} />
                新增成员
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="更多页面操作"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setModal("help")}>
                  <CircleHelp />
                  预览说明
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => attempt(() => setModal("reset"))}
                >
                  <RotateCcw />
                  重置演示数据
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className={`work-area ${inspector ? "has-inspector" : ""}`}>
            <div className="work-content">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={view}
                  className="view-stage"
                  initial={{ opacity: 0, y: 7 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  {view === "organization" ? (
                    <OrganizationChart
                      units={units}
                      members={members}
                      rootId={rootId}
                      selectedId={scope}
                      expanded={expanded}
                      showPeople={showPeople}
                      inspectorOpen={!!inspector}
                      viewport={viewport}
                      onViewport={setViewport}
                      onSelect={selectNode}
                      onToggle={toggleBranch}
                      onPerson={openPerson}
                      onMembers={openMembers}
                      fitSignal={fitSignal}
                    />
                  ) : (
                    <MembersTable
                      key={scope}
                      units={units}
                      members={members}
                      scope={scope}
                      filters={filters}
                      onFilters={setFilters}
                      selectedPerson={
                        inspector?.type === "member" ? inspector.id : undefined
                      }
                      onOpen={openPerson}
                      onEdit={editPerson}
                      onNotify={notify}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            {inspector && (
              <button
                className="detail-backdrop"
                aria-label="收起详情面板"
                onClick={closeDetails}
              />
            )}
            <AnimatePresence initial={false} mode="wait">
              {inspectorUnit && (
                <UnitDetails
                  key={`unit:${inspectorUnit.id}`}
                  unit={inspectorUnit}
                  units={units}
                  members={members}
                  onClose={closeDetails}
                  onPerson={openPerson}
                  onSelect={selectNode}
                  onMembers={() => openMembers(inspectorUnit.id)}
                  onAdd={() => setModal("member")}
                  onEdit={() => {
                    setEditingUnit(inspectorUnit)
                    setModal("unit")
                  }}
                />
              )}
              {person && inspector?.type === "member" && (
                <MemberDetails
                  key={`${person.id}:${inspector.key}`}
                  member={person}
                  units={units}
                  editInitially={inspector.edit}
                  onClose={closeDetails}
                  onBack={
                    inspector.from
                      ? () =>
                          attempt(() =>
                            setInspector({ type: "unit", id: inspector.from! })
                          )
                      : undefined
                  }
                  onLocate={locate}
                  onSave={saveMember}
                  onDirty={setDirty}
                />
              )}
            </AnimatePresence>
          </div>
        </SidebarInset>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="preview-toast"
              role="status"
              key={toast}
              style={{ x: "-50%" }}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 480, damping: 30 }}
            >
              <Check size={15} />
              {toast}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="关闭保存提示"
                onClick={() => setToast("")}
              >
                <X size={13} />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="search-dialog" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="sr-only">搜索组织与成员</DialogTitle>
              <DialogDescription className="sr-only">
                输入名称、岗位或成员编号，选择结果以定位。
              </DialogDescription>
            </DialogHeader>
            <div className="search-input">
              <Search size={18} />
              <Input
                autoFocus
                placeholder="搜索组织、成员或岗位…"
                aria-label="全局搜索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="global-results">
              <span className="results-label">组织</span>
              {searchUnits.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSearchOpen(false)
                    locate(u.id)
                  }}
                >
                  <UnitIcon kind={u.kind} />
                  <span>
                    <strong>{u.name}</strong>
                    <small>
                      {unitPath(units, u.id)
                        .slice(0, -1)
                        .map((p) => p.name)
                        .join(" / ") || "企业空间"}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
              <span className="results-label">成员</span>
              {searchPeople.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSearchOpen(false)
                    attempt(() => {
                      setScope(p.unitId)
                      setView("members")
                      setFilters(defaultFilters)
                      setInspector({
                        type: "member",
                        id: p.id,
                        key: Date.now(),
                      })
                    })
                  }}
                >
                  <PersonAvatar name={p.name} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.title || "岗位待补充"} ·{" "}
                      {units.find((u) => u.id === p.unitId)?.name}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
              {!searchUnits.length && !searchPeople.length && (
                <p className="search-empty">
                  没有找到匹配结果，请尝试其他关键词。
                </p>
              )}
            </div>
            <footer>
              <Command size={12} />
              Ctrl / ⌘ K 打开搜索<span>Tab 选择 · Enter 打开</span>
            </footer>
          </DialogContent>
        </Dialog>
        {modal === "member" && (
          <NewMemberDialog
            units={units}
            scope={scope}
            onClose={() => setModal(null)}
            onSave={saveMember}
          />
        )}
        {modal === "unit" && (
          <UnitDialog
            units={units}
            initial={editingUnit}
            scope={scope}
            onClose={() => setModal(null)}
            onSave={saveUnit}
          />
        )}
        <Dialog
          open={modal === "help"}
          onOpenChange={(open) => {
            if (!open) setModal(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>组织与成员 · 交互预览</DialogTitle>
              <DialogDescription>
                使用真实组件运行，所有组织和成员均为虚构演示。
              </DialogDescription>
            </DialogHeader>
            <div className="help-content">
              <p>
                <Network size={17} />
                点击组织查看详情，独立箭头展开或收起分支。
              </p>
              <p>
                <Users size={17} />
                在成员页搜索、筛选，点击一行打开资料面板。
              </p>
              <p>
                <Layers3 size={17} />
                修改保存在当前浏览器，可通过“更多”重置。
              </p>
              <p>这些操作不会修改业务系统的真实资料或创建真实账号。</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setModal(null)}>开始体验</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>有尚未保存的修改</DialogTitle>
              <DialogDescription>
                离开后，这次尚未保存的输入会丢失。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscardOpen(false)}>
                继续编辑
              </Button>
              <Button
                onClick={() => {
                  setDirty(false)
                  setDiscardOpen(false)
                  const action = pending.current
                  pending.current = null
                  action?.()
                }}
              >
                放弃修改并继续
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal === "reset"}
          onOpenChange={(open) => {
            if (!open) setModal(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重置演示数据？</DialogTitle>
              <DialogDescription>
                清除当前浏览器中对演示资料的修改，恢复初始虚构数据。真实业务资料不受影响。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModal(null)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  const failure = store({
                    units: structuredClone(demoUnits),
                    members: structuredClone(demoMembers),
                  })
                  if (failure) {
                    notify(failure)
                    return
                  }
                  setScope("production")
                  setRootId("production")
                  setExpanded(new Set(["production", "workshop"]))
                  setInspector(null)
                  setFilters(defaultFilters)
                  setViewport(null)
                  setFitSignal((value) => value + 1)
                  setModal(null)
                  notify("已恢复初始演示数据")
                }}
              >
                重置演示
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarProvider>
    </TooltipProvider>
  )
}
