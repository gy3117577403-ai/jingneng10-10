import { useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  FileSearch,
  History,
  Info,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  costTotal,
  issues,
  lineAmount,
  money,
  total,
  updateLine,
  type Cost,
  type DraftLine,
  type Quote,
} from "./model"
import { DetailSheet, Empty, Status } from "./shared"
import { historyLines } from "./demo"

export type EditorState = { tab: "lines" | "costs"; selected: string }
export function Editor({
  quote,
  state,
  onStateChange,
  onChange,
  onBack,
  onHistory,
  onReview,
  onDocument,
  onRevision,
  onRemove,
}: {
  quote: Quote
  state: EditorState
  onStateChange: (state: EditorState) => void
  onChange: (quote: Quote) => void
  onBack: () => void
  onHistory: () => void
  onReview: () => void
  onDocument: () => void
  onRevision: () => void
  onRemove: (id: string) => void
}) {
  const reduced = useReducedMotion()
  const [noteOpen, setNoteOpen] = useState(false)
  const [basisId, setBasisId] = useState<string | null>(null)
  const [basisOpen, setBasisOpen] = useState(false)
  const costTabRef = useRef<HTMLButtonElement>(null)
  const costHeaders = useRef<Record<string, HTMLButtonElement | null>>({})
  const [expandedCosts, setExpandedCosts] = useState<
    Record<string, string | null>
  >({})
  const line =
    quote.lines.find((item) => item.id === state.selected) ?? quote.lines[0]
  const locked = quote.status === "预览已核对",
    problems = issues(quote)
  const pendingLines = quote.lines.filter((item) => !item.checked).length
  const activeCost =
    line &&
    (line.id in expandedCosts
      ? expandedCosts[line.id]
      : (line.costs.find((cost) => !cost.checked)?.id ?? null))
  const basis = line?.costs.find((cost) => cost.id === basisId)
  const source = line && historyLines.find((item) => item.id === line.sourceId)
  const patch = (id: string, changes: Partial<DraftLine>) =>
    onChange({
      ...quote,
      lines: quote.lines.map((item) =>
        item.id === id ? updateLine(item, changes) : item
      ),
    })
  const patchCost = (cost: Cost, changes: Partial<Cost>) => {
    if (!line || locked) return
    patch(line.id, {
      costs: line.costs.map((item) =>
        item.id === cost.id
          ? {
              ...item,
              ...changes,
              ...("price" in changes || "source" in changes
                ? { checked: false }
                : {}),
            }
          : item
      ),
    })
  }
  const allCostsChecked = line?.costs.every(
    (cost) =>
      cost.price !== null &&
      Number.isFinite(cost.price) &&
      cost.price >= 0 &&
      cost.checked &&
      cost.source.trim()
  )
  const showCosts = (id?: string) => {
    onStateChange({ tab: "costs", selected: id ?? line?.id ?? "" })
    costTabRef.current?.focus({ preventScroll: true })
  }
  return (
    <div className="q-editor">
      <header className="q-document-head">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="返回报价工作台"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="q-document-title">
          <h1>{quote.title}</h1>
          <p>
            {quote.customer}
            <span>·</span>
            <span className="mono">{quote.id}</span>
            <span>· V{quote.revision}</span>
          </p>
        </div>
        <div className="q-document-actions">
          <Status tone={locked ? "green" : "neutral"}>
            {locked ? "预览已核对" : "草稿"}
          </Status>
          <Button variant="outline" onClick={onDocument}>
            <FileSearch />
            报价单预览
          </Button>
        </div>
      </header>
      <Tabs
        value={state.tab}
        onValueChange={(value) =>
          onStateChange({ ...state, tab: value as EditorState["tab"] })
        }
        className="q-editor-workspace"
      >
        <div className="q-editor-tabs">
          <TabsList variant="line" aria-label="报价工作区">
            <TabsTrigger value="lines">
              报价明细 <span>{quote.lines.length}</span>
            </TabsTrigger>
            <TabsTrigger value="costs" ref={costTabRef}>
              成本核价
              {pendingLines > 0 && (
                <span className="q-pending-count">{pendingLines}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <span className="q-tab-context">
            {quote.type}业务<span>·</span>人民币 / 未税
          </span>
        </div>
        <TabsContent value="lines" className="q-editor-panel">
          <motion.section
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
          >
            <div className="q-section-toolbar">
              <div>
                <h2>本次报价明细</h2>
                <p>维护数量与对外价格，成本在「成本核价」中处理。</p>
              </div>
              {!locked && (
                <Button variant="outline" onClick={onHistory}>
                  <Plus />
                  从历史添加
                </Button>
              )}
            </div>
            <div className="q-lines-table">
              <div className="q-edit-columns q-list-labels" aria-hidden="true">
                <span>产品 / 规格</span>
                <span>数量</span>
                <span>未税单价</span>
                <span>未税金额</span>
                <span>核价状态</span>
                <span />
              </div>
              {quote.lines.map((item) => {
                const missing = item.costs.some((cost) => cost.price === null)
                return (
                  <div className="q-edit-columns q-edit-row" key={item.id}>
                    <div className="q-line-product">
                      <strong>{item.name}</strong>
                      <span className="q-meta">{item.spec}</span>
                      <span className="q-meta mono">{item.drawing}</span>
                    </div>
                    <label className="q-quantity-input">
                      <span className="q-mobile-label">数量</span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        aria-label={item.name + "数量"}
                        value={item.qty || ""}
                        disabled={locked}
                        onChange={(event) =>
                          patch(item.id, {
                            qty: Math.max(0, Number(event.target.value)),
                          })
                        }
                      />
                      <span>{item.unit}</span>
                    </label>
                    <label className="q-price-input">
                      <span className="q-mobile-label">未税单价</span>
                      <Input
                        type="number"
                        min="0"
                        step=".01"
                        aria-label={item.name + "未税单价"}
                        value={item.price || ""}
                        disabled={locked}
                        onChange={(event) =>
                          patch(item.id, {
                            price: Math.max(0, Number(event.target.value)),
                          })
                        }
                      />
                    </label>
                    <strong className="q-money q-line-amount">
                      <span className="q-mobile-label">未税金额 </span>
                      {money(lineAmount(item.price, item.qty))}
                    </strong>
                    <button
                      className={
                        "q-line-status " + (item.checked ? "complete" : "")
                      }
                      onClick={() => showCosts(item.id)}
                      aria-label={"核价：" + item.name}
                    >
                      {item.checked ? (
                        <Check />
                      ) : (
                        <span className="q-state-dot" />
                      )}
                      {item.checked
                        ? "已核对"
                        : missing
                          ? "待补价格"
                          : "待核对"}
                      <ChevronRight />
                    </button>
                    {!locked && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="q-remove-line"
                        aria-label={"移除" + item.name}
                        onClick={() => onRemove(item.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )
              })}
              {!quote.lines.length && (
                <Empty
                  title="添加第一条报价明细"
                  message="从历史报价选择相近产品，再核对本次配置和价格。"
                />
              )}
            </div>
            <div className="q-note-section">
              <button
                className="q-note-toggle"
                aria-expanded={noteOpen}
                onClick={() => setNoteOpen(!noteOpen)}
              >
                <span>
                  <ChevronRight className={noteOpen ? "q-open-chevron" : ""} />
                  <strong>报价范围与说明</strong>
                </span>
                <span>
                  {noteOpen ? "收起" : locked ? "查看说明" : "编辑说明"}
                </span>
              </button>
              {!noteOpen && <p>{quote.note || "尚未填写报价说明"}</p>}
              <AnimatePresence initial={false}>
                {noteOpen && (
                  <motion.div
                    className="q-collapse"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  >
                    <Textarea
                      aria-label="报价范围与说明"
                      value={quote.note}
                      disabled={locked}
                      onChange={(event) =>
                        onChange({ ...quote, note: event.target.value })
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </TabsContent>
        <TabsContent value="costs" className="q-editor-panel">
          {line ? (
            <motion.section
              key={line.id}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
              className="q-cost-workspace"
            >
              <div className="q-section-toolbar q-cost-toolbar">
                <div>
                  <h2>核对当前产品成本</h2>
                  <p>每次只展开一项。价格与依据确认后，再核对本次配置。</p>
                </div>
                {quote.lines.length > 1 && (
                  <Select
                    value={line.id}
                    onValueChange={(value) =>
                      value && onStateChange({ tab: "costs", selected: value })
                    }
                  >
                    <SelectTrigger aria-label="选择核价产品">
                      <SelectValue>{line.name}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="q-popover">
                      {quote.lines.map((item, index) => (
                        <SelectItem key={item.id} value={item.id}>
                          {index + 1}. {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="q-cost-product">
                <div>
                  <strong>{line.name}</strong>
                  <span>
                    {line.spec}
                    <span className="q-meta-separator">·</span>
                    {line.drawing}
                  </span>
                </div>
                <div className="q-quantity-diff">
                  <span>本次数量</span>
                  <strong>
                    {line.qty}
                    <small>{line.unit}</small>
                  </strong>
                  <span>
                    历史 {line.sourceQty} {line.unit}
                  </span>
                </div>
              </div>
              <div className="q-cost-list" aria-label={line.name + "成本构成"}>
                <div className="q-cost-list-caption">
                  <span>单{line.unit}成本构成</span>
                  <span>
                    {line.costs.filter((cost) => cost.checked).length} /{" "}
                    {line.costs.length} 项已确认
                  </span>
                </div>
                {line.costs.map((cost) => {
                  const expanded = activeCost === cost.id
                  const valid =
                    cost.price !== null &&
                    Number.isFinite(cost.price) &&
                    cost.price >= 0 &&
                    !!cost.source.trim()
                  return (
                    <div
                      className={"q-cost-item " + (expanded ? "is-open" : "")}
                      key={cost.id}
                    >
                      <button
                        className="q-cost-item-toggle"
                        ref={(element) => {
                          costHeaders.current[cost.id] = element
                        }}
                        aria-label={
                          (expanded ? "收起" : "展开") + cost.name + "核价"
                        }
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedCosts({
                            ...expandedCosts,
                            [line.id]: expanded ? null : cost.id,
                          })
                        }
                      >
                        <span
                          className={
                            "q-cost-state " +
                            (cost.checked ? "complete" : "pending")
                          }
                        >
                          {cost.checked ? <Check /> : <span />}
                        </span>
                        <span className="q-cost-item-name">
                          <strong>{cost.name}</strong>
                          <span>{cost.spec}</span>
                        </span>
                        <span
                          className={
                            "q-cost-item-price " +
                            (cost.price === null ? "pending" : "")
                          }
                        >
                          {cost.price === null
                            ? "待核价"
                            : "¥ " + money(cost.price * cost.qty)}
                        </span>
                        <ChevronDown
                          className={expanded ? "q-up-chevron" : ""}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            className="q-collapse"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.2 }}
                          >
                            <div className="q-cost-edit">
                              <div className="q-cost-edit-fields">
                                <label>
                                  单价 / 元
                                  <span className="q-unit-hint">
                                    每{cost.unit}
                                  </span>
                                  <Input
                                    type="number"
                                    min="0"
                                    step=".01"
                                    aria-label={cost.name + "成本价格"}
                                    value={cost.price ?? ""}
                                    disabled={locked}
                                    placeholder="填写价格"
                                    onChange={(event) =>
                                      patchCost(cost, {
                                        price:
                                          event.target.value === ""
                                            ? null
                                            : Math.max(
                                                0,
                                                Number(event.target.value)
                                              ),
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  本次价格依据
                                  <Input
                                    aria-label={cost.name + "价格来源"}
                                    value={cost.source}
                                    disabled={locked}
                                    placeholder="例如：供应商报价单与日期"
                                    onChange={(event) =>
                                      patchCost(cost, {
                                        source: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                              <div className="q-cost-edit-actions">
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setBasisId(cost.id)
                                    setBasisOpen(true)
                                  }}
                                >
                                  <History />
                                  查看来源记录
                                </Button>
                                {!locked && (
                                  <Button
                                    variant={
                                      cost.checked ? "outline" : "default"
                                    }
                                    disabled={!valid}
                                    onClick={() => {
                                      if (cost.checked) {
                                        patchCost(cost, { checked: false })
                                        return
                                      }
                                      patchCost(cost, { checked: true })
                                      const next = line.costs.find(
                                        (item) =>
                                          item.id !== cost.id && !item.checked
                                      )
                                      setExpandedCosts({
                                        ...expandedCosts,
                                        [line.id]: next?.id ?? null,
                                      })
                                      costHeaders.current[
                                        next?.id ?? cost.id
                                      ]?.focus({ preventScroll: true })
                                    }}
                                  >
                                    {cost.checked ? (
                                      <RotateCcw />
                                    ) : (
                                      <CheckCheck />
                                    )}
                                    {cost.checked
                                      ? "重新核对此项"
                                      : "确认此项依据"}
                                  </Button>
                                )}
                              </div>
                              {!valid && (
                                <p className="q-field-hint">
                                  <Info />
                                  填写价格和来源后，可以确认此项。
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
                <div className="q-cost-total">
                  <span>单{line.unit}内部成本合计</span>
                  <strong>
                    {costTotal(line) === null
                      ? "待补齐"
                      : "¥ " + money(costTotal(line)!)}
                  </strong>
                </div>
              </div>
              <div className="q-final-line-check">
                <label className="q-check-label">
                  <Checkbox
                    aria-label="确认本次数量与配置"
                    checked={line.checked}
                    disabled={
                      locked ||
                      !allCostsChecked ||
                      line.qty <= 0 ||
                      line.price <= 0
                    }
                    onCheckedChange={(checked) => patch(line.id, { checked })}
                  />
                  <span>
                    <strong>已核对本次数量、配置与价格</strong>
                    <small>
                      {allCostsChecked
                        ? "本次 " +
                          line.qty +
                          " " +
                          line.unit +
                          "，对外单价 ¥ " +
                          money(line.price) +
                          "；历史单价 ¥ " +
                          money(line.sourcePrice)
                        : "先完成上方各项价格依据的确认。"}
                    </small>
                  </span>
                </label>
              </div>
            </motion.section>
          ) : (
            <Empty
              title="尚未添加报价明细"
              message="返回报价明细，从历史报价添加产品。"
            />
          )}
        </TabsContent>
      </Tabs>
      <footer className="q-editor-footer">
        <div className="q-footer-total">
          <span>
            未税合计<small>{quote.lines.length} 项明细</small>
          </span>
          <strong>
            <small>¥</small>
            {money(total(quote))}
          </strong>
        </div>
        <div className="q-footer-action">
          <span className={problems.length ? "q-pending-text" : "q-green-text"}>
            {locked ? (
              <ShieldCheck />
            ) : problems.length ? (
              <span className="q-state-dot" />
            ) : (
              <Check />
            )}
            {locked
              ? "此版本只读"
              : problems.length
                ? problems.length + " 项待核对"
                : "明细已准备好"}
          </span>
          {locked ? (
            <Button onClick={onRevision}>
              <Plus />
              创建修订草稿
            </Button>
          ) : state.tab === "lines" &&
            quote.lines.length > 0 &&
            problems.length > 0 ? (
            <Button
              onClick={() =>
                showCosts(quote.lines.find((item) => !item.checked)?.id)
              }
            >
              继续核价
              <ArrowRight />
            </Button>
          ) : (
            <Button onClick={onReview}>
              核对报价
              <ArrowRight />
            </Button>
          )}
        </div>
      </footer>
      <DetailSheet
        open={basisOpen && !!basis}
        onClose={() => setBasisOpen(false)}
        title={basis ? basis.name + " · 来源记录" : "来源记录"}
        description="对照本次填写的依据与历史来源。"
        footer={
          <Button variant="outline" onClick={() => setBasisOpen(false)}>
            返回核价
          </Button>
        }
      >
        {basis && (
          <>
            <div className="q-sheet-section">
              <h3>本次依据</h3>
              <p>{basis.source || "尚未填写"}</p>
              <span className="q-meta">
                单价{" "}
                {basis.price === null ? "待补齐" : "¥ " + money(basis.price)} /{" "}
                {basis.unit}
              </span>
            </div>
            <div className="q-sheet-section">
              <h3>历史报价来源</h3>
              <p>{source ? source.quote + ".xlsx" : "未关联历史报价"}</p>
              <span className="q-meta">{source?.date} · 演示报价索引</span>
            </div>
            <div className="q-sheet-section">
              <h3>图纸版本</h3>
              <p>
                {source
                  ? source.drawing + " · " + source.revision + " 版"
                  : "未关联图纸"}
              </p>
              <span className="q-meta">图纸索引示例，未附真实图纸</span>
            </div>
            <p className="q-footnote">
              来源均为虚构演示资料，不作为实际计价依据。
            </p>
          </>
        )}
      </DetailSheet>
    </div>
  )
}
