import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
} from "lucide-react";
import { Button } from "./controls";
import { Input } from "./controls";
import { Checkbox } from "./controls";
import { Textarea } from "./controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./controls";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./controls";
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
} from "./model";
import { DetailSheet, Empty, Status } from "./shared";

export type EditorState = { tab: "lines" | "costs"; selected: string };
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
    onAdd,
    onEditLine,
    onSave,
    saving,
    dirty,
    onVersions,
}: {
    quote: Quote;
    state: EditorState;
    onStateChange: (state: EditorState) => void;
    onChange: (quote: Quote) => void;
    onBack: () => void;
    onHistory: () => void;
    onReview: () => void;
    onDocument: () => void;
    onRevision: () => void;
    onAdd: () => void;
    onEditLine: (id: string) => void;
    onSave: () => void;
    onVersions: () => void;
    saving: boolean;
    dirty: boolean;
    onRemove: (id: string) => void;
}) {
    const reduced = useReducedMotion();
    const [noteOpen, setNoteOpen] = useState(false);
    const [basisId, setBasisId] = useState<string | null>(null);
    const [basisOpen, setBasisOpen] = useState(false);
    const costTabRef = useRef<HTMLButtonElement>(null);
    const costHeaders = useRef<Record<string, HTMLButtonElement | null>>({});
    const [expandedCosts, setExpandedCosts] = useState<
        Record<string, string | null>
    >({});
    const line =
        quote.lines.find((item) => item.id === state.selected) ??
        quote.lines[0];
    const locked = !!quote.readOnly,
        problems = issues(quote);
    const pendingLines = quote.lines.filter((item) => !item.checked).length;
    const activeCost =
        line &&
        (line.id in expandedCosts
            ? expandedCosts[line.id]
            : (line.costs.find((cost) => !cost.checked)?.id ?? null));
    const basis = line?.costs.find((cost) => cost.id === basisId);
    const source = line?.source;
    const patch = (id: string, changes: Partial<DraftLine>) =>
        onChange({
            ...quote,
            lines: quote.lines.map((item) =>
                item.id === id ? updateLine(item, changes) : item,
            ),
        });
    const patchCost = (cost: Cost, changes: Partial<Cost>) => {
        if (!line || locked) return;
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
                    : item,
            ),
        });
    };
    const allCostsChecked =
        !!line?.costs.length &&
        line.costs.every(
            (cost) =>
                cost.price !== null &&
                Number.isFinite(cost.price) &&
                cost.price >= 0 &&
                cost.checked &&
                cost.source.trim(),
        );
    const showCosts = (id?: string) => {
        onStateChange({ tab: "costs", selected: id ?? line?.id ?? "" });
        costTabRef.current?.focus({ preventScroll: true });
    };
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
                        <span className="mono">{quote.code ?? quote.id}</span>
                        <span>
                            ·{" "}
                            {quote.revision
                                ? `保存 V${quote.revision}`
                                : "原有报价"}
                        </span>
                    </p>
                </div>
                <div className="q-document-actions">
                    <Status tone={locked ? "green" : "neutral"}>
                        {quote.status}
                    </Status>
                    <Button variant="ghost" onClick={onVersions}>
                        保存记录
                    </Button>
                    <Button variant="outline" onClick={onDocument}>
                        <FileSearch />
                        原报价与打印
                    </Button>
                </div>
            </header>
            <div className="q-runtime-notice">
                {locked
                    ? "当前报价只读；审核中、已确认、已结束或工艺自动计价的报价请到原报价处理。"
                    : "修改后点击保存报价；保存不会提交审核。"}
                {!!quote.presentationCount &&
                    ` 原报价另有 ${quote.presentationCount} 行分组或说明，完整内容可在原报价与打印中查看。`}
            </div>
            <Tabs
                value={state.tab}
                onValueChange={(value) =>
                    onStateChange({
                        ...state,
                        tab: value as EditorState["tab"],
                    })
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
                                <span className="q-pending-count">
                                    {pendingLines}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                    <span className="q-tab-context">
                        {quote.type}业务<span>·</span>
                        {quote.currency ?? "CNY"} / 未税
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
                                <p>
                                    维护数量与对外价格，成本在「成本核价」中处理。
                                </p>
                            </div>
                            {!locked && (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Button variant="outline" onClick={onAdd}>
                                        <Plus />
                                        新建明细
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={onHistory}
                                    >
                                        <Plus />
                                        从历史添加
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="q-lines-table">
                            <div
                                className="q-edit-columns q-list-labels"
                                aria-hidden="true"
                            >
                                <span>产品 / 规格</span>
                                <span>数量</span>
                                <span>未税单价</span>
                                <span>未税金额</span>
                                <span>核价状态</span>
                                <span />
                            </div>
                            {quote.lines.map((item) => {
                                const missing = item.costs.some(
                                    (cost) => cost.price === null,
                                );
                                return (
                                    <div
                                        className="q-edit-columns q-edit-row"
                                        key={item.id}
                                    >
                                        <div className="q-line-product">
                                            <button
                                                className="q-text-button"
                                                onClick={() =>
                                                    onEditLine(item.id)
                                                }
                                            >
                                                {item.name}
                                            </button>
                                            <span className="q-meta">
                                                {item.spec}
                                            </span>
                                            <span className="q-meta mono">
                                                {item.drawing}
                                                {!!item.discount &&
                                                    ` · 折扣 ${item.discount}%`}
                                            </span>
                                        </div>
                                        <label className="q-quantity-input">
                                            <span className="q-mobile-label">
                                                数量
                                            </span>
                                            <Input
                                                type="number"
                                                min="0.001"
                                                step="0.001"
                                                aria-label={item.name + "数量"}
                                                value={item.qty || ""}
                                                disabled={locked}
                                                onChange={(event) =>
                                                    patch(item.id, {
                                                        qty: Math.max(
                                                            0,
                                                            Number(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        ),
                                                    })
                                                }
                                            />
                                            <span>{item.unit}</span>
                                        </label>
                                        <label className="q-price-input">
                                            <span className="q-mobile-label">
                                                未税单价
                                            </span>
                                            <Input
                                                type="number"
                                                min="0"
                                                step=".001"
                                                aria-label={
                                                    item.name + "未税单价"
                                                }
                                                value={item.price || ""}
                                                disabled={locked}
                                                onChange={(event) =>
                                                    patch(item.id, {
                                                        price: Math.max(
                                                            0,
                                                            Number(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        ),
                                                    })
                                                }
                                            />
                                        </label>
                                        <strong className="q-money q-line-amount">
                                            <span className="q-mobile-label">
                                                未税金额{" "}
                                            </span>
                                            {money(
                                                lineAmount(
                                                    item.price *
                                                        (1 -
                                                            (item.discount ??
                                                                0) /
                                                                100),
                                                    item.qty,
                                                ),
                                            )}
                                        </strong>
                                        <button
                                            className={
                                                "q-line-status " +
                                                (item.checked ? "complete" : "")
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
                                                onClick={() =>
                                                    onRemove(item.id)
                                                }
                                            >
                                                <Trash2 />
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                            {!quote.lines.length && (
                                <Empty
                                    title="添加第一条报价明细"
                                    message="新建产品明细，或从历史报价复用，再核对本次配置和价格。"
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
                                    <ChevronRight
                                        className={
                                            noteOpen ? "q-open-chevron" : ""
                                        }
                                    />
                                    <strong>报价范围与说明</strong>
                                </span>
                                <span>
                                    {noteOpen
                                        ? "收起"
                                        : locked
                                          ? "查看说明"
                                          : "编辑说明"}
                                </span>
                            </button>
                            {!noteOpen && (
                                <p>{quote.note || "尚未填写报价说明"}</p>
                            )}
                            <AnimatePresence initial={false}>
                                {noteOpen && (
                                    <motion.div
                                        className="q-collapse"
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{
                                            duration: reduced ? 0 : 0.18,
                                        }}
                                    >
                                        <Textarea
                                            aria-label="报价范围与说明"
                                            value={quote.note}
                                            disabled={locked}
                                            onChange={(event) =>
                                                onChange({
                                                    ...quote,
                                                    note: event.target.value,
                                                })
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
                                    <p>
                                        每次只展开一项。价格与依据确认后，再核对本次配置。
                                    </p>
                                </div>
                                {quote.lines.length > 1 && (
                                    <Select
                                        value={line.id}
                                        onValueChange={(value) =>
                                            value &&
                                            onStateChange({
                                                tab: "costs",
                                                selected: value,
                                            })
                                        }
                                    >
                                        <SelectTrigger aria-label="选择核价产品">
                                            <SelectValue>
                                                {line.name}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="q-popover">
                                            {quote.lines.map((item, index) => (
                                                <SelectItem
                                                    key={item.id}
                                                    value={item.id}
                                                >
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
                                        <span className="q-meta-separator">
                                            ·
                                        </span>
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
                                        {line.sourceId
                                            ? `历史 ${Number(line.sourceQty)} ${line.unit}`
                                            : "本次新增产品"}
                                    </span>
                                </div>
                            </div>
                            <div
                                className="q-cost-list"
                                aria-label={line.name + "成本构成"}
                            >
                                <div className="q-cost-list-caption">
                                    <span>单{line.unit}成本构成</span>
                                    <span>
                                        {
                                            line.costs.filter(
                                                (cost) => cost.checked,
                                            ).length
                                        }{" "}
                                        / {line.costs.length} 项已确认
                                    </span>
                                </div>
                                {!locked && (
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            const id = crypto.randomUUID();
                                            patch(line.id, {
                                                costs: [
                                                    ...line.costs,
                                                    {
                                                        id,
                                                        name: "新成本项",
                                                        spec: "",
                                                        qty: 1,
                                                        unit: "项",
                                                        price: null,
                                                        source: "",
                                                        checked: false,
                                                    },
                                                ],
                                            });
                                            setExpandedCosts({
                                                ...expandedCosts,
                                                [line.id]: id,
                                            });
                                        }}
                                    >
                                        <Plus />
                                        添加成本项
                                    </Button>
                                )}
                                {line.costs.map((cost) => {
                                    const expanded = activeCost === cost.id;
                                    const valid =
                                        cost.qty > 0 &&
                                        !!cost.name.trim() &&
                                        !!cost.unit.trim() &&
                                        cost.price !== null &&
                                        Number.isFinite(cost.price) &&
                                        cost.price >= 0 &&
                                        !!cost.source.trim();
                                    return (
                                        <div
                                            className={
                                                "q-cost-item " +
                                                (expanded ? "is-open" : "")
                                            }
                                            key={cost.id}
                                        >
                                            <button
                                                className="q-cost-item-toggle"
                                                ref={(element) => {
                                                    costHeaders.current[
                                                        cost.id
                                                    ] = element;
                                                }}
                                                aria-label={
                                                    (expanded
                                                        ? "收起"
                                                        : "展开") +
                                                    cost.name +
                                                    "核价"
                                                }
                                                aria-expanded={expanded}
                                                onClick={() =>
                                                    setExpandedCosts({
                                                        ...expandedCosts,
                                                        [line.id]: expanded
                                                            ? null
                                                            : cost.id,
                                                    })
                                                }
                                            >
                                                <span
                                                    className={
                                                        "q-cost-state " +
                                                        (cost.checked
                                                            ? "complete"
                                                            : "pending")
                                                    }
                                                >
                                                    {cost.checked ? (
                                                        <Check />
                                                    ) : (
                                                        <span />
                                                    )}
                                                </span>
                                                <span className="q-cost-item-name">
                                                    <strong>{cost.name}</strong>
                                                    <span>{cost.spec}</span>
                                                </span>
                                                <span
                                                    className={
                                                        "q-cost-item-price " +
                                                        (cost.price === null
                                                            ? "pending"
                                                            : "")
                                                    }
                                                >
                                                    {cost.price === null
                                                        ? "待核价"
                                                        : "¥ " +
                                                          money(
                                                              cost.price *
                                                                  cost.qty,
                                                          )}
                                                </span>
                                                <ChevronDown
                                                    className={
                                                        expanded
                                                            ? "q-up-chevron"
                                                            : ""
                                                    }
                                                />
                                            </button>
                                            <AnimatePresence initial={false}>
                                                {expanded && (
                                                    <motion.div
                                                        className="q-collapse"
                                                        initial={{
                                                            height: 0,
                                                            opacity: 0,
                                                        }}
                                                        animate={{
                                                            height: "auto",
                                                            opacity: 1,
                                                        }}
                                                        exit={{
                                                            height: 0,
                                                            opacity: 0,
                                                        }}
                                                        transition={{
                                                            duration: reduced
                                                                ? 0
                                                                : 0.2,
                                                        }}
                                                    >
                                                        <div className="q-cost-edit">
                                                            <div
                                                                className="q-form-grid"
                                                                style={{
                                                                    marginBottom: 12,
                                                                }}
                                                            >
                                                                <label>
                                                                    成本名称
                                                                    <Input
                                                                        aria-label={
                                                                            cost.name +
                                                                            "名称"
                                                                        }
                                                                        value={
                                                                            cost.name
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    name: e
                                                                                        .target
                                                                                        .value,
                                                                                    checked: false,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                                <label>
                                                                    用量
                                                                    <Input
                                                                        type="number"
                                                                        min="0.001"
                                                                        step="0.001"
                                                                        aria-label={
                                                                            cost.name +
                                                                            "用量"
                                                                        }
                                                                        value={
                                                                            cost.qty
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    qty: Number(
                                                                                        e
                                                                                            .target
                                                                                            .value,
                                                                                    ),
                                                                                    checked: false,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                                <label>
                                                                    规格
                                                                    <Input
                                                                        aria-label={
                                                                            cost.name +
                                                                            "规格"
                                                                        }
                                                                        value={
                                                                            cost.spec
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    spec: e
                                                                                        .target
                                                                                        .value,
                                                                                    checked: false,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                                <label>
                                                                    单位
                                                                    <Input
                                                                        aria-label={
                                                                            cost.name +
                                                                            "单位"
                                                                        }
                                                                        value={
                                                                            cost.unit
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    unit: e
                                                                                        .target
                                                                                        .value,
                                                                                    checked: false,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                            </div>
                                                            <div className="q-cost-edit-fields">
                                                                <label>
                                                                    单价 / 元
                                                                    <span className="q-unit-hint">
                                                                        每
                                                                        {
                                                                            cost.unit
                                                                        }
                                                                    </span>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        step=".001"
                                                                        aria-label={
                                                                            cost.name +
                                                                            "成本价格"
                                                                        }
                                                                        value={
                                                                            cost.price ??
                                                                            ""
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        placeholder="填写价格"
                                                                        onChange={(
                                                                            event,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    price:
                                                                                        event
                                                                                            .target
                                                                                            .value ===
                                                                                        ""
                                                                                            ? null
                                                                                            : Math.max(
                                                                                                  0,
                                                                                                  Number(
                                                                                                      event
                                                                                                          .target
                                                                                                          .value,
                                                                                                  ),
                                                                                              ),
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                                <label>
                                                                    本次价格依据
                                                                    <Input
                                                                        aria-label={
                                                                            cost.name +
                                                                            "价格来源"
                                                                        }
                                                                        value={
                                                                            cost.source
                                                                        }
                                                                        disabled={
                                                                            locked
                                                                        }
                                                                        placeholder="例如：供应商报价单与日期"
                                                                        onChange={(
                                                                            event,
                                                                        ) =>
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    source: event
                                                                                        .target
                                                                                        .value,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                            </div>
                                                            <div className="q-cost-edit-actions">
                                                                {!locked && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        aria-label={
                                                                            "移除成本" +
                                                                            cost.name
                                                                        }
                                                                        onClick={() =>
                                                                            patch(
                                                                                line.id,
                                                                                {
                                                                                    costs: line.costs.filter(
                                                                                        (
                                                                                            c,
                                                                                        ) =>
                                                                                            c.id !==
                                                                                            cost.id,
                                                                                    ),
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        <Trash2 />
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setBasisId(
                                                                            cost.id,
                                                                        );
                                                                        setBasisOpen(
                                                                            true,
                                                                        );
                                                                    }}
                                                                >
                                                                    <History />
                                                                    查看来源记录
                                                                </Button>
                                                                {!locked && (
                                                                    <Button
                                                                        variant={
                                                                            cost.checked
                                                                                ? "outline"
                                                                                : "default"
                                                                        }
                                                                        disabled={
                                                                            !valid
                                                                        }
                                                                        onClick={() => {
                                                                            if (
                                                                                cost.checked
                                                                            ) {
                                                                                patchCost(
                                                                                    cost,
                                                                                    {
                                                                                        checked: false,
                                                                                    },
                                                                                );
                                                                                return;
                                                                            }
                                                                            patchCost(
                                                                                cost,
                                                                                {
                                                                                    checked: true,
                                                                                },
                                                                            );
                                                                            const next =
                                                                                line.costs.find(
                                                                                    (
                                                                                        item,
                                                                                    ) =>
                                                                                        item.id !==
                                                                                            cost.id &&
                                                                                        !item.checked,
                                                                                );
                                                                            setExpandedCosts(
                                                                                {
                                                                                    ...expandedCosts,
                                                                                    [line.id]:
                                                                                        next?.id ??
                                                                                        null,
                                                                                },
                                                                            );
                                                                            costHeaders.current[
                                                                                next?.id ??
                                                                                    cost.id
                                                                            ]?.focus(
                                                                                {
                                                                                    preventScroll: true,
                                                                                },
                                                                            );
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
                                    );
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
                                        onCheckedChange={(checked) =>
                                            patch(line.id, { checked })
                                        }
                                    />
                                    <span>
                                        <strong>
                                            已核对本次数量、配置与价格
                                        </strong>
                                        <small>
                                            {allCostsChecked
                                                ? "本次 " +
                                                  line.qty +
                                                  " " +
                                                  line.unit +
                                                  "，对外单价 ¥ " +
                                                  money(line.price) +
                                                  (line.sourceId
                                                      ? "；历史单价 ¥ " +
                                                        money(line.sourcePrice)
                                                      : "；尚无历史参考价")
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
                    {!locked && (
                        <Button
                            variant="outline"
                            disabled={saving || !dirty}
                            onClick={onSave}
                        >
                            {saving
                                ? "正在保存…"
                                : dirty
                                  ? "保存报价"
                                  : "已保存"}
                        </Button>
                    )}
                    <span
                        className={
                            problems.length ? "q-pending-text" : "q-green-text"
                        }
                    >
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
                            从历史复用
                        </Button>
                    ) : state.tab === "lines" &&
                      quote.lines.length > 0 &&
                      problems.length > 0 ? (
                        <Button
                            onClick={() =>
                                showCosts(
                                    quote.lines.find((item) => !item.checked)
                                        ?.id,
                                )
                            }
                        >
                            继续核价
                            <ArrowRight />
                        </Button>
                    ) : (
                        <Button
                            onClick={onReview}
                            disabled={problems.length > 0}
                        >
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
                    <Button
                        variant="outline"
                        onClick={() => setBasisOpen(false)}
                    >
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
                                {basis.price === null
                                    ? "待补齐"
                                    : "¥ " + money(basis.price)}{" "}
                                / {basis.unit}
                            </span>
                        </div>
                        <div className="q-sheet-section">
                            <h3>历史报价来源</h3>
                            <p>{source ? source.quote : "未关联历史报价"}</p>
                            <span className="q-meta">
                                {source?.date} · 保存的来源快照
                            </span>
                            {source?.line?.costs.find(
                                (c) => c.id === basis.id,
                            ) && (
                                <p>
                                    复用时成本单价：
                                    {source.line.costs.find(
                                        (c) => c.id === basis.id,
                                    )!.price === null
                                        ? "待核价"
                                        : "¥ " +
                                          money(
                                              source.line.costs.find(
                                                  (c) => c.id === basis.id,
                                              )!.price!,
                                          )}
                                </p>
                            )}
                        </div>
                        <div className="q-sheet-section">
                            <h3>来源图号与报价保存版本</h3>
                            <p>
                                {source
                                    ? source.drawing +
                                      " · 报价保存 V" +
                                      source.revision
                                    : "未关联图纸"}
                            </p>
                            <span className="q-meta">
                                图号为报价索引；原件请在原报价中查看
                            </span>
                        </div>
                        <p className="q-footnote">
                            复用保存来源快照，不会自动确认当前价格。
                        </p>
                    </>
                )}
            </DetailSheet>
        </div>
    );
}
