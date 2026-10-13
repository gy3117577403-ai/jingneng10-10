import {
    ArrowRight,
    History,
    Plus,
    FileClock,
    CircleAlert,
    PencilLine,
} from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger } from "./controls";
import { Empty, FilterSelect, SearchInput, TypeIcon, Status } from "./shared";
import { issues, money, total, type Quote } from "./model";

export function nextStep(quote: Quote) {
    if (quote.readOnly) return "查看报价";
    if (!quote.lines.length) return "添加明细";
    if (quote.lines.some((line) => !line.costs.length)) return "补充成本";
    if (
        quote.lines.some((line) =>
            line.costs.some((cost) => cost.price === null),
        )
    )
        return "补齐价格";
    if (quote.lines.some((line) => line.costs.some((cost) => !cost.checked)))
        return "核对价格依据";
    if (issues(quote).length) return "核对数量与配置";
    return "继续报价核对";
}
export const missingCosts = (quote: Quote) =>
    quote.lines.some(
        (line) =>
            !line.costs.length ||
            line.costs.some((cost) => cost.price === null),
    );

export function QuoteRows({
    shown,
    onOpen,
    onCustomer,
}: {
    shown: Quote[];
    onOpen: (quote: Quote, tab?: "costs") => void;
    onCustomer?: (id: number) => void;
}) {
    return (
        <div className="q-quote-list" role="list" aria-label="报价记录">
            <div className="q-quote-columns q-list-labels" aria-hidden="true">
                <span>项目 / 客户</span>
                <span>状态 / 有效期</span>
                <span>未税金额</span>
                <span>下一步</span>
            </div>
            {shown.map((quote) => (
                <div
                    className={`q-quote-columns q-quote-row ${quote.readOnly ? "is-history" : "is-actionable"}`}
                    key={quote.id}
                    role="listitem"
                >
                    <div className="q-product-cell">
                        <TypeIcon type={quote.type} small />
                        <div>
                            <button
                                className="q-record-link"
                                aria-label={"打开报价：" + quote.title}
                                onClick={() => onOpen(quote)}
                            >
                                {quote.title}
                            </button>
                            <div className="q-meta">
                                {onCustomer && quote.companyId ? (
                                    <button
                                        className="q-customer-link"
                                        onClick={() =>
                                            onCustomer(quote.companyId!)
                                        }
                                    >
                                        {quote.customer}
                                    </button>
                                ) : (
                                    <span>{quote.customer}</span>
                                )}
                                <span>
                                    {" "}
                                    · {quote.type} ·{" "}
                                    {quote.revision
                                        ? `保存 V${quote.revision}`
                                        : "原有报价"}
                                </span>
                            </div>
                            {!!quote.owner && (
                                <div className="q-row-owner">
                                    {quote.owner}
                                    <span>
                                        {" "}
                                        · 更新于{" "}
                                        {quote.updatedAt?.slice(0, 10) || "—"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="q-row-state">
                        <Status
                            tone={
                                quote.status === "已成交"
                                    ? "green"
                                    : quote.status === "草稿"
                                      ? "blue"
                                      : "neutral"
                            }
                        >
                            {quote.status}
                        </Status>
                        <span className="q-due">
                            {quote.due ? `有效至 ${quote.due}` : "未设置有效期"}
                        </span>
                    </div>
                    <span className="q-money">¥ {money(total(quote))}</span>
                    <div className="q-row-action">
                        <Button
                            variant={quote.readOnly ? "ghost" : "outline"}
                            className={quote.readOnly ? "" : "q-action-button"}
                            onClick={() =>
                                onOpen(
                                    quote,
                                    [
                                        "补充成本",
                                        "补齐价格",
                                        "核对价格依据",
                                    ].includes(nextStep(quote))
                                        ? "costs"
                                        : undefined,
                                )
                            }
                        >
                            {nextStep(quote)}
                            <ArrowRight />
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function Workbench({
    quotes,
    shown,
    query,
    onQuery,
    type,
    onType,
    scope,
    onScope,
    onOpen,
    onNew,
    onHistory,
    onCustomer,
}: {
    quotes: Quote[];
    shown: Quote[];
    query: string;
    onQuery: (value: string) => void;
    type: string;
    onType: (value: string) => void;
    scope: string;
    onScope: (value: string) => void;
    onOpen: (quote: Quote) => void;
    onNew: () => void;
    onHistory: () => void;
    onCustomer?: (id: number) => void;
}) {
    const editable = quotes.filter((q) => !q.readOnly);
    const missing = editable.filter(missingCosts).length;
    const historical = quotes.filter(
        (q) => q.readOnly && missingCosts(q),
    ).length;
    return (
        <section className="q-page q-workbench">
            <header className="q-page-heading">
                <div>
                    <div className="q-page-eyebrow">销售工作空间</div>
                    <h1>报价工作台</h1>
                    <p>从客户需求出发，核对依据，完成本次报价。</p>
                </div>
                <div className="q-heading-actions">
                    <Button variant="outline" onClick={onHistory}>
                        <History />
                        从历史报价开始
                    </Button>
                    <Button onClick={onNew}>
                        <Plus />
                        新建报价
                    </Button>
                </div>
            </header>
            <div className="q-work-summary" aria-label="当前页报价概况">
                <span className="q-summary-label">本页</span>
                <span>
                    <PencilLine />
                    <strong>{editable.length}</strong> 份可继续编辑
                </span>
                <span className={missing ? "needs-attention" : ""}>
                    <CircleAlert />
                    <strong>{missing}</strong> 份待补成本
                </span>
                {historical > 0 && (
                    <span className="q-summary-archive">
                        <FileClock />
                        <strong>{historical}</strong> 份只读报价成本未整理
                        <small>不计入当前待办</small>
                    </span>
                )}
            </div>
            <div className="q-list-controls">
                <Tabs value={scope} onValueChange={onScope}>
                    <TabsList variant="line" aria-label="报价状态">
                        <TabsTrigger value="pending">进行中</TabsTrigger>
                        <TabsTrigger value="all">全部报价</TabsTrigger>
                        <TabsTrigger value="reviewed">已结束</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="q-search-filters">
                    <SearchInput
                        value={query}
                        onChange={onQuery}
                        label="查找项目、客户或报价编号"
                    />
                    <FilterSelect
                        label="全部业务"
                        value={type}
                        values={["全部", "成套", "钣金"]}
                        onChange={onType}
                    />
                </div>
            </div>
            <QuoteRows shown={shown} onOpen={onOpen} onCustomer={onCustomer} />
            {!shown.length && (
                <Empty
                    title="没有匹配的报价"
                    message="调整关键词、业务类型或报价状态。"
                    onClear={() => {
                        onQuery("");
                        onType("全部");
                        onScope("all");
                    }}
                />
            )}
            <div className="q-list-foot">
                <span>
                    {onCustomer
                        ? "客户名称可打开档案 · 选择明确操作继续处理"
                        : "选择项目或下一步操作继续处理"}
                </span>
                <span>人民币 · 未税</span>
            </div>
        </section>
    );
}
