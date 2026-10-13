import { ArrowRight, History, Plus } from "lucide-react";
import { Button } from "./controls";
import { Tabs, TabsList, TabsTrigger } from "./controls";
import { Empty, FilterSelect, SearchInput, TypeIcon } from "./shared";
import { issues, money, total, type Quote } from "./model";

function nextStep(quote: Quote) {
    if (quote.readOnly) return "查看报价与依据";
    if (!quote.lines.length) return "添加报价明细";
    if (quote.lines.some((line) => !line.costs.length)) return "维护产品成本";
    const missing = quote.lines.flatMap((line) =>
        line.costs.filter((cost) => cost.price === null),
    );
    if (missing.length)
        return (
            "补齐" + missing[0].name + (missing.length > 1 ? "等成本" : "价格")
        );
    if (quote.lines.some((line) => line.costs.some((cost) => !cost.checked)))
        return "核对本次价格依据";
    if (issues(quote).length) return "核对数量与配置";
    return "完成报价核对";
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
}) {
    const pending = quotes.filter((quote) => !quote.readOnly).length;
    const missing = quotes.filter((quote) =>
        quote.lines.some(
            (line) =>
                !line.costs.length ||
                line.costs.some((cost) => cost.price === null),
        ),
    ).length;
    return (
        <section className="q-page q-workbench">
            <header className="q-page-heading">
                <div>
                    <h1>报价工作台</h1>
                    <p>
                        当前页 {pending} 份可编辑
                        <span className="q-meta-separator">·</span>
                        {missing} 份待补齐成本
                    </p>
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
            <div className="q-list-controls">
                <Tabs value={scope} onValueChange={onScope}>
                    <TabsList variant="line" aria-label="报价状态">
                        <TabsTrigger value="all">全部</TabsTrigger>
                        <TabsTrigger value="pending">进行中</TabsTrigger>
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
            <div className="q-quote-list" aria-label="当前报价">
                <div
                    className="q-quote-columns q-list-labels"
                    aria-hidden="true"
                >
                    <span>项目 / 客户</span>
                    <span>报价有效期</span>
                    <span>未税金额</span>
                    <span>下一步</span>
                    <span />
                </div>
                {shown.map((quote) => (
                    <button
                        className="q-quote-columns q-quote-row"
                        key={quote.id}
                        aria-label={"打开报价：" + quote.title}
                        onClick={() => onOpen(quote)}
                    >
                        <span className="q-product-cell">
                            <TypeIcon type={quote.type} small />
                            <span>
                                <strong>{quote.title}</strong>
                                <span className="q-meta">
                                    {quote.customer.replace("（虚构）", "")} ·{" "}
                                    {quote.type} ·{" "}
                                    {quote.revision
                                        ? `保存 V${quote.revision}`
                                        : "原有报价"}
                                </span>
                            </span>
                        </span>
                        <span className="q-due">
                            <span className="q-mobile-label">有效期 </span>
                            {quote.due}
                        </span>
                        <span className="q-money">¥ {money(total(quote))}</span>
                        <span
                            className={
                                "q-next-step " +
                                (quote.readOnly ? "complete" : "")
                            }
                        >
                            <span className="q-state-dot" />
                            {nextStep(quote)}
                        </span>
                        <ArrowRight className="q-row-arrow" />
                    </button>
                ))}
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
            </div>
            <div className="q-list-foot">
                <span>{shown.length} 份报价</span>
                <span>人民币 · 未税</span>
            </div>
        </section>
    );
}
