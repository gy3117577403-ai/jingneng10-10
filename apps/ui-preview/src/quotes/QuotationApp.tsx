import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Factory,
  FileCheck2,
  History,
  Info,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { historyLines, makeInitialQuotes } from "./demo"
import {
  issues,
  lineAmount,
  money,
  reuseLine,
  STORAGE_KEY,
  total,
  type Business,
  type DraftLine,
  type HistoricalLine,
  type Quote,
} from "./model"
import { TypeIcon } from "./shared"
import { HistoryView } from "./HistoryView"
import { Editor, type EditorState } from "./Editor"
import { Workbench } from "./Workbench"
import "./quotation.css"

type View = "workbench" | "history" | "edit"
type Stored = { version: 1; quotes: Quote[] }
function loadQuotes() {
  try {
    const value = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null"
    ) as Stored | null
    if (
      value?.version === 1 &&
      Array.isArray(value.quotes) &&
      value.quotes.length &&
      value.quotes.every(
        (q) => typeof q.id === "string" && Array.isArray(q.lines)
      )
    )
      return value.quotes
  } catch {
    /* Fall back to fictional fixtures if this isolated preview store is unavailable. */
  }
  return makeInitialQuotes()
}
const titles: Record<View, string> = {
  workbench: "报价工作台",
  history: "历史报价",
  edit: "编辑报价",
}

