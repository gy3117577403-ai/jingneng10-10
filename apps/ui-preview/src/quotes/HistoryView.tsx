import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileSpreadsheet,
  FileText,
} from "lucide-react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { costTotal, money, searchHistory, type HistoricalLine } from "./model"
import {
  DetailSheet,
  Empty,
  FilterSelect,
  SearchInput,
  Status,
  TypeIcon,
} from "./shared"

export function HistoryView({
  lines,
  query,
  setQuery,
  type,
  setType,
  verified,
  setVerified,
  onReuse,
  focusRequest,
  returnTitle,
  onBack,
}: {
  lines: HistoricalLine[]
  query: string
  setQuery: (query: string) => void
  type: string
  setType: (value: string) => void
  verified: boolean
  setVerified: (value: boolean) => void
  onReuse: (line: HistoricalLine, returnFocus: HTMLElement | null) => void
  focusRequest: number
  returnTitle?: string
  onBack?: () => void
}) {
  const reduced = useReducedMotion()
  const costDisclosureId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const detailReturnFocus = useRef<HTMLElement | null>(null)
  const pendingReuse = useRef<HistoricalLine | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ])
  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus()
  }, [focusRequest])
  const filtered = useMemo(
    () => searchHistory(lines, query, type, verified),
    [lines, query, type, verified]
  )
  const item = lines.find((line) => line.id === selected)
  const columns = useMemo<ColumnDef<HistoricalLine>[]>(
    () => [
      {
        accessorKey: "name",
        header: "产品 / 图号",
        cell: ({ row }) => (
          <div className="q-product-cell">
            <TypeIcon type={row.original.type} small />
            <div>
              <button className="q-text-button" aria-haspopup="dialog">
                {row.original.name}
              </button>
              <span className="q-meta mono">
                {row.original.drawing}
                <span className="q-rev">{row.original.revision} 版</span>
              </span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "customer",
        header: "客户 / 规格",
        cell: ({ row }) => (
          <div>
            <span>{row.original.customer.replace("（虚构）", "")}</span>
            <span className="q-meta">{row.original.spec}</span>
          </div>
        ),
      },
      {
        accessorKey: "qty",
        header: "数量",
        cell: ({ row }) => (
          <span className="q-number">
            {row.original.qty} <small>{row.original.unit}</small>
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: "历史单价",
        cell: ({ row }) => (
          <span className="q-money">¥ {money(row.original.price)}</span>
        ),
      },
      {
        accessorKey: "date",
        header: "报价日期",
        cell: ({ row }) => (
          <div>
            <span className="q-date">{row.original.date}</span>
            <span className="q-meta">{row.original.result}</span>
          </div>
        ),
      },
    ],
    []
  )
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  return (
    <section className="q-page q-history">
      <header className="q-page-heading">
        <div>
          <h1>历史报价</h1>
          <p>按产品、图号或客户查找，核对原条件后复用。</p>
        </div>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft />
            返回本次报价
          </Button>
        )}
      </header>
      {returnTitle && (
        <div className="q-return-context">
          正在为 <strong>{returnTitle}</strong> 添加明细
          <span>复用时优先加入这份草稿</span>
        </div>
      )}
      <div className="q-history-controls">
        <SearchInput
          value={query}
          onChange={setQuery}
          label="搜索产品、图号、材质或客户"
          inputRef={inputRef}
        />
        <FilterSelect
          label="全部业务"
          value={type}
          values={["全部", "成套", "钣金"]}
          onChange={setType}
        />
        <label className="q-check-label">
          <Checkbox checked={verified} onCheckedChange={setVerified} />
          仅看已核实
        </label>
        <span className="q-result-count">{filtered.length} 条明细</span>
      </div>
      <div className="q-history-table">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    <button
                      className="q-column-sort"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={
                        "按" + String(header.column.columnDef.header) + "排序"
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() ? (
                        <ArrowDown
                          className={
                            header.column.getIsSorted() === "asc"
                              ? "q-rotated"
                              : ""
                          }
                        />
                      ) : (
                        <ArrowDownUp />
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-selected={detailOpen && selected === row.original.id}
                onClick={(event) => {
                  detailReturnFocus.current =
                    event.currentTarget.querySelector<HTMLButtonElement>(
                      ".q-text-button"
                    )
                  pendingReuse.current = null
                  setSelected(row.original.id)
                  setDetailOpen(true)
                  setExpanded(false)
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!filtered.length && (
        <Empty
          title="没有找到匹配明细"
          message="试试图号的一部分，或放宽业务类型与核实状态。"
          onClear={() => {
            setQuery("")
            setType("全部")
            setVerified(false)
          }}
        />
      )}
      <div className="q-list-foot">
        <span>选择一条明细，查看配置与来源</span>
        <span>历史价格仅供参考</span>
      </div>
      <DetailSheet
        open={detailOpen && !!item}
        onClose={() => setDetailOpen(false)}
        returnFocus={detailReturnFocus}
        onCloseComplete={() => {
          const next = pendingReuse.current
          pendingReuse.current = null
          if (next) onReuse(next, detailReturnFocus.current)
        }}
        title={item?.name ?? "历史明细"}
        description={
          item
            ? item.type + " · " + item.drawing + " · " + item.revision + " 版"
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              返回列表
            </Button>
            <Button
              onClick={() => {
                if (item) {
                  pendingReuse.current = item
                  setDetailOpen(false)
                }
              }}
            >
              复用这条明细
              <ArrowRight />
            </Button>
          </>
        }
      >
        {item && (
          <>
            <div className="q-sheet-price">
              <div>
                <span>
                  历史单价<small>人民币 · 未税</small>
                </span>
                <strong>
                  <small>¥</small>
                  {money(item.price)}
                </strong>
              </div>
              <Status tone={item.verified ? "green" : "amber"}>
                {item.verified ? "资料已核实" : "待核实"}
              </Status>
            </div>
            <dl className="q-spec-list">
              <div>
                <dt>客户</dt>
                <dd>{item.customer}</dd>
              </div>
              <div>
                <dt>原项目</dt>
                <dd>{item.project}</dd>
              </div>
              <div>
                <dt>当时报价数量</dt>
                <dd>
                  {item.qty} {item.unit}
                </dd>
              </div>
              <div>
                <dt>规格</dt>
                <dd>{item.spec}</dd>
              </div>
              <div>
                <dt>材料</dt>
                <dd>{item.material}</dd>
              </div>
              <div>
                <dt>表面处理</dt>
                <dd>{item.finish}</dd>
              </div>
              <div>
                <dt>报价日期</dt>
                <dd>
                  {item.date} · {item.result}
                </dd>
              </div>
            </dl>
            <div className="q-sheet-section">
              <button
                className="q-disclosure"
                aria-expanded={expanded}
                aria-controls={expanded ? costDisclosureId : undefined}
                onClick={() => setExpanded(!expanded)}
              >
                <span>单{item.unit}成本构成</span>
                <span>
                  {costTotal(item) === null
                    ? "待核价"
                    : "¥ " + money(costTotal(item)!)}
                  <ChevronDown />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    id={costDisclosureId}
                    className="q-collapse"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  >
                    <div className="q-cost-mini">
                      {item.costs.map((cost) => (
                        <div key={cost.id}>
                          <span>{cost.name}</span>
                          <span>
                            {cost.price === null
                              ? "待核价"
                              : money(cost.price * cost.qty)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="q-sheet-section">
              <h3>来源依据</h3>
              <div className="q-source-file">
                <FileSpreadsheet />
                <div>
                  <strong>{item.quote}.xlsx</strong>
                  <span>报价明细 · 演示来源</span>
                </div>
              </div>
              <div className="q-source-file">
                <FileText />
                <div>
                  <strong>
                    {item.drawing}_{item.revision}.pdf
                  </strong>
                  <span>图纸索引示例 · 未附真实图纸</span>
                </div>
              </div>
            </div>
            <p className="q-footnote">
              历史单价保留原样。复用后需重新确认本次数量、配置与价格依据。
            </p>
          </>
        )}
      </DetailSheet>
    </section>
  )
}
