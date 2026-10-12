import { useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  MoreHorizontal,
  Search,
  SearchX,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Pick, PersonAvatar, ReviewStatus } from "./shared"
import { filterMembers, type Filters } from "@/lib/organization"
import type { Member, Unit } from "@/data/demo"

const columnLabels: Record<string, string> = {
  title: "岗位",
  unitId: "主要组织",
  review: "资料核对",
  account: "账号状态",
}
const MotionTableRow = motion.create(TableRow)
export const defaultFilters: Filters = {
  query: "",
  review: "all",
  account: "all",
  descendants: true,
}
export function MembersTable({
  units,
  members,
  scope,
  filters,
  onFilters,
  selectedPerson,
  onOpen,
  onEdit,
  onNotify,
}: {
  units: Unit[]
  members: Member[]
  scope: string
  filters: Filters
  onFilters: (filters: Filters) => void
  selectedPerson?: string
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onNotify: (message: string) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([]),
    [rowSelection, setSelection] = useState<RowSelectionState>({}),
    [visibility, setVisibility] = useState<VisibilityState>({})
  const [comfortable, setComfortable] = useState(false)
  const data = useMemo(
    () => filterMembers(units, members, scope, filters),
    [units, members, scope, filters]
  )
  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        size: 40,
        header: ({ table }) => (
          <Checkbox
            aria-label="选择本页成员"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`选择 ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        accessorKey: "name",
        enableHiding: false,
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="sort-button"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            aria-label="按成员姓名排序"
          >
            成员
            <ArrowDownUp size={13} />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="member-name">
            <PersonAvatar name={row.original.name} />
            <span>{row.original.name}</span>
            {row.original.extraUnitId && (
              <span className="multi-role" title="有其他任职">
                兼任
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "unitId",
        header: "主要组织",
        cell: ({ row }) => (
          <span className="table-unit">
            {units.find((u) => u.id === row.original.unitId)?.name}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: "岗位",
        cell: ({ row }) =>
          row.original.title || <span className="text-amber-700">待补充</span>,
      },
      {
        accessorKey: "review",
        header: "资料核对",
        cell: ({ row }) => <ReviewStatus member={row.original} />,
      },
      {
        accessorKey: "account",
        header: "账号状态",
        cell: ({ row }) => (
          <span
            className={`account-state ${row.original.account === "active" ? "" : "muted"}`}
          >
            <span />
            {row.original.account === "active" ? "已开通" : "未开通"}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: "",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${row.original.name}的操作`}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpen(row.original.id)}>
                查看资料
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row.original.id)}>
                编辑成员
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [units, onOpen, onEdit]
  )
  // TanStack's table API is used directly; this Vite app does not enable React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, columnVisibility: visibility },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })
  const selected = table.getSelectedRowModel().rows.map((row) => row.original)
  function change(next: Partial<Filters>) {
    setSelection({})
    table.setPageIndex(0)
    onFilters({ ...filters, ...next })
  }
  function exportSelected() {
    const escape = (text: string) =>
      `"${text.replace(/^[=+@-]/, (s) => `'${s}`).replaceAll('"', '""')}"`
    const csv = [
      ["姓名", "演示编号", "主要组织", "岗位", "资料核对"],
      ...selected.map((p) => [
        p.name,
        p.code,
        units.find((u) => u.id === p.unitId)?.name || "",
        p.title,
        p.review === "verified" ? "已核对" : "待核对",
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "组织成员-虚构演示.csv"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onNotify(`已导出 ${selected.length} 位演示成员`)
  }
  const page = table.getState().pagination
  const filterCount =
    Number(filters.review !== "all") +
    Number(filters.account !== "all") +
    Number(!filters.descendants)
  return (
    <section
      className={`members-panel ${comfortable ? "comfortable" : ""}`}
      aria-label="成员列表"
    >
      <div className="members-tools">
        <div className="search-input member-search">
          <Search />
          <Input
            aria-label="搜索成员"
            placeholder="搜索姓名、岗位或编号…"
            value={filters.query}
            onChange={(e) => change({ query: e.target.value })}
          />
          {filters.query && (
            <button
              aria-label="清空成员搜索"
              onClick={() => change({ query: "" })}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <Pick
          label="资料核对筛选"
          value={filters.review}
          onChange={(review) => change({ review })}
          options={[
            { value: "all", label: "全部核对状态" },
            { value: "verified", label: "已核对" },
            { value: "pending", label: "待核对" },
            { value: "missing", label: "岗位待补充" },
          ]}
        />
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>
            <Filter size={14} />
            筛选
            {filterCount > 0 && (
              <span className="filter-count">{filterCount}</span>
            )}
          </PopoverTrigger>
          <PopoverContent className="filter-popover" align="start">
            <strong>筛选成员</strong>
            <Label>账号状态</Label>
            <Pick
              label="账号筛选"
              value={filters.account}
              onChange={(account) => change({ account })}
              options={[
                { value: "all", label: "全部账号状态" },
                { value: "active", label: "已开通" },
                { value: "none", label: "未开通" },
              ]}
            />
            <label className="check-label">
              <Checkbox
                checked={filters.descendants}
                onCheckedChange={(v) => change({ descendants: !!v })}
              />
              包含下级组织
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                onFilters(defaultFilters)
                setSelection({})
              }}
            >
              清除筛选
            </Button>
          </PopoverContent>
        </Popover>
        <span className="tools-spacer" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" />}>
            <Columns3 size={14} />
            显示
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {columnLabels[column.id]}
                </DropdownMenuCheckboxItem>
              ))}
            <DropdownMenuCheckboxItem
              checked={comfortable}
              onCheckedChange={(value) => setComfortable(!!value)}
            >
              标准密度
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(filters.account !== "all" || !filters.descendants) && (
        <div className="active-filters">
          {filters.account !== "all" && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => change({ account: "all" })}
            >
              {filters.account === "active" ? "账号已开通" : "账号未开通"}
              <X size={12} />
            </Button>
          )}
          {!filters.descendants && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => change({ descendants: true })}
            >
              仅直属成员
              <X size={12} />
            </Button>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="bulk-bar">
          <Checkbox
            checked
            onCheckedChange={() => setSelection({})}
            aria-label="取消全部选择"
          />
          <strong>已选择 {selected.length} 位成员</strong>
          <Button size="sm" variant="ghost" onClick={exportSelected}>
            <Download size={14} />
            导出已选
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="清除成员选择"
            onClick={() => setSelection({})}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      <div className="members-table-scroll">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`col-${header.column.id}`}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <MotionTableRow
                key={row.id}
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  opacity: { duration: 0.14 },
                  y: { duration: 0.18 },
                  layout: { type: "spring", stiffness: 520, damping: 40 },
                }}
                className={
                  selectedPerson === row.original.id ? "inspected" : ""
                }
                data-state={row.getIsSelected() ? "selected" : undefined}
                tabIndex={0}
                aria-label={`查看成员 ${row.original.name}`}
                onClick={() => onOpen(row.original.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && e.key === "Enter")
                    onOpen(row.original.id)
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`col-${cell.column.id}`}
                    onClick={
                      cell.column.id === "select" ||
                      cell.column.id === "actions"
                        ? (e) => e.stopPropagation()
                        : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </MotionTableRow>
            ))}
          </TableBody>
        </Table>
        {!data.length && (
          <div className="empty-results">
            <SearchX size={28} />
            <strong>没有找到匹配的成员</strong>
            <p>试试其他关键词，或清除当前筛选。</p>
            <Button
              variant="outline"
              onClick={() => {
                onFilters(defaultFilters)
                setSelection({})
              }}
            >
              清除筛选
            </Button>
          </div>
        )}
      </div>
      <footer className="table-footer">
        <span>
          {data.length
            ? `${page.pageIndex * page.pageSize + 1} 至 ${Math.min((page.pageIndex + 1) * page.pageSize, data.length)}，共 ${data.length} 位成员`
            : "0 位成员"}
        </span>
        <div>
          <span>
            第 {page.pageIndex + 1} / {Math.max(1, table.getPageCount())} 页
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="上一页成员"
            disabled={!table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage()
              setSelection({})
            }}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="下一页成员"
            disabled={!table.getCanNextPage()}
            onClick={() => {
              table.nextPage()
              setSelection({})
            }}
          >
            <ChevronRight />
          </Button>
        </div>
      </footer>
    </section>
  )
}
