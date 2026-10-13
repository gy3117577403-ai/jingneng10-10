import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
    ArrowLeft,
    ArrowRight,
    ClipboardList,
    Factory,
    History,
    Home,
    Network,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Search,
} from "lucide-react";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./controls";
import { Workbench } from "./Workbench";
import { HistoryView } from "./HistoryView";
import { Editor } from "./Editor";
import { DetailSheet, Empty } from "./shared";
import { money } from "./model";
import "./quotation.css";

export async function api(
    endpoint,
    path = "",
    body,
    method = "GET",
    key,
    signal,
) {
    const response = await fetch(endpoint + path, {
        method,
        credentials: "same-origin",
        signal,
        headers: {
            Accept: "application/json",
            ...(body
                ? {
                      "Content-Type": "application/json",
                      "X-CSRF-TOKEN": document.querySelector(
                          'meta[name="csrf-token"]',
                      )?.content,
                      "X-Request-ID": key,
                  }
                : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
    )
        throw new Error(
            "登录状态已过期或服务暂不可用。输入仍保留，请重新登录后重试。",
        );
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(
            response.status === 419
                ? "登录已过期，请重新登录后重试。"
                : Object.values(result.errors || {})
                      .flat()
                      .join("；") ||
                      result.message ||
                      "操作失败，请重试。",
        );
        error.status = response.status;
        throw error;
    }
    return result;
}
const emptyForm = {
    title: "",
    type: "成套",
    companyId: "",
    contactId: "",
    addressId: "",
    conditionId: "",
    methodId: "",
    deliveryId: "",
    due: "",
};
function Pick({ label, value, onChange, items = [], disabled = false }) {
    return (
        <label>
            {label}
            <Select
                disabled={disabled}
                value={String(value || "")}
                onValueChange={onChange}
            >
                <SelectTrigger aria-label={label}>
                    <SelectValue>
                        {items.find((x) => String(x.id) === String(value))
                            ?.label || "请选择"}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {items.map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                            {i.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </label>
    );
}
export default function QuotationWorkspace({
    endpoint,
    home,
    organization,
    presales,
    user,
}) {
    const reduced = useReducedMotion();
    const initial = new URLSearchParams(location.search);
    const [view, setView] = useState(
        initial.get("view") === "history"
            ? "history"
            : initial.get("id")
              ? "edit"
              : "workbench",
    );
    const [quote, setQuote] = useState(null),
        [base, setBase] = useState(null),
        [quotes, setQuotes] = useState([]),
        [lines, setLines] = useState([]);
    const [workQuery, setWorkQuery] = useState(""),
        [query, setQuery] = useState(""),
        [type, setType] = useState("全部"),
        [scope, setScope] = useState("all");
    const [historyType, setHistoryType] = useState("全部"),
        [verified, setVerified] = useState(false),
        [page, setPage] = useState(1),
        [lastPage, setLastPage] = useState(1),
        [total, setTotal] = useState(0);
    const [refresh, setRefresh] = useState(0),
        [loading, setLoading] = useState(false),
        [saving, setSaving] = useState(false),
        [error, setError] = useState(""),
        [toast, setToast] = useState("");
    const [dialog, setDialog] = useState(null),
        [dialogOpen, setDialogOpen] = useState(false),
        [formError, setFormError] = useState(""),
        [form, setForm] = useState(emptyForm);
    const [options, setOptions] = useState({}),
        [customerQuery, setCustomerQuery] = useState(""),
        [reuse, setReuse] = useState(null),
        [target, setTarget] = useState("new");
    const [lineForm, setLineForm] = useState(null),
        [collapsed, setCollapsed] = useState(false),
        [editorState, setEditorState] = useState({
            tab: "lines",
            selected: "",
        });
    const [focus, setFocus] = useState(0),
        [historyOrigin, setHistoryOrigin] = useState(false),
        [versionsOpen, setVersionsOpen] = useState(false),
        [version, setVersion] = useState(null),
        [undo, setUndo] = useState(null);
    const returnFocus = useRef(null),
        keys = useRef(new Map()),
        savingRef = useRef(false),
        versionRequest = useRef(0);
    const dirty = !!quote && JSON.stringify(quote) !== JSON.stringify(base);
    const report = (e) => {
        if (e.name !== "AbortError") setError(e.message);
    };
    const accept = (q) => {
        setUndo(null);
        setQuote(q);
        setBase(q);
        setQuotes((old) => [q, ...old.filter((x) => x.id !== q.id)]);
    };
    const mutate = async (path, body, method) => {
        const identity = method + path + JSON.stringify(body);
        if (!keys.current.has(identity))
            keys.current.set(identity, crypto.randomUUID());
        return api(endpoint, path, body, method, keys.current.get(identity));
    };
    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            if (view === "edit") return;
            setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams({
                    q: view === "history" ? query : workQuery,
                    page: String(page),
                    type: view === "history" ? historyType : type,
                    verified: verified ? "1" : "0",
                    scope,
                });
                const data = await api(
                    endpoint,
                    (view === "history" ? "/history" : "") + "?" + params,
                    undefined,
                    "GET",
                    undefined,
                    controller.signal,
                );
                if (controller.signal.aborted) return;
                if (view === "history") setLines(data.lines);
                else setQuotes(data.quotes);
                setTotal(data.total);
                setLastPage(data.lastPage);
            } catch (e) {
                report(e);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 180);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [
        endpoint,
        view,
        query,
        workQuery,
        page,
        type,
        historyType,
        scope,
        verified,
        refresh,
    ]);
    useEffect(() => {
        const id = initial.get("id");
        if (id)
            api(endpoint, "/" + id)
                .then(accept)
                .catch(report);
    }, [endpoint]);
    useEffect(() => {
        const c = new AbortController();
        const timer = setTimeout(
            () =>
                api(
                    endpoint,
                    "/options?" +
                        new URLSearchParams({
                            company: form.companyId || "",
                            q: customerQuery,
                        }),
                    undefined,
                    "GET",
                    undefined,
                    c.signal,
                )
                    .then(setOptions)
                    .catch(report),
            160,
        );
        return () => {
            clearTimeout(timer);
            c.abort();
        };
    }, [endpoint, form.companyId, customerQuery]);
    useEffect(() => {
        const url = new URL(location.href);
        url.searchParams.set("view", view);
        if (view === "edit" && quote) url.searchParams.set("id", quote.id);
        else if (view !== "edit") url.searchParams.delete("id");
        history.replaceState(null, "", url);
    }, [view, quote?.id]);
    useEffect(() => {
        const handler = (e) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);
    useEffect(() => {
        if (!toast || undo) return;
        const timer = setTimeout(() => setToast(""), 5500);
        return () => clearTimeout(timer);
    }, [toast, undo]);
    const save = async () => {
        if (!dirty) return quote;
        if (savingRef.current) return null;
        savingRef.current = true;
        setSaving(true);
        setError("");
        try {
            const q = await mutate("/" + quote.id, quote, "PUT");
            accept(q);
            setToast("报价与成本已保存");
            return q;
        } catch (e) {
            report(e);
            return null;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };
    const go = async (next, origin = false) => {
        if (dirty && !(await save())) return;
        setHistoryOrigin(origin);
        setView(next);
        setPage(1);
        setError("");
        setRefresh((x) => x + 1);
    };
    const searchHistory = () => {
        if (document.querySelector('[role="dialog"][data-open]')) return;
        go("history", view === "edit");
        setFocus((x) => x + 1);
    };
    useEffect(() => {
        const key = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchHistory();
            }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    });
    const show = (kind, element) => {
        returnFocus.current = element || document.activeElement;
        setFormError("");
        setDialog(kind);
        setDialogOpen(true);
    };
    const close = () => {
        if (!saving) setDialogOpen(false);
    };
    const open = async (item) => {
        setError("");
        try {
            const q = await api(endpoint, "/" + item.id);
            accept(q);
            setEditorState({ tab: "lines", selected: "" });
            setView("edit");
        } catch (e) {
            report(e);
        }
    };
    const newQuote = () => {
        setReuse(null);
        setTarget("new");
        setForm(emptyForm);
        setCustomerQuery("");
        show("new");
    };
    const showReuse = (item, el) => {
        setReuse(item);
        setTarget(historyOrigin && quote && !quote.readOnly ? quote.id : "new");
        setForm({
            ...emptyForm,
            title: item.project + " · 本次报价",
            type: item.type === "待分类" ? "成套" : item.type,
            companyId: String(item.companyId),
        });
        setCustomerQuery(item.customer);
        show("reuse", el);
    };
    const create = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setFormError("");
        try {
            let q =
                target === "new"
                    ? await mutate("", form, "POST")
                    : await api(endpoint, "/" + target);
            accept(q);
            setTarget(q.id); // If reuse fails, retry against this already-created draft.
            if (reuse)
                q = await mutate(
                    "/" + q.id + "/reuse",
                    {
                        sourceId: reuse.id,
                        sourceToken: reuse.sourceToken,
                        token: q.token,
                    },
                    "POST",
                );
            accept(q);
            setView("edit");
            setHistoryOrigin(false);
            setEditorState({
                tab: "lines",
                selected: q.lines.at(-1)?.id || "",
            });
            setDialogOpen(false);
            setRefresh((x) => x + 1);
            setToast(
                reuse
                    ? "明细已复用并保存，请重新核对本次价格依据。"
                    : "报价草稿已保存",
            );
        } catch (e) {
            setFormError(e.message);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };
    const newLine = (id) => {
        const item = quote.lines.find((l) => l.id === id);
        setLineForm(
            item
                ? { ...item }
                : {
                      id: crypto.randomUUID(),
                      name: "",
                      drawing: "",
                      spec: "",
                      material: "",
                      finish: "",
                      qty: 1,
                      price: 0,
                      unitId: "",
                      vatId: "",
                      unit: "",
                      checked: false,
                      costs: [],
                      sourceId: "",
                      sourceQty: 0,
                      sourcePrice: 0,
                  },
        );
        show("line");
    };
    const applyLine = () => {
        if (!lineForm.name.trim() || !lineForm.unitId || !lineForm.vatId) {
            setFormError("请填写产品名称并选择单位、税率。");
            return;
        }
        const old = quote.lines.find((l) => l.id === lineForm.id);
        const item = {
            ...lineForm,
            unit:
                options.units?.find(
                    (x) => String(x.id) === String(lineForm.unitId),
                )?.label || lineForm.unit,
            checked: false,
        };
        setQuote({
            ...quote,
            lines: old
                ? quote.lines.map((l) => (l.id === item.id ? item : l))
                : [...quote.lines, item],
        });
        setEditorState({ tab: "lines", selected: item.id });
        setDialogOpen(false);
    };
    const navigate = async (url) => {
        if (dirty && !(await save())) return;
        location.href = url;
    };
    const readVersion = async (revision) => {
        const seq = ++versionRequest.current;
        setVersion(null);
        try {
            const v = await api(endpoint, `/${quote.id}/versions/${revision}`);
            if (seq === versionRequest.current) setVersion(v);
        } catch (e) {
            report(e);
        }
    };
    const setFilter = (setter) => (value) => {
        setter(value);
        setPage(1);
    };
    return (
        <div className={"q-app " + (collapsed ? "q-nav-collapsed" : "")}>
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
                    {[
                        {
                            id: "workbench",
                            label: "报价工作台",
                            icon: ClipboardList,
                        },
                        { id: "history", label: "历史报价", icon: History },
                    ].map((i) => (
                        <button
                            key={i.id}
                            className={
                                view === i.id ||
                                (i.id === "workbench" && view === "edit")
                                    ? "active"
                                    : ""
                            }
                            title={i.label}
                            onClick={() => go(i.id)}
                        >
                            <i.icon />
                            <span>{i.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="q-sidebar-bottom">
                    <a
                        href={presales}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(presales);
                        }}
                    >
                        <ClipboardList />
                        <span>售前询价</span>
                    </a>
                    <a
                        href={organization}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(organization);
                        }}
                    >
                        <Network />
                        <span>组织与成员</span>
                    </a>
                    <a
                        href={home}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(home);
                        }}
                    >
                        <Home />
                        <span>返回工作台</span>
                    </a>
                    <div className="q-profile">
                        <span>{user?.slice(0, 1)}</span>
                        <div>
                            <strong>{user}</strong>
                            <small>报价与成本工作空间</small>
                        </div>
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
                            销售与报价 <ArrowRight />
                            <b>
                                {view === "history"
                                    ? "历史报价"
                                    : view === "edit"
                                      ? "编辑报价"
                                      : "报价工作台"}
                            </b>
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        className="q-search-shortcut"
                        onClick={searchHistory}
                    >
                        <Search />
                        <span>搜索历史报价</span>
                        <kbd>Ctrl K</kbd>
                    </Button>
                    <span className="q-save-state" role="status">
                        {saving
                            ? "正在保存…"
                            : dirty
                              ? "有未保存的修改"
                              : "数据已载入"}
                    </span>
                </header>
                <nav className="q-mobile-nav" aria-label="窄屏报价导航">
                    <button onClick={() => go("workbench")}>报价工作台</button>
                    <button onClick={() => go("history")}>历史报价</button>
                </nav>
                {error && (
                    <div className="q-server-error" role="alert">
                        <span>{error}</span>
                        <Button
                            variant="outline"
                            onClick={() =>
                                quote && view === "edit"
                                    ? show("reload")
                                    : setRefresh((x) => x + 1)
                            }
                        >
                            {view === "edit" ? "重新载入" : "重试"}
                        </Button>
                    </div>
                )}
                <div className="q-content" aria-busy={loading || saving}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={view}
                            className="q-view"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: reduced ? 0 : 0.16 }}
                        >
                            {view === "workbench" ? (
                                <Workbench
                                    quotes={quotes}
                                    shown={quotes}
                                    query={workQuery}
                                    onQuery={setFilter(setWorkQuery)}
                                    type={type}
                                    onType={setFilter(setType)}
                                    scope={scope}
                                    onScope={setFilter(setScope)}
                                    onOpen={open}
                                    onNew={newQuote}
                                    onHistory={() => go("history")}
                                />
                            ) : view === "history" ? (
                                <HistoryView
                                    server
                                    lines={lines}
                                    query={query}
                                    setQuery={setFilter(setQuery)}
                                    type={historyType}
                                    setType={setFilter(setHistoryType)}
                                    verified={verified}
                                    setVerified={setFilter(setVerified)}
                                    onReuse={showReuse}
                                    focusRequest={focus}
                                    returnTitle={
                                        historyOrigin ? quote?.title : undefined
                                    }
                                    onBack={
                                        historyOrigin
                                            ? () => go("edit")
                                            : undefined
                                    }
                                />
                            ) : quote ? (
                                <fieldset
                                    disabled={saving}
                                    style={{
                                        border: 0,
                                        padding: 0,
                                        margin: 0,
                                        minWidth: 0,
                                        display: "contents",
                                    }}
                                >
                                    <Editor
                                        quote={quote}
                                        state={editorState}
                                        onStateChange={setEditorState}
                                        onChange={setQuote}
                                        onBack={() => go("workbench")}
                                        onHistory={() => go("history", true)}
                                        onReview={() =>
                                            navigate(quote.reviewUrl)
                                        }
                                        onDocument={() =>
                                            navigate(quote.legacyUrl)
                                        }
                                        onRevision={() => go("history")}
                                        onRemove={(id) => {
                                            setUndo({
                                                line: quote.lines.find(
                                                    (l) => l.id === id,
                                                ),
                                                index: quote.lines.findIndex(
                                                    (l) => l.id === id,
                                                ),
                                            });
                                            setQuote({
                                                ...quote,
                                                lines: quote.lines.filter(
                                                    (l) => l.id !== id,
                                                ),
                                            });
                                            setToast(
                                                "明细已移除，保存前可撤销。",
                                            );
                                        }}
                                        onAdd={() => newLine()}
                                        onEditLine={newLine}
                                        onSave={save}
                                        saving={saving}
                                        dirty={dirty}
                                        onVersions={() => {
                                            setVersion(null);
                                            setVersionsOpen(true);
                                        }}
                                    />
                                </fieldset>
                            ) : (
                                <Empty
                                    title={
                                        error ? "报价未载入" : "正在载入报价…"
                                    }
                                    message="登录后的访问权限以服务器为准。"
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
                {view !== "edit" && (
                    <div className="q-pagination">
                        <span>
                            {loading
                                ? "查询中…"
                                : `共 ${total} 条 · 第 ${page} / ${lastPage} 页`}
                        </span>
                        <Button
                            variant="outline"
                            disabled={loading || page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            disabled={loading || page >= lastPage}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            下一页
                        </Button>
                    </div>
                )}
            </main>
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (!saving) setDialogOpen(open);
                }}
            >
                <DialogContent
                    finalFocus={returnFocus}
                    showCloseButton={!saving}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === "line"
                                ? "报价明细"
                                : dialog === "reuse"
                                  ? "复用历史明细"
                                  : dialog === "reload"
                                    ? "重新载入报价"
                                    : "新建报价"}
                        </DialogTitle>
                        <DialogDescription>
                            {dialog === "reload"
                                ? "重新载入会放弃当前未保存的修改。可先返回并保留输入。"
                                : dialog === "line"
                                  ? "维护产品条件；数量、价格和成本在工作区中处理。"
                                  : "关联现有客户档案；保存草稿后继续维护明细与成本。"}
                        </DialogDescription>
                    </DialogHeader>
                    {dialog === "new" || dialog === "reuse" ? (
                        <div className="q-form">
                            {dialog === "reuse" && (
                                <>
                                    <div
                                        className="q-runtime-notice"
                                        style={{ margin: 0 }}
                                    >
                                        {reuse?.name} · {reuse?.quote}
                                        <br />
                                        复用后所有成本依据需要重新确认。
                                    </div>
                                    <Pick
                                        label="复用到"
                                        value={target}
                                        onChange={setTarget}
                                        items={[
                                            {
                                                id: "new",
                                                label: "新建报价草稿",
                                            },
                                            ...quotes
                                                .filter((q) => !q.readOnly)
                                                .map((q) => ({
                                                    id: q.id,
                                                    label: q.title,
                                                })),
                                        ]}
                                    />
                                </>
                            )}
                            {target === "new" && (
                                <>
                                    <label>
                                        项目名称
                                        <Input
                                            aria-label="项目名称"
                                            value={form.title}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    title: e.target.value,
                                                })
                                            }
                                        />
                                    </label>
                                    <div className="q-form-grid">
                                        <Pick
                                            label="业务类型"
                                            value={form.type}
                                            onChange={(type) =>
                                                setForm({ ...form, type })
                                            }
                                            items={["成套", "钣金"].map(
                                                (id) => ({ id, label: id }),
                                            )}
                                        />
                                        <label>
                                            报价有效期
                                            <Input
                                                aria-label="报价有效期"
                                                type="date"
                                                value={form.due}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        due: e.target.value,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                    <label>
                                        查找客户
                                        <Input
                                            aria-label="查找客户"
                                            value={customerQuery}
                                            placeholder="输入客户名称"
                                            onChange={(e) =>
                                                setCustomerQuery(e.target.value)
                                            }
                                        />
                                    </label>
                                    <Pick
                                        label="客户档案"
                                        value={form.companyId}
                                        onChange={(companyId) => {
                                            setOptions((o) => ({
                                                ...o,
                                                contacts: [],
                                                addresses: [],
                                            }));
                                            setForm({
                                                ...form,
                                                companyId,
                                                contactId: "",
                                                addressId: "",
                                            });
                                        }}
                                        items={options.companies}
                                    />
                                    <div className="q-form-grid">
                                        <Pick
                                            label="联系人"
                                            value={form.contactId}
                                            onChange={(contactId) =>
                                                setForm({ ...form, contactId })
                                            }
                                            items={options.contacts}
                                        />
                                        <Pick
                                            label="客户地址"
                                            value={form.addressId}
                                            onChange={(addressId) =>
                                                setForm({ ...form, addressId })
                                            }
                                            items={options.addresses}
                                        />
                                        <Pick
                                            label="付款条件"
                                            value={form.conditionId}
                                            onChange={(conditionId) =>
                                                setForm({
                                                    ...form,
                                                    conditionId,
                                                })
                                            }
                                            items={options.conditions}
                                        />
                                        <Pick
                                            label="付款方式"
                                            value={form.methodId}
                                            onChange={(methodId) =>
                                                setForm({ ...form, methodId })
                                            }
                                            items={options.methods}
                                        />
                                        <Pick
                                            label="交付方式"
                                            value={form.deliveryId}
                                            onChange={(deliveryId) =>
                                                setForm({ ...form, deliveryId })
                                            }
                                            items={options.deliveries}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : dialog === "line" && lineForm ? (
                        <div className="q-form-grid">
                            {[
                                ["name", "产品名称"],
                                ["drawing", "图号"],
                                ["spec", "规格"],
                                ["material", "材质"],
                                ["finish", "表面处理"],
                            ].map(([key, label]) => (
                                <label key={key}>
                                    {label}
                                    <Input
                                        aria-label={label}
                                        disabled={quote.readOnly}
                                        value={lineForm[key] || ""}
                                        onChange={(e) =>
                                            setLineForm({
                                                ...lineForm,
                                                [key]: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            ))}
                            <Pick
                                disabled={quote.readOnly}
                                label="计量单位"
                                value={lineForm.unitId}
                                onChange={(unitId) =>
                                    setLineForm({ ...lineForm, unitId })
                                }
                                items={options.units}
                            />
                            <Pick
                                disabled={quote.readOnly}
                                label="税率"
                                value={lineForm.vatId}
                                onChange={(vatId) =>
                                    setLineForm({ ...lineForm, vatId })
                                }
                                items={options.vats}
                            />
                        </div>
                    ) : null}
                    {formError && (
                        <p role="alert" style={{ color: "#9d381d" }}>
                            {formError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={saving}
                            onClick={close}
                        >
                            返回
                        </Button>
                        {dialog === "reload" ? (
                            <Button
                                onClick={async () => {
                                    setDialogOpen(false);
                                    await open(quote);
                                    setError("");
                                }}
                            >
                                放弃修改并载入
                            </Button>
                        ) : dialog === "line" ? (
                            <Button
                                disabled={quote?.readOnly}
                                onClick={applyLine}
                            >
                                应用明细
                            </Button>
                        ) : (
                            <Button disabled={saving} onClick={create}>
                                {saving
                                    ? "正在保存…"
                                    : dialog === "reuse"
                                      ? "复用并保存"
                                      : "建立报价草稿"}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <DetailSheet
                open={versionsOpen}
                onClose={() => setVersionsOpen(false)}
                title="报价保存记录"
                description="每次保存保留报价和成本快照，可查看当时的依据。"
                footer={
                    <Button
                        variant="outline"
                        onClick={() => setVersionsOpen(false)}
                    >
                        返回报价
                    </Button>
                }
            >
                {quote?.versions?.length ? (
                    quote.versions.map((v) => (
                        <button
                            className="q-version-row"
                            key={v.revision}
                            onClick={() => readVersion(v.revision)}
                        >
                            <span>保存版本 {v.revision}</span>
                            <span>{v.created_at}</span>
                        </button>
                    ))
                ) : (
                    <p>此报价尚未通过工作台保存。</p>
                )}
                {version && (
                    <div className="q-sheet-section">
                        <h3>
                            保存版本 {version.revision} ·{" "}
                            {version.snapshot.document.document.label}
                        </h3>
                        {version.snapshot.document.lines.map((l) => (
                            <div className="q-sheet-section" key={l.id}>
                                <strong>
                                    {l.label} · {l.qty} ×{" "}
                                    {money(Number(l.selling_price))}
                                </strong>
                                <p>
                                    {version.snapshot.costs.lines[l.id]?.spec}
                                </p>
                                {(
                                    version.snapshot.costs.lines[l.id]?.costs ||
                                    []
                                ).map((c) => (
                                    <p key={c.id}>
                                        {c.name} · {c.qty} {c.unit} ·{" "}
                                        {c.price === null
                                            ? "待核价"
                                            : money(c.price)}
                                        <br />
                                        {c.source || "未填写依据"}
                                    </p>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </DetailSheet>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        className="q-toast"
                        role="status"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        transition={{ duration: reduced ? 0 : 0.16 }}
                    >
                        {toast}
                        {undo && (
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    const items = [...quote.lines];
                                    items.splice(undo.index, 0, undo.line);
                                    setQuote({ ...quote, lines: items });
                                    setUndo(null);
                                    setToast("已恢复明细");
                                }}
                            >
                                撤销移除
                            </Button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