export default function QuotationApp() {
  const reduced = useReducedMotion()
  const [quotes, setQuotes] = useState(loadQuotes)
  const [view, setView] = useState<View>(() => {
    const value = new URLSearchParams(location.search).get("view")
    return value === "history" || value === "edit" ? value : "workbench"
  })
  const [currentId, setCurrentId] = useState(
    () => new URLSearchParams(location.search).get("id") ?? quotes[0].id
  )
  const [query, setQuery] = useState(""),
    [workQuery, setWorkQuery] = useState("")
  const [historyType, setHistoryType] = useState("全部"),
    [onlyVerified, setOnlyVerified] = useState(false)
  const [type, setType] = useState("全部"),
    [scope, setScope] = useState("all"),
    [collapsed, setCollapsed] = useState(false)
  const [dialog, setDialog] = useState<
    "new" | "reuse" | "review" | "document" | "reset" | "guide" | null
  >(null)
  const [reuse, setReuse] = useState<HistoricalLine | null>(null),
    [target, setTarget] = useState("new")
  const [newTitle, setNewTitle] = useState(""),
    [newCustomer, setNewCustomer] = useState(""),
    [newType, setNewType] = useState<Business>("成套")
  const [formError, setFormError] = useState(""),
    [ack, setAck] = useState(false),
    [toast, setToast] = useState("")
  const [saveError, setSaveError] = useState(false),
    [undoQuote, setUndoQuote] = useState<{
      id: string
      line: DraftLine
      index: number
    } | null>(null)
  const [searchFocus, setSearchFocus] = useState(0)
  const [historyOrigin, setHistoryOrigin] = useState<string | null>(null)
  const [editorStates, setEditorStates] = useState<Record<string, EditorState>>(
    {}
  )
  const quote = quotes.find((item) => item.id === currentId) ?? quotes[0]
  const problems = issues(quote)
  const historyQuote = quotes.find((item) => item.id === historyOrigin)
  const focusHistorySearch = useCallback(() => {
    if (view === "edit") setHistoryOrigin(quote.id)
    else if (view !== "history") setHistoryOrigin(null)
    setView("history")
    setSearchFocus((value) => value + 1)
  }, [view, quote.id])
  const open = (item: Quote) => {
    setCurrentId(item.id)
    setView("edit")
    setHistoryOrigin(null)
    setToast("")
    setUndoQuote(null)
  }
  const changeQuote = (updated: Quote) =>
    setQuotes((items) =>
      items.map((item) => (item.id === updated.id ? updated : item))
    )
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, quotes } satisfies Stored)
      ) /* storage is synchronous */
    } catch {
      queueMicrotask(() => setSaveError(true))
    }
  }, [quotes])
  useEffect(() => {
    const onStorageError = () => {
      try {
        const key = `${STORAGE_KEY}.probe`
        localStorage.setItem(key, "1")
        localStorage.removeItem(key)
      } catch {
        setSaveError(true)
      }
    }
    onStorageError()
    document.title = "京能 · 报价工作台（交互预览）"
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        focusHistorySearch()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [focusHistorySearch])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set("view", view)
    if (view === "edit") url.searchParams.set("id", quote.id)
    else url.searchParams.delete("id")
    history.replaceState(null, "", url)
  }, [view, quote.id])
  useEffect(() => {
    if (!toast || undoQuote) return
    const timeout = setTimeout(() => setToast(""), 5500)
    return () => clearTimeout(timeout)
  }, [toast, undoQuote])
  const showNew = () => {
    setNewTitle("")
    setNewCustomer("")
    setNewType("成套")
    setFormError("")
    setDialog("new")
  }
  const showReuse = (item: HistoricalLine) => {
    setReuse(item)
    setTarget(
      historyQuote?.status === "草稿" && historyQuote.type === item.type
        ? historyQuote.id
        : "new"
    )
    setNewTitle(`${item.project} · 本次报价`)
    setNewCustomer(item.customer)
    setNewType(item.type)
    setFormError("")
    setDialog("reuse")
  }
  const createQuote = (source?: HistoricalLine) => {
    if (target !== "new" && source) {
      const destination = quotes.find(
        (q) => q.id === target && q.type === source.type && q.status === "草稿"
      )
      if (!destination) {
        setFormError("请选择可编辑的同类报价草稿。")
        return
      }
      const addedLine = reuseLine(source)
      const updated = {
        ...destination,
        lines: [...destination.lines, addedLine],
      }
      changeQuote(updated)
      setEditorStates((values) => ({
        ...values,
        [destination.id]: { tab: "lines", selected: addedLine.id },
      }))
      open(updated)
      setDialog(null)
      setToast("已加入草稿，请核对本次数量与价格依据。")
      return
    }
    if (!newTitle.trim() || !newCustomer.trim()) {
      setFormError("请填写项目名称和客户名称。")
      return
    }
    const item: Quote = {
      id: `DEMO-Q-${Date.now().toString().slice(-7)}`,
      title: newTitle.trim(),
      customer: newCustomer.trim(),
      type: newType,
      due: "2026-10-16",
      revision: 1,
      status: "草稿",
      lines: source ? [reuseLine(source)] : [],
      note:
        newType === "成套"
          ? "柜体、电气元件、装配及出厂调试。"
          : "按图加工，含约定的表面处理。",
    }
    setQuotes((items) => [item, ...items])
    open(item)
    setDialog(null)
    setToast(
      source
        ? "已复用为新草稿，历史报价保持原样。"
        : "草稿已建立，可从历史报价添加明细。"
    )
  }
  const shown = quotes.filter(
    (item) =>
      (type === "全部" || item.type === type) &&
      (!workQuery ||
        `${item.title} ${item.customer} ${item.id}`
          .toLowerCase()
          .includes(workQuery.toLowerCase())) &&
      (scope === "all" ||
        (scope === "pending"
          ? item.status === "草稿"
          : item.status === "预览已核对"))
  )
  const pendingCount = quotes.filter((q) => q.status === "草稿").length
  const revise = () => {
    const item: Quote = {
      ...structuredClone(quote),
      id: `DEMO-Q-${Date.now().toString().slice(-7)}`,
      revision: quote.revision + 1,
      status: "草稿",
      lines: quote.lines.map((line) => ({
        ...structuredClone(line),
        checked: false,
      })),
    }
    setQuotes((items) => [item, ...items])
    open(item)
    setToast("已建立新修订，原核对版本仍可在工作台查看。")
  }
  return (
    <div className={`q-app ${collapsed ? "q-nav-collapsed" : ""}`}>
      <aside className="q-sidebar">
        <div className="q-brand">
          <span>
            <Factory />
          </span>
          <div>
            <strong>京能制造</strong>
            <small>销售与报价</small>
          </div>
        </div>
        <div className="q-nav-caption">工作空间</div>
        <nav aria-label="报价导航">
          {(
            [
              { id: "workbench", label: "报价工作台", icon: ClipboardList },
              { id: "history", label: "历史报价", icon: History },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={
                view === item.id || (item.id === "workbench" && view === "edit")
                  ? "active"
                  : ""
              }
              onClick={() => {
                setHistoryOrigin(null)
                setView(item.id)
              }}
              title={item.label}
            >
              <item.icon />
              <span>{item.label}</span>
              {item.id === "workbench" && <small>{pendingCount}</small>}
            </button>
          ))}
        </nav>
        <div className="q-sidebar-bottom">
          <a href="/?view=organization">
            <Network />
            <span>组织与成员</span>
          </a>
          <button onClick={() => setDialog("guide")}>
            <BookOpen />
            <span>预览操作说明</span>
          </button>
          <div className="q-profile">
            <span>演</span>
            <div>
              <strong>演示管理员</strong>
              <small>仅使用虚构资料</small>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="重置报价演示数据"
              onClick={() => setDialog("reset")}
            >
              <RotateCcw />
            </Button>
          </div>
        </div>
      </aside>
      <main className="q-main">
        <header className="q-topbar">
          <div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? "展开导航" : "收起导航"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <span className="q-breadcrumb">
              销售与报价
              <ChevronRight />
              <b>{titles[view]}</b>
            </span>
          </div>
          <Button
            variant="ghost"
            className="q-search-shortcut"
            onClick={focusHistorySearch}
            aria-label="搜索历史报价"
          >
            <Search />
            <span>搜索历史报价</span>
            <kbd>Ctrl K</kbd>
          </Button>
          <span className="q-preview-pill">
            <span />
            交互预览
          </span>
        </header>
        <nav className="q-mobile-nav" aria-label="窄屏报价导航">
          <button
            className={view !== "history" ? "active" : ""}
            onClick={() => {
              setHistoryOrigin(null)
              setView("workbench")
            }}
          >
            <ClipboardList />
            报价工作台
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => {
              setHistoryOrigin(null)
              setView("history")
            }}
          >
            <History />
            历史报价
          </button>
        </nav>
        <div className="q-content">
          <AnimatePresence mode="wait">
            <motion.div
              className="q-view"
              key={view === "edit" ? `${view}-${quote.id}` : view}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: reduced ? 0 : 0.16 }}
            >
              {view === "history" ? (
                <HistoryView
                  lines={historyLines}
                  query={query}
                  setQuery={setQuery}
                  type={historyType}
                  setType={setHistoryType}
                  verified={onlyVerified}
                  setVerified={setOnlyVerified}
                  onReuse={showReuse}
                  focusRequest={searchFocus}
                  returnTitle={historyQuote?.title}
                  onBack={historyQuote ? () => open(historyQuote) : undefined}
                />
              ) : view === "edit" ? (
                <Editor
                  quote={quote}
                  state={
                    editorStates[quote.id] ?? {
                      tab: "lines",
                      selected: quote.lines[0]?.id ?? "",
                    }
                  }
                  onStateChange={(state) =>
                    setEditorStates((values) => ({
                      ...values,
                      [quote.id]: state,
                    }))
                  }
                  onChange={changeQuote}
                  onBack={() => setView("workbench")}
                  onHistory={() => {
                    setHistoryOrigin(quote.id)
                    setHistoryType(quote.type)
                    setView("history")
                  }}
                  onReview={() => {
                    setUndoQuote(null)
                    setAck(false)
                    setDialog("review")
                  }}
                  onDocument={() => setDialog("document")}
                  onRevision={revise}
                  onRemove={(id) => {
                    const index = quote.lines.findIndex(
                      (line) => line.id === id
                    )
                    if (index < 0) return
                    setUndoQuote({
                      id: quote.id,
                      index,
                      line: structuredClone(quote.lines[index]),
                    })
                    changeQuote({
                      ...quote,
                      lines: quote.lines.filter((line) => line.id !== id),
                    })
                    setToast("明细已从当前草稿移除。")
                  }}
                />
              ) : (
                <Workbench
                  quotes={quotes}
                  shown={shown}
                  query={workQuery}
                  onQuery={setWorkQuery}
                  type={type}
                  onType={setType}
                  scope={scope}
                  onScope={setScope}
                  onOpen={open}
                  onNew={showNew}
                  onHistory={() => {
                    setHistoryOrigin(null)
                    setView("history")
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="q-statusbar">
          <span>
            <span className={`q-tiny-dot ${saveError ? "amber" : "green"}`} />
            {saveError
              ? "本机保存不可用，请勿关闭页面"
              : "演示修改保存在此浏览器"}
          </span>
          <span>虚构数据 · 未连接 8090 业务库</span>
        </footer>
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="q-toast"
            style={{ x: "-50%" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <CircleCheck />
            <span>{toast}</span>
            {undoQuote && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const current = quotes.find(
                    (item) => item.id === undoQuote.id
                  )
                  if (
                    current &&
                    current.status === "草稿" &&
                    !current.lines.some((line) => line.id === undoQuote.line.id)
                  ) {
                    const lines = [...current.lines]
                    lines.splice(undoQuote.index, 0, undoQuote.line)
                    changeQuote({ ...current, lines })
                  }
                  setUndoQuote(null)
                  setToast("已恢复刚移除的明细。")
                }}
              >
                <Undo2 />
                撤销
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="关闭提示"
              onClick={() => setToast("")}
            >
              <X />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog
        open={dialog !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDialog(null)
        }}
      >
        <DialogContent
          className={`q-dialog ${dialog === "document" ? "q-document-dialog" : ""}`}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === "new"
                ? "新建报价"
                : dialog === "reuse"
                  ? "复用历史明细"
                  : dialog === "review"
                    ? "核对本次报价"
                    : dialog === "document"
                      ? "客户报价单预览"
                      : dialog === "reset"
                        ? "重置报价演示？"
                        : "体验这条报价流程"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "reuse"
                ? "复制配置与历史参考价，新草稿需要重新确认价格依据。"
                : dialog === "new"
                  ? "先记录项目与客户，再添加需要报价的产品明细。"
                  : dialog === "review"
                    ? "这是本机演示核对，不会发给审核人或客户。"
                    : dialog === "document"
                      ? "仅展示对外报价内容，内部成本不进入此视图。"
                      : dialog === "reset"
                        ? "只清除本预览的本机演示修改，恢复初始虚构数据。"
                        : "所有修改仅保存在当前浏览器，不影响实际业务。"}
            </DialogDescription>
          </DialogHeader>
          {(dialog === "new" || dialog === "reuse") && (
            <form
              id="q-create-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (dialog === "new") {
                  setTarget("new")
                  createQuote()
                } else if (reuse) createQuote(reuse)
              }}
              className="q-form"
            >
              {dialog === "reuse" && reuse && (
                <>
                  <div className="q-reuse-source">
                    <TypeIcon type={reuse.type} small />
                    <div>
                      <strong>{reuse.name}</strong>
                      <span>
                        {reuse.drawing} · 历史 {reuse.qty} {reuse.unit} · ¥{" "}
                        {money(reuse.price)}
                      </span>
                    </div>
                  </div>
                  <label>
                    加入到
                    <Select
                      value={target}
                      onValueChange={(value) => value && setTarget(value)}
                    >
                      <SelectTrigger className="q-full-select">
                        <SelectValue>
                          {target === "new"
                            ? "新建一份报价"
                            : quotes.find((q) => q.id === target)?.title}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">新建一份报价</SelectItem>
                        {quotes
                          .filter(
                            (q) => q.type === reuse.type && q.status === "草稿"
                          )
                          .map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.title}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {target !== "new" && (
                    <p className="q-footnote">
                      作为新的独立明细加入所选草稿，原有明细保持不变。
                    </p>
                  )}
                </>
              )}
              {(dialog === "new" || target === "new") && (
                <>
                  <label htmlFor="new-project">
                    项目名称
                    <Input
                      id="new-project"
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      placeholder="例如：装配车间配电改造"
                      autoComplete="off"
                    />
                  </label>
                  <label htmlFor="new-customer">
                    客户名称
                    <Input
                      id="new-customer"
                      value={newCustomer}
                      onChange={(event) => setNewCustomer(event.target.value)}
                      placeholder="填写演示客户名称"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    业务类型
                    <Select
                      value={newType}
                      onValueChange={(value) =>
                        value && setNewType(value as Business)
                      }
                      disabled={dialog === "reuse"}
                    >
                      <SelectTrigger className="q-full-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="成套">
                          成套：柜体、元件、装配、调试
                        </SelectItem>
                        <SelectItem value="钣金">
                          钣金：材料、加工、表面处理
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </>
              )}
              {formError && (
                <p role="alert" className="q-field-error">
                  {formError}
                </p>
              )}
            </form>
          )}
          {dialog === "review" && (
            <div className="q-review-dialog">
              <div className="q-review-summary">
                <div>
                  <strong>{quote.title}</strong>
                  <span>
                    {quote.lines.length} 项明细 · V{quote.revision} · 人民币未税
                  </span>
                </div>
                <b>¥ {money(total(quote))}</b>
              </div>
              {problems.length ? (
                <>
                  <div className="q-review-warning">
                    <Info />
                    <strong>还有 {problems.length} 项需要处理</strong>
                  </div>
                  <ul>
                    {problems.map((item, index) => (
                      <li key={`${item.lineId}-${index}`}>{item.text}</li>
                    ))}
                  </ul>
                  <p>
                    回到「成本核价」，补齐价格与依据，再确认本次数量和配置。
                  </p>
                </>
              ) : (
                <>
                  <div className="q-review-ok">
                    <ShieldCheck />
                    当前明细与依据已完成演示核对
                  </div>
                  <label className="q-check-label">
                    <Checkbox checked={ack} onCheckedChange={setAck} />
                    <span>我已核对本次报价内容，并了解这只是交互预览。</span>
                  </label>
                </>
              )}
            </div>
          )}
          {dialog === "document" && (
            <div className="q-paper">
              <div className="q-paper-brand">
                <Factory />
                <strong>京能制造</strong>
                <span>演示报价单</span>
              </div>
              <h2>{quote.title}</h2>
              <p>客户：{quote.customer}</p>
              <p>
                编号：{quote.id} · V{quote.revision} ·{" "}
                {quote.status === "草稿" ? "草稿" : "演示已核对"}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>名称 / 规格</th>
                    <th>数量</th>
                    <th>未税单价</th>
                    <th>未税金额</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.name}
                        <small>{line.spec}</small>
                      </td>
                      <td>
                        {line.qty} {line.unit}
                      </td>
                      <td>{money(line.price)}</td>
                      <td>{money(lineAmount(line.price, line.qty))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="q-paper-total">
                未税合计 <strong>¥ {money(total(quote))}</strong>
              </div>
              <p className="q-paper-note">报价说明：{quote.note || "未填写"}</p>
              <div className="q-paper-watermark">
                虚构资料，仅供界面与交互预览，不作为交易依据
              </div>
            </div>
          )}
          {dialog === "guide" && (
            <ol className="q-guide-list">
              <li>
                <b>查找</b>在历史报价中输入“控制柜”“2.0”或客户名。
              </li>
              <li>
                <b>复用</b>选择一条明细，查看原数量、单价和成本，加入新草稿。
              </li>
              <li>
                <b>核价</b>
                切到「成本核价」，展开一项并补齐价格与来源，确认后继续下一项。
              </li>
              <li>
                <b>核对</b>确认本次数量与配置，完成演示核对，预览客户报价单。
              </li>
              <li>
                <b>修订</b>已核对版本保持只读，可创建新的修订草稿。
              </li>
            </ol>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {dialog === "document" || dialog === "guide" ? "关闭" : "返回"}
            </Button>
            {(dialog === "new" || dialog === "reuse") && (
              <Button type="submit" form="q-create-form">
                {dialog === "reuse" ? "复用到草稿" : "建立草稿"}
                <ArrowRight />
              </Button>
            )}
            {dialog === "review" && (
              <Button
                disabled={
                  problems.length > 0 || !ack || quote.status !== "草稿"
                }
                onClick={() => {
                  if (issues(quote).length || !ack) return
                  changeQuote({ ...quote, status: "预览已核对" })
                  setDialog(null)
                  setToast("演示核对已完成，此版本保持只读。")
                }}
              >
                <FileCheck2 />
                完成演示核对
              </Button>
            )}
            {dialog === "reset" && (
              <Button
                onClick={() => {
                  const initial = makeInitialQuotes()
                  setQuotes(initial)
                  setCurrentId(initial[0].id)
                  setEditorStates({})
                  setHistoryOrigin(null)
                  setView("workbench")
                  setQuery("")
                  setHistoryType("全部")
                  setOnlyVerified(false)
                  setWorkQuery("")
                  setScope("all")
                  setType("全部")
                  setDialog(null)
                  setToast("已恢复初始演示资料。")
                  setUndoQuote(null)
                }}
              >
                重置本机演示
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
