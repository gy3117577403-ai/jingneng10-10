export type Business = "成套" | "钣金" | "待分类";
export type Cost = {
    id: string;
    name: string;
    spec: string;
    qty: number;
    unit: string;
    price: number | null;
    source: string;
    checked: boolean;
};
export type HistoricalLine = {
    id: string;
    name: string;
    drawing: string;
    spec: string;
    material: string;
    finish: string;
    type: Business;
    customer: string;
    project: string;
    quote: string;
    date: string;
    qty: number;
    unit: string;
    price: number;
    revision: string;
    result: "已成交" | "已报价";
    verified: boolean;
    costs: Cost[];
};
export type DraftLine = {
    id: string;
    name: string;
    drawing: string;
    spec: string;
    qty: number;
    unit: string;
    price: number;
    unitId?: number;
    vatId?: number;
    material?: string;
    finish?: string;
    discount?: number;
    source?: {
        quote: string;
        date: string;
        revision: number;
        drawing: string;
        line?: { costs: Cost[] };
    };
    sourceId: string;
    sourceQty: number;
    sourcePrice: number;
    checked: boolean;
    costs: Cost[];
};
export type Quote = {
    companyId?: number;
    owner?: string;
    updatedAt?: string;
    readOnly?: boolean;
    token?: string;
    code?: string;
    currency?: string;
    legacyUrl?: string;
    reviewUrl?: string;
    versions?: { revision: number; created_at: string }[];
    presentationCount?: number;
    id: string;
    title: string;
    customer: string;
    type: Business;
    due: string;
    revision: number;
    status: string;
    lines: DraftLine[];
    note: string;
};
export const STORAGE_KEY = "jingneng.quotation-ui-preview.v1";
export const money = (value: number) =>
    value.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
export const lineAmount = (price: number, qty: number) =>
    Math.round((price * qty + Number.EPSILON) * 100) / 100;
export const total = (quote: Quote) =>
    quote.lines.reduce(
        (sum, line) =>
            sum +
            Math.round(
                lineAmount(
                    line.price * (1 - (line.discount ?? 0) / 100),
                    line.qty,
                ) * 100,
            ),
        0,
    ) / 100;
export const costTotal = (line: DraftLine | HistoricalLine): number | null =>
    !line.costs.length || line.costs.some((cost) => cost.price === null)
        ? null
        : line.costs.reduce(
              (sum, cost) =>
                  sum + Math.round(lineAmount(cost.price!, cost.qty) * 100),
              0,
          ) / 100;
export function issues(quote: Quote) {
    const result: { lineId: string; text: string }[] = [];
    if (!quote.lines.length)
        result.push({ lineId: "", text: "尚未添加报价明细" });
    for (const line of quote.lines) {
        if (!Number.isFinite(line.qty) || line.qty <= 0)
            result.push({
                lineId: line.id,
                text: `${line.name}：数量须大于 0`,
            });
        if (!Number.isFinite(line.price) || line.price <= 0)
            result.push({
                lineId: line.id,
                text: `${line.name}：请填写有效单价`,
            });
        if (
            line.costs.some(
                (cost) =>
                    cost.price === null ||
                    !Number.isFinite(cost.price) ||
                    cost.price < 0,
            )
        )
            result.push({
                lineId: line.id,
                text: `${line.name}：存在待核价成本`,
            });
        if (!line.costs.length)
            result.push({
                lineId: line.id,
                text: `${line.name}：尚未维护成本`,
            });
        if (line.costs.some((cost) => !cost.checked || !cost.source.trim()))
            result.push({
                lineId: line.id,
                text: `${line.name}：价格依据待确认`,
            });
        if (!line.checked)
            result.push({
                lineId: line.id,
                text: `${line.name}：本次数量与配置待核对`,
            });
    }
    return result;
}
export function reuseLine(
    source: HistoricalLine,
    id: string = crypto.randomUUID(),
): DraftLine {
    return {
        id,
        name: source.name,
        drawing: source.drawing,
        spec: source.spec,
        qty: source.qty,
        unit: source.unit,
        price: source.price,
        sourceId: source.id,
        sourceQty: source.qty,
        sourcePrice: source.price,
        checked: false,
        costs: source.costs.map((cost) => ({ ...cost, checked: false })),
    };
}
export function searchHistory(
    lines: HistoricalLine[],
    query: string,
    type: string,
    verified: boolean,
) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return lines.filter(
        (line) =>
            (type === "全部" || line.type === type) &&
            (!verified || line.verified) &&
            terms.every((term) =>
                `${line.name} ${line.drawing} ${line.spec} ${line.material} ${line.finish} ${line.customer} ${line.project} ${line.quote}`
                    .toLowerCase()
                    .includes(term),
            ),
    );
}
export function updateLine(
    line: DraftLine,
    change: Partial<DraftLine>,
): DraftLine {
    const affectsReview = [
        "qty",
        "price",
        "spec",
        "costs",
        "name",
        "drawing",
        "unitId",
        "vatId",
        "material",
        "finish",
    ].some((key) => key in change);
    return { ...line, ...change, ...(affectsReview ? { checked: false } : {}) };
}
