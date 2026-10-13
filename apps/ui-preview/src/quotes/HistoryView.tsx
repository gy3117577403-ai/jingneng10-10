import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  History,
  Layers3,
  ShieldCheck,
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
import { Empty, FilterSelect, SearchInput, Status, TypeIcon } from "./shared"

export function HistoryView({
  lines,
  query,
  setQuery,
  type,
  setType,
  verified,
  setVerified,
  onReuse,
}: {
  lines: HistoricalLine[]
  query: string
  setQuery: (query: string) => void
  onReuse: (line: HistoricalLine) => void
  type: string
  setType: (value: string) => void
  verified: boolean
  setVerified: (value: boolean) => void
}) {
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState("h1"),
    [expanded, setExpanded] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ])
  const filtered = useMemo(
    () => searchHistory(lines, query, type, verified),
    [lines, query, type, verified]
  )
  const item = filtered.find((line) => line.id === selected) ?? filtered[0]
  const columns = useMemo<ColumnDef<HistoricalLine>[]>(
    () => [
      {
        accessorKey: "name",
        header: "产品 / 图号",
        cell: ({ row }) => (
          <div className="q-product-cell">
            <TypeIcon type={row.original.type} small />
            <div>
              <button
                className="q-text-button"
                onClick={() => setSelected(row.original.id)}
              >
                {row.original.name}
              </button>
              <span className="q-meta mono">
                {row.original.drawing}{" "}
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
            <span className="q-date">
              {row.original.date.slice(5).replace("-", "/")}
            </span>
            <span className="q-meta">{row.original.result}</span>
          </div>
        ),
      },
    ],
    []
  )
  // The generated shadcn Table and TanStack's headless sorting are used together.
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  return (
    <div className="q-history-layout">
      <section className="q-history-main">
        <div className="q-page-title">
          <div>
            <div className="q-eyebrow">公司报价资料</div>
            <h1>找到参考，开始下一份报价。</h1>
            <p>按产品、图号或客户查找，核对差异后复用。</p>
          </div>
          <span className="q-page-symbol">
            <History />
          </span>
        </div>
        <div className="q-filterbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            label="搜索产品、图号、材质或客户"
          />
          <FilterSelect
            label="全部业务"
            value={type}
            values={["全部", "成套", "钣金"]}
            onChange={setType}
          />
        </div>
        <div className="q-list-toolbar">
          <span>
            报价明细 <b>{filtered.length}</b>
          </span>
          <label className="q-check-label">
            <Checkbox
              checked={verified}
              onCheckedChange={(value) => setVerified(value)}
            />
            仅看已核实资料
          </label>
        </div>
        <div className="q-history-table">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      <button
                        className="q-column-sort"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`按${String(header.column.columnDef.header)}排序`}
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
                  data-selected={item?.id === row.original.id}
                  onClick={() => setSelected(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
        <div className="q-table-note">
          <ShieldCheck />
          所有客户、价格及来源均为虚构演示资料
          <span>共 {filtered.length} 条明细</span>
        </div>
        <div className="q-history-hint">
          <Layers3 />
          <div>
            <strong>复用的是报价依据，也保留每次差异。</strong>
            <p>
              历史单价不会随新报价修改；加入草稿后，需要重新确认本次数量、配置与成本。
            </p>
          </div>
        </div>
      </section>
      {item && (
        <aside className="q-inspector" aria-label="历史明细详情">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 7 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              <div className="q-inspector-head">
                <span>明细详情</span>
                <Status tone={item.verified ? "green" : "amber"}>
                  {item.verified ? "资料已核实" : "待核实"}
                </Status>
              </div>
              <div className="q-inspector-product">
                <TypeIcon type={item.type} />
                <div>
                  <h2>{item.name}</h2>
                  <p>
                    {item.type} · {item.drawing}
                  </p>
                </div>
              </div>
              <div className="q-price-focus">
                <span>
                  历史报价单价 <small>未税 · 人民币</small>
                </span>
                <strong>
                  <small>¥</small>
                  {money(item.price)}
                </strong>
                <p>
                  当时报价数量 {item.qty} {item.unit}，仅供本次核价参考
                </p>
              </div>
              <dl className="q-spec-list">
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
                  <dt>图纸版本</dt>
                  <dd>{item.revision} 版</dd>
                </div>
                <div>
                  <dt>客户</dt>
                  <dd>{item.customer}</dd>
                </div>
              </dl>
              <div className="q-divider" />
              <button
                className="q-disclosure"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                <span>
                  单{item.unit}成本构成{" "}
                  <small>
                    {costTotal(item) === null
                      ? "待核价"
                      : `¥ ${money(costTotal(item)!)}`}
                  </small>
                </span>
                {expanded ? <ChevronDown /> : <ChevronRight />}
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="costs"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                    className="q-collapse"
                  >
                    <div className="q-cost-mini">
                      {item.costs.map((cost) => (
                        <div key={cost.id}>
                          <span>{cost.name}</span>
                          <span className="q-number">
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
              <div className="q-divider" />
              <div className="q-source-label">来源依据</div>
              <div className="q-source-file">
                <FileSpreadsheet />
                <div>
                  <strong>{item.quote}.xlsx</strong>
                  <span>报价明细 · {item.date} · 演示来源</span>
                </div>
                <Check />
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
              <p className="q-footnote">
                价格与资料均为 UI 演示，不构成实际报价依据。
              </p>
              <Button className="q-wide" onClick={() => onReuse(item)}>
                复用这条明细
                <ArrowRight />
              </Button>
            </motion.div>
          </AnimatePresence>
        </aside>
      )}
    </div>
  )
}
