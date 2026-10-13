import React from "react";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    cleanup,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import QuotationWorkspace from "../quotes/QuotationWorkspace";
import { Workbench } from "../quotes/Workbench";
import { CustomerDialog } from "../quotes/Customers";

beforeEach(() => {
    history.replaceState(null, "", "/?view=workbench");
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: true,
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
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const customer = {
    id: "12",
    name: "虚构客户验收",
    editName: "虚构客户验收",
    active: true,
    customerStatus: "3",
    comment: "",
    website: "",
    contacts: [{ id: "31", name: "虚构联系人" }],
    addresses: [{ id: "41", label: "虚构地址", adress: "虚构路" }],
    canEdit: true,
    canQuote: true,
};
const quote = {
    id: "23",
    title: "虚构项目",
    customer: "虚构客户验收",
    companyId: 12,
    type: "成套",
    status: "草稿",
    lines: [{ qty: 1, price: 100, costs: [] }],
    readOnly: false,
};
const json = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
});

it("historical missing costs do not inflate actionable counts and customer has its own action", () => {
    const onCustomer = vi.fn();
    const records = [
        quote,
        {
            ...quote,
            id: "24",
            title: "历史项目",
            readOnly: true,
            status: "未成交",
        },
    ];
    render(
        <Workbench
            quotes={records}
            shown={records}
            query=""
            type="全部"
            scope="all"
            onQuery={vi.fn()}
            onType={vi.fn()}
            onScope={vi.fn()}
            onOpen={vi.fn()}
            onNew={vi.fn()}
            onHistory={vi.fn()}
            onCustomer={onCustomer}
        />,
    );
    const summary = screen.getByLabelText("当前页报价概况");
    expect(within(summary).getByText("份待补成本").textContent).toContain("1");
    expect(within(summary).getByText("不计入当前待办")).toBeInTheDocument();
    fireEvent.click(
        screen.getAllByRole("button", { name: "虚构客户验收", exact: true })[0],
    );
    expect(onCustomer).toHaveBeenCalledWith(12);
    expect(
        screen.getByRole("button", { name: "查看报价", exact: true }),
    ).toBeInTheDocument();
});

it("a rejected customer save retains input and closing asks before discarding", async () => {
    const onClose = vi.fn(),
        mutate = vi
            .fn()
            .mockRejectedValue(new Error("客户档案已被更新，请重新核对。"));
    render(
        <CustomerDialog
            open
            customer={customer}
            request={vi.fn().mockResolvedValue({ customers: [] })}
            mutate={mutate}
            onSaved={vi.fn()}
            onClose={onClose}
            onClosed={vi.fn()}
        />,
    );
    fireEvent.change(screen.getByLabelText("客户备注"), {
        target: { value: "保留这段内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户资料" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("客户备注")).toHaveValue("保留这段内容");
    fireEvent.click(screen.getByRole("button", { name: "取消", exact: true }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(onClose).toHaveBeenCalledOnce();
});

it("creating a customer within a new quotation returns to the existing form with customer selected", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url, init) => {
            if (url.includes("/options"))
                return json({
                    canCustomers: true,
                    companies: [{ id: "12", label: customer.name }],
                    contacts: [{ id: "31", label: "虚构联系人" }],
                    addresses: [{ id: "41", label: "虚构地址" }],
                });
            if (url.endsWith("/customers") && init.method === "POST")
                return json(customer);
            if (url.includes("/customers")) return json({ customers: [] });
            return json({ quotes: [], total: 0, lastPage: 1 });
        }),
    );
    render(
        <QuotationWorkspace
            endpoint="/api"
            user="虚构管理员"
            home="/"
            organization="/org"
            presales="/presales"
        />,
    );
    await screen.findAllByRole("button", { name: "客户资料", exact: true });
    fireEvent.click(
        screen.getByRole("button", { name: "新建报价", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("项目名称"), {
        target: { value: "不能丢失的项目名称" },
    });
    fireEvent.click(
        screen.getByRole("button", { name: "新建客户", exact: true }),
    );
    fireEvent.change(await screen.findByLabelText("客户名称"), {
        target: { value: customer.name },
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(
        screen.getByRole("button", { name: "保存客户资料", exact: true }),
    );
    await waitFor(() =>
        expect(screen.getByLabelText("项目名称")).toHaveValue(
            "不能丢失的项目名称",
        ),
    );
    expect(screen.getByLabelText("客户档案")).toHaveTextContent(customer.name);
    expect(screen.getByLabelText("联系人")).toHaveTextContent("虚构联系人");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
