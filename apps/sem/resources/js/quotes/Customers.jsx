import React, { useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    MapPin,
    Pencil,
    Plus,
    Trash2,
    Users,
} from "lucide-react";
import {
    Button,
    Input,
    Textarea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Tabs,
    TabsList,
    TabsTrigger,
} from "./controls";
import { Empty, FilterSelect, SearchInput, Status } from "./shared";
import { QuoteRows } from "./Workbench";

function Pagination({ page, lastPage, total, busy, onPage }) {
    return (
        <div className="q-pagination q-inline-pagination">
            <span>
                {busy
                    ? "查询中…"
                    : `共 ${total} 条 · 第 ${page} / ${lastPage} 页`}
            </span>
            <Button
                variant="outline"
                disabled={busy || page <= 1}
                onClick={() => onPage(page - 1)}
            >
                上一页
            </Button>
            <Button
                variant="outline"
                disabled={busy || page >= lastPage}
                onClick={() => onPage(page + 1)}
            >
                下一页
            </Button>
        </div>
    );
}
const scopes = {
    在用客户: "active",
    全部客户: "all",
    潜在客户: "prospect",
    已停用: "inactive",
};
export function Customers({
    request,
    selected,
    onSelect,
    filters,
    onFilters,
    refresh,
    onNew,
    onEdit,
    onQuote,
    onOpenQuote,
    returnQuote,
    onReturn,
}) {
    const [data, setData] = useState({ customers: [], total: 0, lastPage: 1 });
    const [profile, setProfile] = useState(null),
        [quotes, setQuotes] = useState({ quotes: [], total: 0, lastPage: 1 });
    const [busy, setBusy] = useState(true),
        [error, setError] = useState(""),
        [retry, setRetry] = useState(0),
        [tab, setTab] = useState("overview"),
        [page, setPage] = useState(1);
    useEffect(() => {
        setTab("overview");
        setPage(1);
        setProfile(null);
    }, [selected]);
    useEffect(() => {
        const controller = new AbortController();
        setBusy(true);
        setError("");
        const timer = setTimeout(async () => {
            try {
                if (selected) {
                    const [c, q] = await Promise.all([
                        request(`/customers/${selected}`, controller.signal),
                        request(
                            `?companyId=${selected}&page=${page}`,
                            controller.signal,
                        ),
                    ]);
                    if (!controller.signal.aborted) {
                        setProfile(c);
                        setQuotes(q);
                    }
                } else {
                    const result = await request(
                        "/customers?" + new URLSearchParams(filters),
                        controller.signal,
                    );
                    if (!controller.signal.aborted) setData(result);
                }
            } catch (e) {
                if (!controller.signal.aborted) setError(e.message);
            } finally {
                if (!controller.signal.aborted) setBusy(false);
            }
        }, 180);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [selected, filters, refresh, retry, page, request]);
    const changeFilter = (patch) =>
        onFilters({ ...filters, ...patch, page: 1 });
    return (
        <section className="q-page q-customers" aria-busy={busy}>
            {selected ? (
                <div className="q-customer-back">
                    <Button variant="ghost" onClick={() => onSelect("")}>
                        <ArrowLeft />
                        客户资料
                    </Button>
                    {returnQuote && (
                        <Button variant="ghost" onClick={onReturn}>
                            返回正在查看的报价
                            <ArrowRight />
                        </Button>
                    )}
                </div>
            ) : null}
            {error && (
                <div className="q-server-error" role="alert">
                    <span>{error}</span>
                    <Button
                        variant="outline"
                        onClick={() => setRetry((n) => n + 1)}
                    >
                        重试
                    </Button>
                </div>
            )}
            {!selected ? (
                <>
                    <div className="q-page-heading">
                        <div>
                            <span className="q-eyebrow">销售工作空间</span>
                            <h1>客户资料</h1>
                            <p>联系人、报价与往来记录，从一份客户档案开始。</p>
                        </div>
                        <Button onClick={onNew}>
                            <Plus />
                            新建客户
                        </Button>
                    </div>
                    <div className="q-filter-bar">
                        <SearchInput
                            value={filters.q}
                            onChange={(q) => changeFilter({ q })}
                            label="搜索客户、联系人或电话"
                        />
                        <FilterSelect
                            value={Object.keys(scopes).find(
                                (k) => scopes[k] === filters.scope,
                            )}
                            onChange={(v) => changeFilter({ scope: scopes[v] })}
                            values={Object.keys(scopes)}
                            label="客户状态"
                        />
                    </div>
                    <div
                        className="q-customer-list"
                        role="list"
                        aria-label="客户资料列表"
                    >
                        <div className="q-customer-columns" aria-hidden="true">
                            <span>客户 / 负责人</span>
                            <span>主要联系人</span>
                            <span>可见报价</span>
                            <span>最近报价</span>
                            <span />
                        </div>
                        {data.customers.map((c) => (
                            <div
                                className="q-customer-row"
                                role="listitem"
                                key={c.id}
                            >
                                <div className="q-customer-name">
                                    <span className="q-customer-avatar">
                                        <Building2 />
                                    </span>
                                    <div>
                                        <button
                                            className="q-record-link"
                                            onClick={() => onSelect(c.id)}
                                        >
                                            {c.name}
                                        </button>
                                        <span className="q-meta">
                                            {c.owner} · {c.code}
                                        </span>
                                        {!c.active && (
                                            <Status tone="neutral">
                                                已停用
                                            </Status>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <span>{c.contact || "待补充联系人"}</span>
                                    <span className="q-meta">
                                        {c.phone || "未填写电话"}
                                    </span>
                                </div>
                                <div className="q-customer-count">
                                    {c.quoteCount}
                                    <span className="q-meta">
                                        {c.ongoingCount} 份进行中
                                    </span>
                                </div>
                                <span className="q-meta">
                                    {c.lastQuote?.date || "暂无报价"}
                                </span>
                                <Button
                                    variant="ghost"
                                    onClick={() => onSelect(c.id)}
                                    aria-label={`查看${c.name}档案`}
                                >
                                    查看档案
                                    <ArrowRight />
                                </Button>
                            </div>
                        ))}
                        {!data.customers.length && (
                            <Empty
                                title={busy ? "正在载入客户…" : "没有找到客户"}
                                message={
                                    busy
                                        ? ""
                                        : "调整搜索条件，或为新客户建立档案。"
                                }
                            />
                        )}
                    </div>
                    <Pagination
                        {...data}
                        page={filters.page}
                        busy={busy}
                        onPage={(page) => onFilters({ ...filters, page })}
                    />
                </>
            ) : profile ? (
                <>
                    <div className="q-page-heading q-customer-heading">
                        <div className="q-customer-name">
                            <span className="q-customer-avatar large">
                                <Building2 />
                            </span>
                            <div>
                                <span className="q-eyebrow">
                                    客户档案 · {profile.code}
                                </span>
                                <h1>{profile.name}</h1>
                                <p>
                                    <Status
                                        tone={
                                            profile.active ? "blue" : "neutral"
                                        }
                                    >
                                        {profile.status}
                                    </Status>
                                    <span>负责人：{profile.owner}</span>
                                    <span>{profile.quoteCount} 份可见报价</span>
                                </p>
                            </div>
                        </div>
                        <div className="q-actions">
                            {profile.canEdit && (
                                <Button
                                    variant="outline"
                                    onClick={() => onEdit(profile)}
                                >
                                    <Pencil />
                                    维护资料
                                </Button>
                            )}
                            <Button
                                disabled={!profile.canQuote}
                                onClick={() => onQuote(profile)}
                            >
                                <Plus />
                                为此客户报价
                            </Button>
                        </div>
                    </div>
                    {!profile.active && (
                        <div className="q-customer-notice">
                            客户已停用，历史资料仍可查询；恢复后可新建报价。
                        </div>
                    )}
                    <Tabs
                        value={tab}
                        onValueChange={setTab}
                        className="q-customer-tabs"
                    >
                        <TabsList>
                            <TabsTrigger value="overview">资料概览</TabsTrigger>
                            <TabsTrigger value="quotes">
                                关联报价 <span>{profile.quoteCount}</span>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {tab === "overview" ? (
                        <div className="q-profile-grid">
                            <section className="q-profile-section">
                                <h2>
                                    <Users />
                                    联系人{" "}
                                    <span>{profile.contacts.length}</span>
                                </h2>
                                {profile.contacts.length ? (
                                    profile.contacts.map((c) => (
                                        <div
                                            className="q-contact-entry"
                                            key={c.id}
                                        >
                                            <div>
                                                <strong>
                                                    {[c.first_name, c.name]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                </strong>
                                                <span className="q-meta">
                                                    {c.function || "未填写职务"}
                                                    {c.default
                                                        ? " · 默认联系人"
                                                        : ""}
                                                </span>
                                            </div>
                                            <div>
                                                {c.mobile ||
                                                    c.number ||
                                                    "未填写电话"}
                                                <span className="q-meta">
                                                    {c.mail || "未填写邮箱"}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="q-profile-empty">
                                        建立报价前，请补充联系人。
                                    </p>
                                )}
                            </section>
                            <section className="q-profile-section">
                                <h2>
                                    <MapPin />
                                    客户地址{" "}
                                    <span>{profile.addresses.length}</span>
                                </h2>
                                {profile.addresses.length ? (
                                    profile.addresses.map((a) => (
                                        <div
                                            className="q-address-entry"
                                            key={a.id}
                                        >
                                            <strong>{a.label}</strong>
                                            <p>
                                                {[a.province, a.city, a.adress]
                                                    .filter(Boolean)
                                                    .join(" ")}
                                            </p>
                                            {a.default && (
                                                <span className="q-meta">
                                                    默认地址
                                                </span>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="q-profile-empty">
                                        建立报价前，请补充客户地址。
                                    </p>
                                )}
                            </section>
                            <section className="q-profile-section q-profile-wide">
                                <h2>客户备注与补充资料</h2>
                                <p className="q-customer-note">
                                    {profile.comment || "暂无备注"}
                                </p>
                                {/^https?:\/\//i.test(profile.website) && (
                                    <a
                                        href={profile.website}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {profile.website}
                                    </a>
                                )}
                                <a
                                    className="q-legacy-link"
                                    href={profile.legacyUrl}
                                >
                                    打开完整客户档案
                                    <ArrowRight />
                                </a>
                            </section>
                            {profile.lastQuote && (
                                <button
                                    className="q-recent-quote"
                                    onClick={() =>
                                        onOpenQuote(profile.lastQuote)
                                    }
                                >
                                    <span className="q-meta">
                                        最近报价 · {profile.lastQuote.date}
                                    </span>
                                    <strong>{profile.lastQuote.title}</strong>
                                    <ArrowRight />
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="q-list-caption">
                                仅显示当前账号有权访问的报价。
                            </p>
                            <QuoteRows
                                shown={quotes.quotes}
                                onOpen={onOpenQuote}
                            />
                            {!quotes.quotes.length && (
                                <Empty
                                    title="暂无可见报价"
                                    message="可以从这份客户档案建立第一份报价。"
                                />
                            )}
                            <Pagination
                                {...quotes}
                                page={page}
                                busy={busy}
                                onPage={setPage}
                            />
                        </>
                    )}
                </>
            ) : (
                <Empty
                    title={busy ? "正在载入客户档案…" : "客户档案未载入"}
                    message={error || ""}
                />
            )}
        </section>
    );
}

const blank = () => ({
    name: "",
    comment: "",
    website: "",
    active: true,
    customerStatus: "3",
    contacts: [],
    addresses: [],
});
export function CustomerDialog({
    open,
    customer,
    request,
    mutate,
    onSaved,
    onClose,
    onClosed,
}) {
    const [form, setForm] = useState(blank),
        [original, setOriginal] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [discard, setDiscard] = useState(false),
        [matches, setMatches] = useState([]);
    const saving = useRef(false);
    useEffect(() => {
        if (open) {
            const value = customer
                ? { ...customer, name: customer.editName ?? customer.name }
                : blank();
            setForm(value);
            setOriginal(JSON.stringify(value));
            setError("");
            setDiscard(false);
        }
    }, [open, customer]);
    const dirty = open && JSON.stringify(form) !== original;
    useEffect(() => {
        const guard = (e) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);
    useEffect(() => {
        const controller = new AbortController();
        if (!open || form.name.trim().length < 2) {
            setMatches([]);
            return;
        }
        const timer = setTimeout(
            () =>
                request(
                    "/customers?scope=all&q=" +
                        encodeURIComponent(form.name.trim()),
                    controller.signal,
                )
                    .then((data) => {
                        if (!controller.signal.aborted)
                            setMatches(
                                data.customers
                                    .filter((c) => c.id !== customer?.id)
                                    .slice(0, 3),
                            );
                    })
                    .catch(() => {}),
            300,
        );
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, form.name, customer?.id, request]);
    const close = () => {
        if (saving.current) return;
        if (dirty) setDiscard(true);
        else onClose();
    };
    const update = (section, id, patch) =>
        setForm((f) => ({
            ...f,
            [section]: f[section].map((r) =>
                r.id === id ? { ...r, ...patch } : r,
            ),
        }));
    const add = (section) =>
        setForm((f) => ({
            ...f,
            [section]: [
                ...f[section],
                section === "contacts"
                    ? {
                          id: crypto.randomUUID(),
                          name: "",
                          first_name: "",
                          mobile: "",
                          function: "",
                          mail: "",
                      }
                    : {
                          id: crypto.randomUUID(),
                          label: "",
                          adress: "",
                          city: "",
                      },
            ],
        }));
    const save = async (e) => {
        e.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            const result = await mutate(
                "/customers" + (customer ? "/" + customer.id : ""),
                form,
                customer ? "PUT" : "POST",
            );
            onSaved(result);
        } catch (e) {
            setError(e.message);
        } finally {
            saving.current = false;
            setBusy(false);
        }
    };
    const useExisting = async (id) => {
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        try {
            const c = await request("/customers/" + id);
            if (!c.active)
                throw new Error("这份客户档案已停用，请先到客户资料恢复使用。");
            onSaved(c);
        } catch (e) {
            setError(e.message);
        } finally {
            saving.current = false;
            setBusy(false);
        }
    };
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value) close();
            }}
            onOpenChangeComplete={(value) => {
                if (!value) onClosed();
            }}
        >
            <DialogContent
                className="q-customer-dialog"
                showCloseButton={!busy}
            >
                <DialogHeader>
                    <DialogTitle>
                        {customer ? "维护客户资料" : "新建客户"}
                    </DialogTitle>
                    <DialogDescription>
                        客户资料统一保存；联系人和地址可直接用于报价。
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={save}>
                    <div className="q-customer-scroll">
                        <fieldset disabled={busy} className="q-customer-form">
                            <div className="q-form-grid">
                                <label>
                                    {customer?.individual
                                        ? "个人客户名字（称谓与姓氏保持原档案）"
                                        : "客户名称"}
                                    <Input
                                        autoComplete="organization"
                                        required
                                        maxLength={255}
                                        value={form.name}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                name: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    客户阶段
                                    <select
                                        value={form.customerStatus}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                customerStatus: e.target.value,
                                            })
                                        }
                                    >
                                        <option value="3">潜在客户</option>
                                        <option value="2">合作客户</option>
                                    </select>
                                </label>
                            </div>
                            {matches.length > 0 && (
                                <div className="q-duplicate-hint">
                                    <strong>找到相近客户，请先核对</strong>
                                    {matches.map((c) => (
                                        <div key={c.id}>
                                            <span>
                                                {c.name}
                                                <small>{c.code}</small>
                                            </span>
                                            {!customer && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        useExisting(c.id)
                                                    }
                                                >
                                                    使用已有档案
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <section className="q-form-section">
                                <div className="q-form-section-title">
                                    <h3>
                                        <Users />
                                        联系人
                                    </h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => add("contacts")}
                                    >
                                        <Plus />
                                        添加联系人
                                    </Button>
                                </div>
                                {!form.contacts.length && (
                                    <p>
                                        报价需要联系人，可现在填写或稍后补充。
                                    </p>
                                )}
                                {form.contacts.map((c, index) => (
                                    <div className="q-repeat-fields" key={c.id}>
                                        <div className="q-repeat-title">
                                            联系人 {index + 1}
                                            {!/^\d+$/.test(c.id) && (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={`移除新联系人 ${index + 1}`}
                                                    onClick={() =>
                                                        setForm({
                                                            ...form,
                                                            contacts:
                                                                form.contacts.filter(
                                                                    (x) =>
                                                                        x.id !==
                                                                        c.id,
                                                                ),
                                                        })
                                                    }
                                                >
                                                    <Trash2 />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="q-form-grid">
                                            <label>
                                                姓名
                                                <Input
                                                    required
                                                    value={[
                                                        c.first_name,
                                                        c.name,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ")}
                                                    onChange={(e) =>
                                                        update(
                                                            "contacts",
                                                            c.id,
                                                            {
                                                                first_name: "",
                                                                name: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label>
                                                电话
                                                <Input
                                                    type="tel"
                                                    value={c.mobile || ""}
                                                    onChange={(e) =>
                                                        update(
                                                            "contacts",
                                                            c.id,
                                                            {
                                                                mobile: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label>
                                                职务
                                                <Input
                                                    value={c.function || ""}
                                                    onChange={(e) =>
                                                        update(
                                                            "contacts",
                                                            c.id,
                                                            {
                                                                function:
                                                                    e.target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label>
                                                邮箱
                                                <Input
                                                    type="email"
                                                    value={c.mail || ""}
                                                    onChange={(e) =>
                                                        update(
                                                            "contacts",
                                                            c.id,
                                                            {
                                                                mail: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </section>
                            <section className="q-form-section">
                                <div className="q-form-section-title">
                                    <h3>
                                        <MapPin />
                                        客户地址
                                    </h3>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => add("addresses")}
                                    >
                                        <Plus />
                                        添加地址
                                    </Button>
                                </div>
                                {!form.addresses.length && (
                                    <p>
                                        用于报价的客户地址，可现在填写或稍后补充。
                                    </p>
                                )}
                                {form.addresses.map((a, index) => (
                                    <div className="q-repeat-fields" key={a.id}>
                                        <div className="q-repeat-title">
                                            地址 {index + 1}
                                            {!/^\d+$/.test(a.id) && (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={`移除新地址 ${index + 1}`}
                                                    onClick={() =>
                                                        setForm({
                                                            ...form,
                                                            addresses:
                                                                form.addresses.filter(
                                                                    (x) =>
                                                                        x.id !==
                                                                        a.id,
                                                                ),
                                                        })
                                                    }
                                                >
                                                    <Trash2 />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="q-form-grid">
                                            <label>
                                                地址名称
                                                <Input
                                                    required
                                                    placeholder="例如：公司地址"
                                                    value={a.label}
                                                    onChange={(e) =>
                                                        update(
                                                            "addresses",
                                                            a.id,
                                                            {
                                                                label: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label>
                                                城市
                                                <Input
                                                    value={a.city || ""}
                                                    onChange={(e) =>
                                                        update(
                                                            "addresses",
                                                            a.id,
                                                            {
                                                                city: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </label>
                                        </div>
                                        <label>
                                            详细地址
                                            <Input
                                                required
                                                value={a.adress}
                                                onChange={(e) =>
                                                    update("addresses", a.id, {
                                                        adress: e.target.value,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                ))}
                            </section>
                            <label>
                                网站（选填）
                                <Input
                                    type="url"
                                    placeholder="https://"
                                    value={form.website}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            website: e.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label>
                                客户备注
                                <Textarea
                                    rows={3}
                                    maxLength={5000}
                                    value={form.comment}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            comment: e.target.value,
                                        })
                                    }
                                />
                            </label>
                            {customer && (
                                <label className="q-active-check">
                                    <input
                                        type="checkbox"
                                        checked={form.active}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                active: e.target.checked,
                                            })
                                        }
                                    />
                                    在用客户
                                    <span>
                                        停用后保留历史资料，停止新建报价。
                                    </span>
                                </label>
                            )}
                        </fieldset>
                    </div>
                    {error && (
                        <div className="q-form-error" role="alert">
                            {error}
                        </div>
                    )}
                    <DialogFooter>
                        {discard ? (
                            <>
                                <span className="q-discard-hint">
                                    有未保存的修改
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setDiscard(false)}
                                >
                                    继续填写
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={onClose}
                                >
                                    放弃修改
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={close}
                                >
                                    取消
                                </Button>
                                <Button type="submit" disabled={busy}>
                                    {busy ? "保存中…" : "保存客户资料"}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
