import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FileCheck2,
  FileSearch,
  History,
  Info,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
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
import { Empty, Status, TypeIcon } from "./shared"

export function Editor({
  quote,
  onChange,
  onBack,
  onHistory,
  onReview,
  onDocument,
  onRevision,
  onRemove,
}: {
  quote: Quote
  onChange: (quote: Quote) => void
  onBack: () => void
  onHistory: () => void
  onReview: () => void
  onDocument: () => void
  onRevision: () => void
  onRemove: (id: string) => void
}) {
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState(quote.lines[0]?.id ?? ""),
    [openCosts, setOpenCosts] = useState(true)
  const [expanded, setExpanded] = useState<string[]>([quote.lines[0]?.id ?? ""])
  const line =
    quote.lines.find((item) => item.id === selected) ?? quote.lines[0]
  const problems = issues(quote),
    locked = quote.status === "预览已核对"
  const patch = (id: string, changes: Partial<DraftLine>) =>
    onChange({
      ...quote,
      lines: quote.lines.map((item) =>
        item.id === id ? updateLine(item, changes) : item
      ),
    })
  const patchCost = (cost: Cost, changes: Partial<Cost>) =>
    line &&
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
  const allCostsChecked = line?.costs.every(
    (cost) =>
      cost.price !== null &&
      cost.price >= 0 &&
      cost.checked &&
      cost.source.trim()
  )
  return (
    <div className="q-editor">
      <div className="q-editor-heading">
        <div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="返回报价工作台"
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1>{quote.title}</h1>
            <p>
              <span className="mono">{quote.id}</span>
              <span>V{quote.revision}</span>
              <span>{quote.customer}</span>
            </p>
          </div>
        </div>
        <div>
          <Status tone={locked ? "green" : "neutral"}>
            {locked ? "预览已核对" : "报价草稿"}
          </Status>
          <Button variant="outline" onClick={onDocument}>
            <FileSearch />
            报价单预览
          </Button>
          {locked ? (
            <Button onClick={onRevision}>
              创建修订草稿
              <Plus />
            </Button>
          ) : (
            <Button onClick={onReview}>
              <FileCheck2 />
              核对报价
            </Button>
          )}
        </div>
      </div>
      <div className="q-editor-grid">
        <section className="q-editor-main">
          <div className="q-stepbar">
            <span className="done">
              <CircleCheck />
              需求已记录
            </span>
            <i />
            <span className={locked ? "done" : "active"}>
              {locked ? <CircleCheck /> : <span className="q-step-dot">2</span>}
              明细与核价
            </span>
            <i />
            <span className={locked ? "done" : ""}>
              {locked ? <CircleCheck /> : <span className="q-step-dot">3</span>}
              报价核对
            </span>
          </div>
          <div className={`q-context-note ${locked ? "success" : ""}`}>
            {locked ? <ShieldCheck /> : <Info />}
            <div>
              <strong>
                {locked
                  ? "此演示版本已锁定"
                  : quote.type === "成套"
                    ? "整柜报价，分项核价"
                    : "按图报价，逐项核对"}
              </strong>
              <span>
                {locked
                  ? "创建修订草稿可继续修改，已核对版本保留。此状态仅用于交互预览。"
                  : "内部成本在展开项中维护，客户报价单仅展示产品与对外价格。"}
              </span>
            </div>
          </div>
          <div className="q-section-heading">
            <div>
              <h2>报价明细</h2>
              <span>
                {quote.lines.length} 项 · {quote.type}业务
              </span>
            </div>
            {!locked && (
              <Button variant="outline" onClick={onHistory}>
                <History />
                从历史复用
              </Button>
            )}
          </div>
          <div className="q-line-grid q-line-labels">
            <span>产品 / 配置</span>
            <span>数量</span>
            <span>未税单价</span>
            <span>未税金额</span>
            <span />
          </div>
          <div className="q-lines">
            {quote.lines.map((item) => (
              <div
                className={`q-line-block ${line?.id === item.id ? "selected" : ""}`}
                key={item.id}
              >
                <div className="q-line-grid q-line-row">
                  <div className="q-line-name">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${expanded.includes(item.id) ? "收起" : "展开"}${item.name}成本`}
                      aria-expanded={expanded.includes(item.id)}
                      onClick={() => {
                        setSelected(item.id)
                        setExpanded(
                          expanded.includes(item.id)
                            ? expanded.filter((id) => id !== item.id)
                            : [...expanded, item.id]
                        )
                      }}
                    >
                      <motion.span
                        animate={{
                          rotate: expanded.includes(item.id) ? 90 : 0,
                        }}
                      >
                        <ChevronRight />
                      </motion.span>
                    </Button>
                    <div>
                      <button
                        className="q-text-button"
                        onClick={() => setSelected(item.id)}
                      >
                        {item.name}
                      </button>
                      <span className="q-meta">{item.spec}</span>
                    </div>
                  </div>
                  <label className="q-inline-input">
                    <Input
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      aria-label={`${item.name}数量`}
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
                  <Input
                    className="q-money-input"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`${item.name}未税单价`}
                    value={item.price || ""}
                    disabled={locked}
                    onChange={(event) =>
                      patch(item.id, {
                        price: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                  <strong className="q-money">
                    {money(lineAmount(item.price, item.qty))}
                  </strong>
                  {!locked && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`移除${item.name}`}
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {expanded.includes(item.id) && (
                    <motion.div
                      className="q-collapse"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.22 }}
                    >
                      <div className="q-expanded-costs">
                        <div className="q-cost-caption">
                          <span>单{item.unit}内部成本</span>
                          <span>金额 / 元</span>
                        </div>
                        {item.costs.map((cost) => (
                          <button
                            key={cost.id}
                            className="q-cost-branch"
                            onClick={() => {
                              setSelected(item.id)
                              setOpenCosts(true)
                              requestAnimationFrame(() =>
                                document
                                  .getElementById(`price-${cost.id}`)
                                  ?.focus()
                              )
                            }}
                          >
                            <span className="q-branch-dot" />
                            <strong>{cost.name}</strong>
                            <span className="q-cost-spec">{cost.spec}</span>
                            <span
                              className={
                                cost.price === null
                                  ? "q-amber-text"
                                  : "q-number"
                              }
                            >
                              {cost.price === null
                                ? "待核价"
                                : money(cost.price * cost.qty)}
                            </span>
                            {cost.checked ? (
                              <Check className="q-green-icon" />
                            ) : (
                              <CircleHelp className="q-amber-icon" />
                            )}
                          </button>
                        ))}
                        <div className="q-cost-subtotal">
                          <span>内部成本合计</span>
                          <strong>
                            {costTotal(item) === null
                              ? "待补齐"
                              : `¥ ${money(costTotal(item)!)}`}
                          </strong>
                        </div>
                        <div className="q-line-diff">
                          <History />
                          <span>
                            历史数量 {item.sourceQty} {item.unit}
                            {item.qty !== item.sourceQty && (
                              <>
                                {" "}
                                <ArrowRight />{" "}
                                <b>
                                  本次 {item.qty} {item.unit}
                                </b>
                              </>
                            )}
                            <span className="q-diff-separator">·</span>历史单价
                            ¥ {money(item.sourcePrice)}
                          </span>
                          {item.checked ? (
                            <span className="q-green-text">
                              <Check />
                              差异已核对
                            </span>
                          ) : (
                            <button
                              className="q-link"
                              onClick={() => setSelected(item.id)}
                            >
                              核对本次差异
                              <ArrowRight />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          {!quote.lines.length && (
            <Empty
              title="从一条历史明细开始"
              message="找到相近配置，复用后核对本次差异。"
            />
          )}
          {!locked && (
            <button className="q-add-line" onClick={onHistory}>
              <Plus />
              从历史报价添加明细
            </button>
          )}
          <div className="q-commercial">
            <div>
              <label htmlFor="quote-note">报价范围与说明</label>
              <Textarea
                id="quote-note"
                value={quote.note}
                disabled={locked}
                onChange={(event) =>
                  onChange({ ...quote, note: event.target.value })
                }
                placeholder="填写包含的供货、装配、调试范围及需要说明的条件"
              />
            </div>
            <div className="q-total">
              <div>
                <span>报价口径</span>
                <span>人民币 · 未税</span>
              </div>
              <div>
                <span>明细数量</span>
                <span>{quote.lines.length} 项</span>
              </div>
              <div className="q-grand-total">
                <span>报价合计</span>
                <strong>
                  <small>¥</small>
                  {money(total(quote))}
                </strong>
              </div>
              <p>含税及合同条件在正式接入时按企业规则配置</p>
            </div>
          </div>
        </section>
        <aside
          className="q-inspector q-edit-inspector"
          aria-label="本次核价面板"
        >
          <div className="q-inspector-head">
            <span>本次核价</span>
            <span
              className={`q-small-count ${problems.length ? "amber" : "green"}`}
            >
              {problems.length ? `${problems.length} 项待处理` : "已完成核对"}
            </span>
          </div>
          {line ? (
            <>
              <div className="q-inspector-product compact">
                <TypeIcon type={quote.type} small />
                <div>
                  <h2>{line.name}</h2>
                  <p>{line.drawing}</p>
                </div>
              </div>
              <div className="q-review-difference">
                <span>与历史报价相比</span>
                <div>
                  <span>数量</span>
                  <span>
                    {line.sourceQty} {line.unit}
                    <ArrowRight />
                    <b>
                      {line.qty} {line.unit}
                    </b>
                  </span>
                </div>
                <div>
                  <span>单价</span>
                  <span>
                    {money(line.sourcePrice)}
                    <ArrowRight />
                    <b>{money(line.price)}</b>
                  </span>
                </div>
              </div>
              <button
                className="q-disclosure"
                aria-expanded={openCosts}
                onClick={() => setOpenCosts(!openCosts)}
              >
                <span>
                  价格与依据 <small>逐项确认</small>
                </span>
                {openCosts ? <ChevronDown /> : <ChevronRight />}
              </button>
              <AnimatePresence initial={false}>
                {openCosts && (
                  <motion.div
                    className="q-collapse"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  >
                    <div className="q-cost-fields">
                      {line.costs.map((cost) => (
                        <div
                          className={`q-cost-field ${cost.price === null ? "missing" : ""}`}
                          key={cost.id}
                        >
                          <div>
                            <label htmlFor={`price-${cost.id}`}>
                              {cost.name}
                              <small> / {cost.unit}</small>
                            </label>
                            <label className="q-check-label">
                              <Checkbox
                                aria-label={`确认${cost.name}依据`}
                                checked={cost.checked}
                                disabled={
                                  locked ||
                                  cost.price === null ||
                                  !cost.source.trim()
                                }
                                onCheckedChange={(checked) =>
                                  patchCost(cost, { checked })
                                }
                              />
                              <span>{cost.checked ? "已确认" : "确认"}</span>
                            </label>
                          </div>
                          <div className="q-currency-field">
                            <span>¥</span>
                            <Input
                              id={`price-${cost.id}`}
                              aria-label={`${cost.name}成本价格`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={cost.price ?? ""}
                              placeholder="填写成本价格"
                              disabled={locked}
                              onChange={(event) =>
                                patchCost(cost, {
                                  price:
                                    event.target.value === ""
                                      ? null
                                      : Math.max(0, Number(event.target.value)),
                                })
                              }
                            />
                          </div>
                          <Input
                            className="q-source-input"
                            aria-label={`${cost.name}价格来源`}
                            value={cost.source}
                            disabled={locked}
                            onChange={(event) =>
                              patchCost(cost, { source: event.target.value })
                            }
                          />
                          {cost.price === null && (
                            <small className="q-field-error">
                              填写价格与来源后，确认本次依据。
                            </small>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="q-configuration-check">
                <label className="q-check-label">
                  <Checkbox
                    id="q-configuration-check"
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
                  <span>已核对本次数量、配置与价格</span>
                </label>
                {!allCostsChecked && <p>先补齐上方价格并逐项确认依据。</p>}
              </div>
            </>
          ) : (
            <p className="q-footnote">添加报价明细后，在这里核对价格依据。</p>
          )}
          {problems.length === 0 && (
            <div className="q-ready">
              <CheckCheck />
              <div>
                <strong>明细已准备好</strong>
                <p>
                  {locked
                    ? "此版本为预览核对状态。"
                    : "可以进入报价核对并预览报价单。"}
                </p>
              </div>
            </div>
          )}
          <div className="q-inline-boundary">
            演示核价，不代表企业正式计价规则
          </div>
        </aside>
      </div>
    </div>
  )
}
