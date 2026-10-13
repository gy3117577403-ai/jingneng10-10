import React from "react";
import {
    render,
    screen,
    waitFor,
    fireEvent,
    cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import QuotationWorkspace, { api } from "../quotes/QuotationWorkspace";
import { costTotal, total, updateLine } from "../quotes/model";

const fixture = {
    id: "23",
    code: "QA-23",
    title: "虚构报价",
    customer: "虚构客户",
    type: "成套",
    due: "2026-12-01",
    revision: 1,
    status: "草稿",
    readOnly: false,
    note: "原说明",
    token: "server-token",
    lines: [
        {
            id: "31",
            name: "虚构控制柜",
            drawing: "QA-A",
            spec: "600×400",
            qty: 2,
            unit: "台",
            unitId: 1,
            vatId: 1,
            price: 120,
            discount: 5,
            checked: true,
            sourceId: "",
            sourcePrice: 0,
            sourceQty: 0,
            costs: [
                {
                    id: "c1",
                    name: "柜体",
                    spec: "",
                    qty: 1,
                    unit: "台",
                    price: 50,
                    source: "虚构依据",
                    checked: true,
                },
            ],
        },
    ],
    versions: [],
    currency: "CNY",
    legacyUrl: "/quotes/23",
    reviewUrl: "/sales-control/quotes/23",
};
const json = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
});
let requests;
beforeEach(() => {
    history.replaceState(null, "", "/?view=edit&id=23");
    requests = [];
    vi.stubGlobal(
        "matchMedia",
        vi
            .fn()
            .mockImplementation(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
            })),
    );
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url, init) => {
            requests.push({ url, init });
            return json(
                url.includes("options")
                    ? {
                          units: [{ id: 1, label: "台" }],
                          vats: [{ id: 1, label: "13%" }],
                      }
                    : structuredClone(fixture),
            );
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const mount = () =>
    render(
        <QuotationWorkspace
            endpoint="/quotation-workspace/api"
            user="虚构管理员"
            home="/"
            presales="/presales"
            organization="/organization"
        />,
    );
describe("real quotation workspace", () => {
    it("loads server data instead of preview fixtures and saves through authenticated API", async () => {
        mount();
        const qty = await screen.findByLabelText("虚构控制柜数量");
        fireEvent.change(qty, { target: { value: "3" } });
        fetch.mockImplementation(async (url, init) => {
            requests.push({ url, init });
            if (init.method === "PUT")
                return json({
                    ...JSON.parse(init.body),
                    revision: 2,
                    token: "new-token",
                });
            return json({ units: [], vats: [] });
        });
        fireEvent.click(
            screen.getByRole("button", { name: "保存报价", exact: true }),
        );
        await screen.findByRole("button", { name: "已保存", exact: true });
        const saved = requests.find((x) => x.init.method === "PUT");
        expect(saved.url).toBe("/quotation-workspace/api/23");
        expect(JSON.parse(saved.init.body).lines[0].qty).toBe(3);
        expect(saved.init.headers["X-CSRF-TOKEN"]).toBe("test-csrf-token");
        expect(saved.init.headers["X-Request-ID"]).toBeTruthy();
    });
    it("keeps edits and stays in editor when save conflicts during navigation", async () => {
        mount();
        fireEvent.change(await screen.findByLabelText("虚构控制柜数量"), {
            target: { value: "7" },
        });
        fetch.mockImplementation(async (url, init) =>
            init.method === "PUT"
                ? json({ message: "报价已被其他操作更新。" }, 409)
                : json({}),
        );
        fireEvent.click(screen.getByRole("button", { name: "返回报价工作台" }));
        await screen.findByRole("alert");
        expect(screen.getByLabelText("虚构控制柜数量")).toHaveValue(7);
        expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
    });
    it("does not call a login HTML response a successful save", async () => {
        fetch.mockResolvedValue({
            ok: true,
            redirected: true,
            headers: { get: () => "text/html" },
        });
        await expect(api("/api")).rejects.toThrow("登录状态已过期");
    });
    it("retains null cost and discount calculations and resets review after changes", () => {
        expect(total(fixture)).toBe(228);
        expect(costTotal({ ...fixture.lines[0], costs: [] })).toBeNull();
        expect(
            costTotal({
                ...fixture.lines[0],
                costs: [{ qty: 1, price: null }],
            }),
        ).toBeNull();
        expect(updateLine(fixture.lines[0], { qty: 3 }).checked).toBe(false);
    });
    it("cost accordion maintains clear button states and invalidates changed cost evidence", async () => {
        mount();
        await screen.findByLabelText("虚构控制柜数量");
        fireEvent.click(screen.getByRole("tab", { name: /成本核价/ }));
        fireEvent.click(screen.getByRole("button", { name: "展开柜体核价" }));
        const price = await screen.findByLabelText("柜体成本价格");
        fireEvent.change(price, { target: { value: "60" } });
        expect(
            screen.getByRole("button", { name: "确认此项依据" }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("确认本次数量与配置")).not.toBeChecked();
    });
});
