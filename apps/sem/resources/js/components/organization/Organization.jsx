import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Handle, Position } from "reactflow";
import OrganizationGraph from "./OrganizationGraph";
import {
    Button,
    Switch,
    Select,
    ActionMenu,
    MenuItem,
} from "../../ui/shadcn/controls";
import "reactflow/dist/style.css";
import {
    Home,
    ClipboardCheck,
    Files,
    Network,
    Settings2,
    Search,
    Plus,
    ChevronRight,
    ChevronDown,
    Building2,
    Folder,
    Factory,
    Users,
    BriefcaseBusiness,
    ShieldCheck,
    X,
    Maximize,
    Minus,
    RefreshCw,
    UserRound,
    Camera,
    PenLine,
    Trash2,
    ListTree,
    Clock3,
    ArrowLeft,
    Check,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import {
    Segments,
    SurfaceDialog,
    readPreference,
    savePreference,
} from "../../ui/WorkspaceKit";
import { confirmAction } from "../../ui/confirmAction";
import { makeApi, stableSubmit } from "../company-data/kit";
import {
    assignment,
    ancestors,
    byId,
    chartLayout,
    positionName,
    unitPath,
    within,
} from "./model";
import {
    AvatarEditor,
    ErrorBox,
    Field,
    FormDialog,
    PermissionFields,
    PersonFields,
    UnitFields,
} from "./Forms";

const kinds = {
    company: Building2,
    department: Network,
    workshop: Factory,
    team: Users,
    project: BriefcaseBusiness,
};
const labelStatus = (p) =>
    p.status !== "active" ? "已停用" : p.needs_review ? "待核对" : "在职";
const dateValue = (s) =>
    new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
const when = (s) =>
    s
        ? dateValue(String(s)).toLocaleString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
          })
        : "长期有效";
const localInput = (s) => {
    if (!s) return null;
    const d = dateValue(String(s));
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
};
function Avatar({ person, large = false }) {
    return (
        <span
            className={`org-avatar ${large ? "large" : ""}`}
            style={{
                "--avatar-color": `hsl(${((person.id * 43) % 200) + 170} 39% 91%)`,
            }}
        >
            {person.avatar ? (
                <img
                    src={person.avatar}
                    alt={`${person.name}的头像`}
                    onError={(e) => {
                        e.currentTarget.hidden = true;
                        e.currentTarget.nextElementSibling.hidden = false;
                    }}
                />
            ) : null}
            <span hidden={!!person.avatar}>{person.name.slice(-2)}</span>
        </span>
    );
}
function UnitNode({ data }) {
    const { unit: u, onSelect, onToggle, selected, open, hasChildren } = data,
        Icon = kinds[u.kind] || Folder;
    return (
        <>
            <Handle type="target" position={Position.Left} />
            <div
                className={`org-chart-unit ${selected ? "selected" : ""} ${u.status !== "active" ? "inactive" : ""}`}
            >
                <Button
                    className="org-node-main nodrag nopan"
                    aria-pressed={selected}
                    onClick={() => onSelect(u.id)}
                    aria-label={`查看组织 ${u.name}`}
                >
                    <span className={`org-type-icon ${u.kind}`}>
                        <Icon size={23} />
                    </span>
                    <span>
                        <strong>{u.name}</strong>
                        <small>
                            {u.context_only
                                ? "上级路径"
                                : `${u.total_count} ${u.pending_count ? "条记录" : "位成员"}`}
                            {u.kind === "project" && <em>项目</em>}
                        </small>
                    </span>
                </Button>
                {hasChildren && (
                    <Button
                        className="org-expand icon nodrag nopan"
                        aria-expanded={open}
                        aria-label={`${open ? "收起" : "展开"} ${u.name}`}
                        onClick={() => onToggle(u.id)}
                    >
                        {open ? (
                            <ChevronDown size={13} />
                        ) : (
                            <ChevronRight size={13} />
                        )}
                    </Button>
                )}
            </div>
            <Handle type="source" position={Position.Right} />
        </>
    );
}
function PersonNode({ data }) {
    return (
        <>
            <Handle type="target" position={Position.Left} />
            <Button
                className={`org-chart-person nodrag nopan ${data.selected ? "selected" : ""}`}
                onClick={() => data.onSelect(data.person.id)}
                aria-label={`查看成员资料 ${data.person.name}`}
                title={`${data.person.name} · ${positionName(data.person.assignments.find((a) => a.unit_id === data.unit.id) || assignment(data.person), data.positions)}`}
            >
                <Avatar person={data.person} />
                <span>
                    <strong>{data.person.name}</strong>
                    <small>
                        {positionName(
                            data.person.assignments.find(
                                (a) => a.unit_id === data.unit.id,
                            ) || assignment(data.person),
                            data.positions,
                        )}
                    </small>
                </span>
                {data.person.needs_review && (
                    <i className="org-review-dot" title="待核对" />
                )}
            </Button>
        </>
    );
}
function MoreNode({ data }) {
    return (
        <>
            <Handle type="target" position={Position.Left} />
            <Button
                className="org-more-members nodrag nopan"
                onClick={() => data.onMembers(data.unit.id)}
                aria-label={`查看${data.unit.name}全部${data.count}条成员记录`}
            >
                查看全部 {data.count} 条成员记录
                <ChevronRight size={15} />
            </Button>
        </>
    );
}
const nodeTypes = { unit: UnitNode, person: PersonNode, more: MoreNode };
function Tree({ data, selected, onSelect, expanded, setExpanded, query }) {
    const match = useMemo(() => {
        if (!query.trim()) return null;
        const ids = new Set();
        data.units
            .filter((u) => u.name.includes(query.trim()))
            .forEach((u) =>
                ancestors(data.units, u.id).forEach((p) => ids.add(p.id)),
            );
        return ids;
    }, [data.units, query]);
    function row(u, depth) {
        if (match && !match.has(u.id)) return null;
        const children = data.units
                .filter((x) => Number(x.parent_id) === Number(u.id))
                .sort((a, b) => a.sort - b.sort || a.id - b.id),
            open = !!match || expanded.has(u.id),
            Icon =
                u.kind === "company"
                    ? Building2
                    : u.kind === "project"
                      ? BriefcaseBusiness
                      : Folder;
        return (
            <React.Fragment key={u.id}>
                <div
                    className={`org-tree-row ${selected === u.id ? "active" : ""}`}
                    style={{ "--level": depth }}
                >
                    <Button
                        className="org-tree-toggle"
                        aria-label={`${open ? "收起" : "展开"}目录 ${u.name}`}
                        disabled={!children.length}
                        onClick={() =>
                            setExpanded((old) => {
                                const next = new Set(old);
                                next.has(u.id)
                                    ? next.delete(u.id)
                                    : next.add(u.id);
                                return next;
                            })
                        }
                    >
                        {children.length ? (
                            open ? (
                                <ChevronDown size={13} />
                            ) : (
                                <ChevronRight size={13} />
                            )
                        ) : null}
                    </Button>
                    <Button
                        className="org-tree-title"
                        onClick={() => onSelect(u.id)}
                        title={unitPath(data.units, u.id)}
                    >
                        <Icon size={17} />
                        <span>{u.name}</span>
                        {u.kind === "project" ? (
                            <em>项目</em>
                        ) : (
                            <small>{u.context_only ? "" : u.total_count}</small>
                        )}
                    </Button>
                </div>
                {open && children.map((x) => row(x, depth + 1))}
            </React.Fragment>
        );
    }
    const roots = data.units.filter(
        (u) => !u.parent_id || !byId(data.units, u.parent_id),
    );
    return (
        <div className="org-tree" aria-label="组织目录">
            {roots.map((u) => row(u, 0))}
            {match?.size === 0 && <p className="org-empty">没有匹配的组织</p>}
        </div>
    );
}
function Profile({
    person,
    data,
    onClose,
    onEdit,
    onAvatar,
    onAccount,
    onLocate,
}) {
    const [tab, setTab] = useState("basic"),
        p = person,
        main = assignment(p),
        path = main ? ancestors(data.units, main.unit_id) : [];
    useEffect(() => setTab("basic"), [p.id]);
    return (
        <SurfaceDialog
            title="成员资料"
            onClose={onClose}
            modal={false}
            disablePointerDismissal
            className="org-profile"
            finalFocus={false}
        >
            <div className="org-profile-scroll">
                <div className="org-person-hero">
                    <Button
                        className="org-avatar-action"
                        aria-label={p.can_avatar ? "更换成员头像" : "成员头像"}
                        disabled={!p.can_avatar}
                        onClick={onAvatar}
                    >
                        <Avatar person={p} large />
                        {p.can_avatar && (
                            <span>
                                <Camera size={16} />
                            </span>
                        )}
                    </Button>
                    <div>
                        <div className="org-name-line">
                            <h2>{p.name}</h2>
                            {p.demo && <em>示例人物</em>}
                        </div>
                        <p>{positionName(main, data.positions)}</p>
                        <span
                            className={`org-status ${p.status === "active" && !p.needs_review ? "good" : "muted"}`}
                        >
                            <i />
                            {labelStatus(p)}
                        </span>
                    </div>
                </div>
                <div className="org-profile-content">
                    <Segments
                        label="成员资料视图"
                        value={tab}
                        onChange={setTab}
                        items={[
                            ["basic", "基本资料"],
                            ["jobs", "任职关系"],
                            ["account", "账号与权限"],
                        ]}
                    />
                    {tab === "basic" ? (
                        <>
                            <dl className="org-facts">
                                <dt>所属组织</dt>
                                <dd>
                                    {path
                                        .slice(-2)
                                        .map((u) => u.name)
                                        .join(" / ") || "尚未分配"}
                                </dd>
                                <dt>岗位</dt>
                                <dd>{positionName(main, data.positions)}</dd>
                                <dt>任职类型</dt>
                                <dd>
                                    {main?.primary ? "主职" : "兼任"}
                                    {main?.manager ? " · 主管" : ""}
                                </dd>
                                <dt>成员编号</dt>
                                <dd className="org-code">
                                    {p.code.startsWith("intake")
                                        ? "待核对编号 · " + p.id
                                        : p.code.startsWith("P-")
                                          ? "系统编号 · " + p.code.slice(-8)
                                          : p.code}
                                </dd>
                                <dt>工作邮箱</dt>
                                <dd
                                    className={!p.contact?.email ? "muted" : ""}
                                >
                                    {p.contacts_visible
                                        ? p.contact?.email || "未填写"
                                        : "无查看权限"}
                                </dd>
                                <dt>联系电话</dt>
                                <dd
                                    className={!p.contact?.phone ? "muted" : ""}
                                >
                                    {p.contacts_visible
                                        ? p.contact?.phone || "未填写"
                                        : "无查看权限"}
                                </dd>
                            </dl>
                            {p.note && <div className="org-note">{p.note}</div>}
                            <div className="org-profile-section">
                                <h3>任职关系</h3>
                                {p.assignments.map((a) => (
                                    <Button
                                        key={a.id}
                                        className="org-relation"
                                        onClick={() => onLocate(a.unit_id)}
                                    >
                                        <span className="org-type-icon">
                                            <Network size={20} />
                                        </span>
                                        <span>
                                            {ancestors(data.units, a.unit_id)
                                                .slice(-2)
                                                .map((u) => u.name)
                                                .join(" / ")}
                                        </span>
                                        <ChevronRight size={16} />
                                    </Button>
                                ))}
                            </div>
                        </>
                    ) : tab === "jobs" ? (
                        <>
                            <h3>当前任职 · {p.assignments.length}</h3>
                            {p.assignments.map((a) => (
                                <div className="org-job-card" key={a.id}>
                                    <strong>
                                        {positionName(a, data.positions)}
                                    </strong>
                                    <span>
                                        {unitPath(data.units, a.unit_id)}
                                    </span>
                                    <small>
                                        {a.primary ? "主职" : "兼任"}
                                        {a.manager ? " · 主管" : ""}
                                    </small>
                                    <Button onClick={() => onLocate(a.unit_id)}>
                                        定位组织
                                        <ChevronRight size={14} />
                                    </Button>
                                </div>
                            ))}
                            {p.history?.length > 0 && (
                                <details className="org-history">
                                    <summary>
                                        历史任职 · {p.history.length}
                                    </summary>
                                    {p.history.map((a) => (
                                        <div
                                            className="org-job-card"
                                            key={a.id}
                                        >
                                            <strong>
                                                {a.title ||
                                                    byId(
                                                        data.positions,
                                                        a.position_id,
                                                    )?.name ||
                                                    "原任职"}
                                            </strong>
                                            <span>
                                                {byId(data.units, a.unit_id)
                                                    ?.name || "原组织"}
                                            </span>
                                            <small>
                                                结束于 {when(a.ended_at)}
                                            </small>
                                        </div>
                                    ))}
                                </details>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="org-account-status">
                                <ShieldCheck size={25} />
                                <h3>
                                    {data.owner
                                        ? p.account
                                            ? "已关联登录账号"
                                            : "尚未关联登录账号"
                                        : "账号配置由总管理员管理"}
                                </h3>
                                {data.owner && p.account && (
                                    <p>{p.account.email}</p>
                                )}
                            </div>
                            <p className="org-help">
                                岗位与主管标记用于表达任职关系。系统权限由总管理员单独分配，并限定组织范围。
                            </p>
                            {data.owner && (
                                <Button
                                    className="org-full-button"
                                    onClick={onAccount}
                                    disabled={
                                        p.needs_review || p.status !== "active"
                                    }
                                >
                                    {p.account
                                        ? "调整账号关联"
                                        : "配置登录账号"}
                                </Button>
                            )}
                            {p.needs_review && (
                                <p className="org-help">
                                    完成姓名与任职核对后可配置账号。
                                </p>
                            )}
                            <a className="org-text-link" href={data.documents}>
                                前往资料中心查看内容授权
                                <ChevronRight size={14} />
                            </a>
                        </>
                    )}
                </div>
            </div>
            <footer>
                {p.can_edit && (
                    <Button className="primary" onClick={onEdit}>
                        <PenLine size={16} />
                        编辑成员
                    </Button>
                )}
                <Button
                    onClick={() => {
                        if (main) onLocate(main.unit_id);
                        onClose();
                    }}
                    disabled={!main}
                >
                    <Network size={16} />
                    定位到组织
                </Button>
            </footer>
        </SurfaceDialog>
    );
}

export default function Organization({
    endpoint,
    links = {},
    user = "管理员",
}) {
    const api = useMemo(() => makeApi(endpoint), [endpoint]),
        submit = useMemo(() => stableSubmit(api), [api]);
    const [data, setData] = useState(null),
        [error, setError] = useState(""),
        [loading, setLoading] = useState(true),
        [selected, setSelected] = useState(null),
        [expanded, setExpanded] = useState(new Set()),
        [chartExpanded, setChartExpanded] = useState(new Set()),
        [treeQuery, setTreeQuery] = useState(""),
        [search, setSearch] = useState(""),
        [view, setView] = useState(() =>
            window.innerWidth <= 760 ? "members" : "chart",
        ),
        [showPeople, setShowPeople] = useState(true),
        [selectedPerson, setSelectedPerson] = useState(null),
        [person, setPerson] = useState(null),
        [personError, setPersonError] = useState(""),
        [profileLoading, setProfileLoading] = useState(false),
        [editor, setEditor] = useState(null),
        [avatar, setAvatar] = useState(false),
        [config, setConfig] = useState(null),
        [events, setEvents] = useState([]),
        [notice, setNotice] = useState(""),
        [status, setStatus] = useState("all"),
        [subtree, setSubtree] = useState(true),
        [listQuery, setListQuery] = useState(""),
        [zoom, setZoom] = useState(1),
        [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
        [busy, setBusy] = useState(false);
    const flow = useRef(),
        searchRef = useRef(),
        loadSerial = useRef(0),
        writeLock = useRef(false),
        personFocus = useRef(null);
    const load = useCallback(async () => {
        const serial = ++loadSerial.current;
        try {
            const fresh = await api.get("");
            if (serial !== loadSerial.current) return;
            setData(fresh);
            setError("");
            setSelected((old) => {
                if (byId(fresh.units, old)) return old;
                const saved = readPreference("org.selected", null),
                    initial =
                        byId(fresh.units, saved) ||
                        fresh.units.find((u) => u.name === "钣金车间") ||
                        fresh.units.find((u) => !u.parent_id) ||
                        fresh.units[0];
                return initial?.id || null;
            });
            setExpanded((old) =>
                old.size
                    ? old
                    : new Set(
                          fresh.units
                              .filter((u) => u.kind !== "team")
                              .map((u) => u.id),
                      ),
            );
            setChartExpanded((old) =>
                old.size
                    ? old
                    : new Set(
                          fresh.units
                              .filter((u) => u.name === "装配")
                              .map((u) => u.id),
                      ),
            );
            return fresh;
        } catch (e) {
            if (serial === loadSerial.current) {
                setError(e.message);
                setData(null);
                setPerson(null);
                setSelectedPerson(null);
            }
            throw e;
        } finally {
            if (serial === loadSerial.current) setLoading(false);
        }
    }, [api]);
    useEffect(() => {
        load().catch(() => {});
    }, [load]);
    useEffect(() => {
        const refresh = () => {
            if (!editor && !avatar && document.visibilityState !== "hidden")
                load().catch(() => {});
        };
        window.addEventListener("focus", refresh);
        const timer = setInterval(refresh, 60000);
        return () => {
            window.removeEventListener("focus", refresh);
            clearInterval(timer);
        };
    }, [load, editor, avatar]);
    useEffect(() => {
        if (!selectedPerson) {
            setPerson(null);
            setPersonError("");
            return;
        }
        const controller = new AbortController();
        setProfileLoading(true);
        setPerson(null);
        setPersonError("");
        api.get("/people/" + selectedPerson, controller.signal)
            .then((p) => {
                setPerson(p);
                setPersonError("");
            })
            .catch((e) => {
                if (e.name !== "AbortError") {
                    setPerson(null);
                    setPersonError(e.message);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setProfileLoading(false);
            });
        return () => controller.abort();
    }, [api, selectedPerson, data?.revision]);
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(""), 4000);
        return () => clearTimeout(timer);
    }, [notice]);
    useEffect(() => {
        if (!editor && view === "permissions" && data?.owner)
            api.get("/configuration")
                .then(setConfig)
                .catch((e) => setError(e.message));
        if (view === "history")
            api.get("/events")
                .then((r) => setEvents(r.items))
                .catch((e) => setError(e.message));
    }, [api, view, data?.revision, editor]);
    useEffect(() => {
        const key = (e) => {
            if (
                e.key === "/" &&
                !["INPUT", "TEXTAREA", "SELECT"].includes(
                    document.activeElement?.tagName,
                )
            ) {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === "Escape") setSearch("");
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, []);
    useEffect(() => {
        const resize = () => {
            if (window.innerWidth <= 760) {
                setSidebar(false);
                setView((old) => (old === "chart" ? "members" : old));
            }
        };
        window.addEventListener("resize", resize);
        return () => {
            window.removeEventListener("resize", resize);
        };
    }, []);
    const selectUnit = useCallback(
        (id) => {
            if (window.innerWidth <= 760) setSidebar(false);
            setSelected(id);
            savePreference("org.selected", id);
            setExpanded(
                (old) =>
                    new Set([
                        ...old,
                        ...ancestors(data?.units || [], id).map((u) => u.id),
                    ]),
            );
            setSearch("");
        },
        [data?.units],
    );
    const openPerson = (id) => {
        personFocus.current = document.activeElement;
        setSelectedPerson(id);
        setSearch("");
    };
    const closePerson = () => {
        setSelectedPerson(null);
        setPerson(null);
        if (personFocus.current?.isConnected) personFocus.current.focus();
    };
    const toggleChart = (id) =>
        setChartExpanded((old) => {
            const next = new Set(old),
                isOpen =
                    !old.has(-id) &&
                    (old.has(id) ||
                        ancestors(data?.units || [], selected).some(
                            (u) => u.id === id,
                        ));
            next.delete(id);
            next.delete(-id);
            next.add(isOpen ? -id : id);
            return next;
        });
    const graph = useMemo(() => {
        const g = chartLayout(
            data?.units || [],
            data?.people || [],
            selected,
            chartExpanded,
            showPeople,
            0,
        );
        return {
            ...g,
            edges: g.edges.map((e) => ({
                ...e,
                focusable: false,
                ariaLabel: "组织任职关系",
            })),
            nodes: g.nodes.map((n) => ({
                ...n,
                ariaLabel:
                    n.type === "person" ? n.data.person.name : n.data.unit.name,
                draggable: false,
                focusable: false,
                style: { pointerEvents: "all" },
                className: "nopan",
                data: {
                    ...n.data,
                    onSelect: n.type === "unit" ? selectUnit : openPerson,
                    onToggle: toggleChart,
                    onMembers: (id) => {
                        selectUnit(id);
                        setSubtree(false);
                        setListQuery("");
                        setStatus("all");
                        setView("members");
                    },
                    positions: data?.positions || [],
                    ...(n.type === "person"
                        ? { selected: n.data.person.id === selectedPerson }
                        : {}),
                },
            })),
        };
    }, [data, selected, chartExpanded, showPeople, selectedPerson, selectUnit]);

    const unit = byId(data?.units || [], selected),
        unitPeople = (data?.people || []).filter((p) =>
            p.assignments.some((a) =>
                subtree
                    ? within(data.units, a.unit_id, selected)
                    : Number(a.unit_id) === Number(selected),
            ),
        );
    const filtered = unitPeople.filter(
        (p) =>
            (status === "all" ||
                (status === "review" ? p.needs_review : p.status === status)) &&
            (!listQuery ||
                [p.name, p.code, ...p.assignments.map((a) => a.title)]
                    .join(" ")
                    .includes(listQuery.trim())),
    );
    const searchResults = search.trim()
        ? {
              units:
                  data?.units
                      .filter((u) => u.name.includes(search.trim()))
                      .slice(0, 7) || [],
              people:
                  data?.people
                      .filter((p) =>
                          [p.name, p.code, ...p.assignments.map((a) => a.title)]
                              .join(" ")
                              .includes(search.trim()),
                      )
                      .slice(0, 8) || [],
          }
        : null;
    async function getConfig() {
        if (!data?.owner) return null;
        const c = await api.get("/configuration");
        setConfig(c);
        return c;
    }
    async function editPerson(p) {
        try {
            const detail = await api.get("/people/" + p.id);
            setEditor({
                kind: "person",
                id: p.id,
                title: "编辑成员",
                value: {
                    ...detail,
                    contact: detail.contacts_visible
                        ? detail.contact || { email: "", phone: "" }
                        : undefined,
                    assignments: detail.assignments.map((a) => ({
                        ...a,
                        primary: !!a.primary,
                        manager: !!a.manager,
                    })),
                },
            });
        } catch (e) {
            setError(e.message);
        }
    }
    function newPerson() {
        const uid = unit?.can_people
            ? unit.id
            : data.units.find((u) => u.can_people)?.id;
        setEditor({
            kind: "person",
            id: 0,
            title: "新增成员",
            value: {
                name: "",
                code: "",
                status: "active",
                needs_review: false,
                note: "",
                ...(data.owner ? { contact: { email: "", phone: "" } } : {}),
                assignments: uid
                    ? [
                          {
                              unit_id: uid,
                              position_id: null,
                              title: "",
                              primary: true,
                              manager: false,
                          },
                      ]
                    : [],
            },
        });
    }
    function editUnit(row) {
        setEditor({
            kind: "unit",
            id: row?.id || 0,
            title: row ? "编辑组织" : "新增组织",
            value: row
                ? { ...row, note: row.note || "" }
                : {
                      name: "",
                      kind: "department",
                      parent_id: unit?.can_edit ? unit.id : null,
                      status: "active",
                      sort: 0,
                      note: "",
                  },
        });
    }
    function editPosition(row) {
        setEditor({
            kind: "position",
            id: row?.id || 0,
            title: row ? "编辑岗位" : "新增岗位",
            value: row
                ? { ...row, enabled: !!row.enabled }
                : { name: "", description: "", enabled: true },
        });
    }
    async function remove(kind, row) {
        if (writeLock.current) return;
        if (
            !(await confirmAction(
                kind === "grant"
                    ? `确认撤销“${byId(config?.users || [], row.user_id)?.name || "此账号"}”的这条组织授权？撤销后下次请求立即生效，其他授权保留。`
                    : `确认删除“${row.name || "这条记录"}”？有关联成员或引用时会提示先处理，历史记录会保留。`,
                {
                    title: kind === "grant" ? "撤销授权" : "删除确认",
                    confirmLabel: kind === "grant" ? "撤销授权" : "确认删除",
                },
            ))
        )
            return;
        writeLock.current = true;
        setBusy(true);
        try {
            await submit(`/${kind}/${row.id}`, {
                action: "delete",
                revision: row.revision,
            });
            if (kind === "person" && selectedPerson === row.id) closePerson();
            await load();
            setNotice(kind === "grant" ? "授权已撤销" : "已删除");
        } catch (e) {
            setError(e.message);
        } finally {
            writeLock.current = false;
            setBusy(false);
        }
    }
    async function saved(value) {
        const payload =
            editor.kind === "grant"
                ? {
                      ...value,
                      expires_at: value.expires_at
                          ? new Date(value.expires_at).toISOString()
                          : null,
                  }
                : value;
        const result = await submit(`/${editor.kind}/${editor.id}`, payload);
        if (editor.kind === "owner") {
            setEditor(null);
            closePerson();
            setView("chart");
            await load().catch(() => {});
            setNotice("总管理员已转交");
            return;
        }
        await load();
        if (editor.kind === "unit" && !editor.id) selectUnit(result.id);
        if (editor.kind === "person") openPerson(result.id);
        setNotice(editor.kind === "owner" ? "总管理员已转交" : "已保存");
    }
    async function account() {
        try {
            await getConfig();
            setEditor({
                kind: "account",
                id: person.id,
                person,
                title: "成员登录账号",
                value: {
                    action: "link",
                    user_id: person.user_id,
                    revision: person.revision,
                    email: "",
                    password: "",
                },
            });
        } catch (e) {
            setError(e.message);
        }
    }
    function role(row) {
        setEditor({
            kind: "role",
            id: row?.id || 0,
            title: row ? "编辑权限角色" : "新增权限角色",
            value: row
                ? { ...row, enabled: !!row.enabled }
                : { name: "", permissions: ["browse"], enabled: true },
        });
    }
    function grant(row) {
        setEditor({
            kind: "grant",
            id: row?.id || 0,
            title: row ? "编辑授权" : "分配组织权限",
            value: row
                ? {
                      ...row,
                      descendants: !!row.descendants,
                      expires_at: localInput(row.expires_at),
                  }
                : {
                      user_id: null,
                      role_id: null,
                      unit_id: unit?.id || null,
                      descendants: true,
                      expires_at: null,
                  },
        });
    }
    const viewItems = [
        ["chart", "架构图"],
        ["members", "成员"],
    ];
    return (
        <div
            className={`org-shell ${sidebar ? "" : "org-no-sidebar"} ${selectedPerson ? "org-has-profile" : ""}`}
        >
            <nav className="org-rail" aria-label="工作区导航">
                <a
                    className="org-brand"
                    href={links.home}
                    aria-label="返回工作台"
                >
                    <span>
                        <Network size={25} />
                    </span>
                    <strong>京能</strong>
                </a>
                <a href={links.home} title="工作台" aria-label="工作台">
                    <Home />
                </a>
                <a
                    href={links.presales}
                    title="售前工作台"
                    aria-label="售前工作台"
                >
                    <ClipboardCheck />
                </a>
                <a
                    href={links.documents}
                    title="公司资料"
                    aria-label="公司资料"
                >
                    <Files />
                </a>
                <Button
                    className={
                        ["chart", "members"].includes(view) ? "active" : ""
                    }
                    title="组织与成员"
                    aria-label="组织与成员"
                    onClick={() => setView("chart")}
                >
                    <Network />
                </Button>
                {data?.owner && (
                    <Button
                        className={view === "permissions" ? "active" : ""}
                        title="权限设置"
                        aria-label="权限设置"
                        onClick={() => {
                            closePerson();
                            setView("permissions");
                        }}
                    >
                        <ShieldCheck />
                    </Button>
                )}
                <span className="org-rail-spacer" />
                {data?.can_audit && (
                    <Button
                        className={view === "history" ? "active" : ""}
                        aria-label="变更记录"
                        title="变更记录"
                        onClick={() => {
                            closePerson();
                            setView("history");
                        }}
                    >
                        <Clock3 />
                    </Button>
                )}
                <Button
                    aria-label={sidebar ? "收起组织目录" : "展开组织目录"}
                    title={sidebar ? "收起组织目录" : "展开组织目录"}
                    onClick={() => setSidebar((v) => !v)}
                >
                    {sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
            </nav>
            <header className="org-topbar">
                <h1>组织与成员</h1>
                <div className="org-global-search">
                    <Search size={18} />
                    <input
                        ref={searchRef}
                        aria-label="搜索组织或成员"
                        placeholder="搜索组织、成员或岗位"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                        <Button
                            className="icon"
                            aria-label="清除搜索"
                            onClick={() => setSearch("")}
                        >
                            <X size={15} />
                        </Button>
                    ) : (
                        <kbd>/</kbd>
                    )}
                    {searchResults && (
                        <div className="org-search-results">
                            <span>组织</span>
                            {searchResults.units.map((u) => (
                                <Button
                                    key={"u" + u.id}
                                    onClick={() => {
                                        selectUnit(u.id);
                                        setView("chart");
                                    }}
                                >
                                    <Folder size={17} />
                                    <strong>{u.name}</strong>
                                    <small>{unitPath(data.units, u.id)}</small>
                                </Button>
                            ))}
                            <span>成员</span>
                            {searchResults.people.map((p) => (
                                <Button
                                    key={"p" + p.id}
                                    onClick={() => openPerson(p.id)}
                                >
                                    <Avatar person={p} />
                                    <strong>{p.name}</strong>
                                    <small>
                                        {positionName(
                                            assignment(p),
                                            data.positions,
                                        )}
                                    </small>
                                </Button>
                            ))}
                            {!searchResults.units.length &&
                                !searchResults.people.length && (
                                    <p>没有匹配结果</p>
                                )}
                        </div>
                    )}
                </div>
                <div className="org-user">
                    <span className="org-user-avatar">{user.slice(-1)}</span>
                    <div>
                        <strong>{user}</strong>
                        <small>{data?.owner ? "总管理员" : "已登录"}</small>
                    </div>
                </div>
            </header>
            {sidebar && (
                <aside className="org-sidebar">
                    <div className="org-sidebar-title">
                        <h2>组织目录</h2>
                        <Button
                            className="icon"
                            title="刷新组织"
                            aria-label="刷新组织"
                            onClick={() => load().catch(() => {})}
                        >
                            <RefreshCw size={15} />
                        </Button>
                    </div>
                    <div className="org-tree-search">
                        <Search size={16} />
                        <input
                            aria-label="筛选组织目录"
                            value={treeQuery}
                            placeholder="查找组织"
                            onChange={(e) => setTreeQuery(e.target.value)}
                        />
                    </div>
                    {data && (
                        <Tree
                            data={data}
                            selected={selected}
                            onSelect={(id) => {
                                selectUnit(id);
                                if (!["chart", "members"].includes(view))
                                    setView("chart");
                            }}
                            expanded={expanded}
                            setExpanded={setExpanded}
                            query={treeQuery}
                        />
                    )}
                    <div className="org-sidebar-bottom">
                        {data?.can_positions && (
                            <Button
                                onClick={() => {
                                    closePerson();
                                    setView("positions");
                                }}
                                className={view === "positions" ? "active" : ""}
                            >
                                <BriefcaseBusiness size={17} />
                                岗位管理<span>{data.positions.length}</span>
                            </Button>
                        )}
                        {data?.owner && (
                            <Button
                                onClick={() => {
                                    closePerson();
                                    setView("permissions");
                                }}
                                className={
                                    view === "permissions" ? "active" : ""
                                }
                            >
                                <Settings2 size={17} />
                                权限设置
                                <ChevronRight size={14} />
                            </Button>
                        )}
                    </div>
                </aside>
            )}
            <main className="org-main">
                <div className="org-toolbar">
                    {["chart", "members"].includes(view) ? (
                        <>
                            <div className="org-breadcrumb">
                                {ancestors(data?.units || [], selected)
                                    .slice(-3)
                                    .map((u, i) => (
                                        <React.Fragment key={u.id}>
                                            {i > 0 && (
                                                <ChevronRight size={13} />
                                            )}
                                            <Button
                                                title={unitPath(
                                                    data.units,
                                                    u.id,
                                                )}
                                                onClick={() => selectUnit(u.id)}
                                            >
                                                {u.name}
                                            </Button>
                                        </React.Fragment>
                                    ))}
                            </div>
                            <Segments
                                label="组织工作视图"
                                items={viewItems}
                                value={view}
                                onChange={setView}
                            />
                            <div className="org-toolbar-actions">
                                {view === "chart" && (
                                    <Button
                                        className="org-text-button"
                                        onClick={() =>
                                            setChartExpanded((old) =>
                                                data.units.every((u) =>
                                                    old.has(u.id),
                                                )
                                                    ? new Set()
                                                    : new Set(
                                                          data.units.map(
                                                              (u) => u.id,
                                                          ),
                                                      ),
                                            )
                                        }
                                    >
                                        <ListTree size={16} />
                                        {data?.units.every((u) =>
                                            chartExpanded.has(u.id),
                                        )
                                            ? "收起分支"
                                            : "展开全部"}
                                    </Button>
                                )}
                                {(unit?.can_edit || data?.can_root) && (
                                    <Button
                                        className={
                                            view === "chart" ? "primary" : ""
                                        }
                                        onClick={() => editUnit(null)}
                                    >
                                        <Plus size={17} />
                                        新增组织
                                    </Button>
                                )}
                                {(unit?.can_people || data?.owner) && (
                                    <Button
                                        className={
                                            view === "members" ? "primary" : ""
                                        }
                                        onClick={newPerson}
                                    >
                                        <Plus size={16} />
                                        新增成员
                                    </Button>
                                )}
                                {unit?.can_edit && (
                                    <ActionMenu
                                        label="组织操作"
                                        icon={<Settings2 size={16} />}
                                    >
                                        <MenuItem
                                            onClick={() => editUnit(unit)}
                                        >
                                            <PenLine size={15} />
                                            编辑组织
                                        </MenuItem>
                                        <MenuItem
                                            className="danger"
                                            disabled={busy}
                                            onClick={() => remove("unit", unit)}
                                        >
                                            <Trash2 size={15} />
                                            删除组织
                                        </MenuItem>
                                    </ActionMenu>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <Button
                                className="org-text-button"
                                onClick={() => setView("chart")}
                            >
                                <ArrowLeft size={16} />
                                组织架构
                            </Button>
                            <h2>
                                {
                                    {
                                        permissions: "权限设置",
                                        positions: "岗位管理",
                                        history: "变更记录",
                                    }[view]
                                }
                            </h2>
                            <div className="org-toolbar-actions">
                                {view === "positions" &&
                                    data?.can_positions && (
                                        <Button
                                            className="primary"
                                            onClick={() => editPosition(null)}
                                        >
                                            <Plus size={16} />
                                            新增岗位
                                        </Button>
                                    )}
                                {view === "permissions" && config && (
                                    <Button
                                        className="primary"
                                        onClick={() => grant(null)}
                                    >
                                        <Plus size={16} />
                                        分配权限
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>
                {error && (
                    <div className="org-page-error">
                        <ErrorBox error={error} />
                        <Button
                            className="icon"
                            aria-label="关闭提示"
                            onClick={() => setError("")}
                        >
                            <X size={16} />
                        </Button>
                    </div>
                )}
                {loading ? (
                    <div className="org-loading">
                        <span />
                        正在载入组织与成员…
                    </div>
                ) : !data ? (
                    <div className="org-empty-state">
                        <ShieldCheck size={35} />
                        <h2>暂时无法打开组织工作区</h2>
                        <p>{error || "请刷新后重试"}</p>
                        <Button onClick={() => load().catch(() => {})}>
                            重新加载
                        </Button>
                        <a href={links.home}>返回工作台</a>
                    </div>
                ) : view === "chart" ? (
                    <div className="org-canvas-wrap">
                        <div className="org-canvas-options">
                            <label className="org-people-toggle">
                                <Switch
                                    checked={showPeople}
                                    onCheckedChange={setShowPeople}
                                    aria-label="显示成员"
                                />
                                显示成员
                            </label>
                            {unit && (
                                <small>
                                    {unit.total_count} 条记录 ·{" "}
                                    {unit.pending_count
                                        ? `${unit.pending_count} 条待核对`
                                        : `直属 ${unit.direct_count} 位`}
                                </small>
                            )}
                        </div>
                        {graph.nodes.length ? (
                            <OrganizationGraph
                                graph={graph}
                                nodeTypes={nodeTypes}
                                flow={flow}
                                onZoom={setZoom}
                                focusId={
                                    selectedPerson
                                        ? graph.nodes.find(
                                              (n) =>
                                                  n.type === "person" &&
                                                  n.data.person.id ===
                                                      selectedPerson,
                                          )?.id || `u${selected}`
                                        : `u${selected}`
                                }
                                profileOpen={!!selectedPerson}
                            />
                        ) : (
                            <div className="org-empty-state">
                                <Network size={40} />
                                <h2>从第一个组织开始</h2>
                                <p>建立组织后，即可添加岗位、成员和权限。</p>
                                {data.can_root && (
                                    <Button
                                        className={
                                            view === "chart" ? "primary" : ""
                                        }
                                        onClick={() => editUnit(null)}
                                    >
                                        新增组织
                                    </Button>
                                )}
                            </div>
                        )}
                        <div className="org-canvas-bottom">
                            <div className="org-legend">
                                {Object.entries(data.kinds)
                                    .filter(([k]) => k !== "company")
                                    .map(([key, name]) => {
                                        const Icon = kinds[key];
                                        return (
                                            <span key={key}>
                                                <Icon size={16} />
                                                {name}
                                            </span>
                                        );
                                    })}
                            </div>
                            <div className="org-zoom">
                                <Button
                                    aria-label="缩小架构图"
                                    onClick={() => flow.current?.zoomOut()}
                                >
                                    <Minus size={17} />
                                </Button>
                                <span>{Math.round(zoom * 100)}%</span>
                                <Button
                                    aria-label="放大架构图"
                                    onClick={() => flow.current?.zoomIn()}
                                >
                                    <Plus size={17} />
                                </Button>
                                <i />
                                <Button
                                    onClick={() =>
                                        flow.current?.fitOrganization()
                                    }
                                >
                                    <Maximize size={15} />
                                    适应画布
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : view === "members" ? (
                    <section className="org-list-panel">
                        <div className="org-list-toolbar">
                            <div className="org-tree-search">
                                <Search size={16} />
                                <input
                                    placeholder="查找当前范围成员"
                                    aria-label="筛选成员"
                                    value={listQuery}
                                    onChange={(e) =>
                                        setListQuery(e.target.value)
                                    }
                                />
                            </div>
                            <Select
                                label="成员状态"
                                value={status}
                                onValueChange={setStatus}
                                items={[
                                    { value: "all", label: "全部状态" },
                                    { value: "active", label: "在职" },
                                    { value: "review", label: "待核对" },
                                    { value: "inactive", label: "已停用" },
                                ]}
                            />
                            <label>
                                <input
                                    type="checkbox"
                                    checked={subtree}
                                    onChange={(e) =>
                                        setSubtree(e.target.checked)
                                    }
                                />
                                包含下级
                            </label>
                            <span>{filtered.length} 条记录</span>
                        </div>
                        <div className="org-table-scroll">
                            <table className="org-table">
                                <thead>
                                    <tr>
                                        <th>成员</th>
                                        <th>岗位 / 职务</th>
                                        <th>组织</th>
                                        <th>状态</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p) => (
                                        <tr
                                            key={p.id}
                                            className={
                                                selectedPerson === p.id
                                                    ? "is-selected"
                                                    : ""
                                            }
                                        >
                                            <td>
                                                <Button
                                                    className="org-member-link"
                                                    onClick={() =>
                                                        openPerson(p.id)
                                                    }
                                                >
                                                    <Avatar person={p} />
                                                    <span>
                                                        <strong>
                                                            {p.name}
                                                        </strong>
                                                        {p.demo && (
                                                            <small>
                                                                示例人物
                                                            </small>
                                                        )}
                                                    </span>
                                                </Button>
                                            </td>
                                            <td>
                                                {positionName(
                                                    assignment(p),
                                                    data.positions,
                                                )}
                                                {p.assignments.length > 1 && (
                                                    <small>
                                                        等{" "}
                                                        {p.assignments.length}{" "}
                                                        条任职
                                                    </small>
                                                )}
                                            </td>
                                            <td>
                                                {p.assignments
                                                    .map(
                                                        (a) =>
                                                            byId(
                                                                data.units,
                                                                a.unit_id,
                                                            )?.name,
                                                    )
                                                    .filter(
                                                        (n, i, a) =>
                                                            a.indexOf(n) === i,
                                                    )
                                                    .join("、")}
                                            </td>
                                            <td>
                                                <span
                                                    className={`org-status ${p.status === "active" && !p.needs_review ? "good" : "muted"}`}
                                                >
                                                    <i />
                                                    {labelStatus(p)}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="org-row-actions">
                                                    <Button
                                                        title="查看资料"
                                                        aria-label={`查看成员 ${p.name}`}
                                                        onClick={() =>
                                                            openPerson(p.id)
                                                        }
                                                    >
                                                        <UserRound size={16} />
                                                    </Button>
                                                    {p.can_edit && (
                                                        <>
                                                            <Button
                                                                title="编辑成员"
                                                                aria-label={`编辑成员 ${p.name}`}
                                                                onClick={() =>
                                                                    editPerson(
                                                                        p,
                                                                    )
                                                                }
                                                            >
                                                                <PenLine
                                                                    size={16}
                                                                />
                                                            </Button>
                                                            <Button
                                                                className="danger"
                                                                title="删除成员"
                                                                aria-label={`删除成员 ${p.name}`}
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    remove(
                                                                        "person",
                                                                        p,
                                                                    )
                                                                }
                                                            >
                                                                <Trash2
                                                                    size={16}
                                                                />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!filtered.length && (
                                <div className="org-empty-state">
                                    <Users size={32} />
                                    <h3>当前范围暂无匹配成员</h3>
                                    <p>可以调整筛选条件，或添加第一位成员。</p>
                                </div>
                            )}
                        </div>
                    </section>
                ) : view === "positions" ? (
                    <section className="org-management">
                        <p className="org-help">
                            岗位用于统一任职名称；系统权限单独设置。同一成员可拥有多个岗位。
                        </p>
                        <table className="org-table">
                            <thead>
                                <tr>
                                    <th>岗位名称</th>
                                    <th>说明</th>
                                    <th>状态</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.positions.map((p) => (
                                    <tr key={p.id}>
                                        <td>
                                            <strong>{p.name}</strong>
                                        </td>
                                        <td>{p.description || "—"}</td>
                                        <td>{p.enabled ? "在用" : "停用"}</td>
                                        <td>
                                            <div className="org-row-actions">
                                                <Button
                                                    aria-label={`编辑岗位 ${p.name}`}
                                                    onClick={() =>
                                                        editPosition(p)
                                                    }
                                                >
                                                    <PenLine size={16} />
                                                </Button>
                                                <Button
                                                    className="danger"
                                                    aria-label={`删除岗位 ${p.name}`}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        remove("position", p)
                                                    }
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!data.positions.length && (
                            <p className="org-empty">
                                暂无岗位，点击右上角新增。
                            </p>
                        )}
                    </section>
                ) : view === "permissions" ? (
                    <section className="org-management">
                        {!data.owner ? (
                            <div className="org-empty-state">
                                <ShieldCheck size={32} />
                                <h3>权限设置由总管理员负责</h3>
                            </div>
                        ) : !config ? (
                            <p className="org-empty">正在载入权限配置…</p>
                        ) : (
                            <>
                                <div className="org-owner-card">
                                    <span className="org-type-icon">
                                        <ShieldCheck size={27} />
                                    </span>
                                    <div>
                                        <strong>
                                            {data.owner_name} <em>总管理员</em>
                                        </strong>
                                        <p>
                                            管理组织、成员、岗位与授权。当前仅保留一个总管理员。
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() =>
                                            setEditor({
                                                kind: "owner",
                                                id: 0,
                                                title: "转交总管理员",
                                                value: {
                                                    user_id: null,
                                                    password: "",
                                                    revision: config.revision,
                                                },
                                            })
                                        }
                                    >
                                        转交管理员
                                    </Button>
                                </div>
                                <div className="org-section-heading">
                                    <h3>
                                        已分配权限{" "}
                                        <span>{config.grants.length}</span>
                                    </h3>
                                    <a href={links.documents}>
                                        资料内容权限在资料中心设置
                                        <ChevronRight size={14} />
                                    </a>
                                </div>
                                <table className="org-table">
                                    <thead>
                                        <tr>
                                            <th>账号</th>
                                            <th>角色</th>
                                            <th>组织范围</th>
                                            <th>有效期</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {config.grants.map((g) => (
                                            <tr key={g.id}>
                                                <td>
                                                    {byId(
                                                        config.users,
                                                        g.user_id,
                                                    )?.name || "已停用账号"}
                                                </td>
                                                <td>
                                                    {
                                                        byId(
                                                            config.roles,
                                                            g.role_id,
                                                        )?.name
                                                    }
                                                </td>
                                                <td>
                                                    {g.unit_id
                                                        ? byId(
                                                              data.units,
                                                              g.unit_id,
                                                          )?.name
                                                        : "全公司"}
                                                    {g.unit_id && g.descendants
                                                        ? "及下级"
                                                        : ""}
                                                </td>
                                                <td>{when(g.expires_at)}</td>
                                                <td>
                                                    <div className="org-row-actions">
                                                        <Button
                                                            aria-label={`编辑授权 ${g.id}`}
                                                            onClick={() =>
                                                                grant(g)
                                                            }
                                                        >
                                                            <PenLine
                                                                size={16}
                                                            />
                                                        </Button>
                                                        <Button
                                                            className="danger"
                                                            aria-label={`撤销授权 ${g.id}`}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                remove(
                                                                    "grant",
                                                                    g,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!config.grants.length && (
                                    <div className="org-empty-permissions">
                                        <ShieldCheck size={25} />
                                        <div>
                                            <strong>尚未分配给其他账号</strong>
                                            <p>
                                                准备好后，选择账号、角色和负责的组织范围即可交接。
                                            </p>
                                        </div>
                                        <Button onClick={() => grant(null)}>
                                            分配第一条权限
                                        </Button>
                                    </div>
                                )}
                                <div className="org-section-heading">
                                    <h3>权限角色</h3>
                                    <Button onClick={() => role(null)}>
                                        <Plus size={16} />
                                        新增角色
                                    </Button>
                                </div>
                                <div className="org-role-grid">
                                    {config.roles.map((r) => (
                                        <article key={r.id}>
                                            <header>
                                                <ShieldCheck size={20} />
                                                <strong>{r.name}</strong>
                                                <span>
                                                    {r.enabled
                                                        ? "启用"
                                                        : "停用"}
                                                </span>
                                            </header>
                                            <p>
                                                {r.permissions
                                                    .map(
                                                        (a) =>
                                                            config.actions[a],
                                                    )
                                                    .join("、") ||
                                                    "尚未选择权限"}
                                            </p>
                                            <footer>
                                                <Button onClick={() => role(r)}>
                                                    编辑角色
                                                </Button>
                                                <Button
                                                    className="danger"
                                                    aria-label={`删除角色 ${r.name}`}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        remove("role", r)
                                                    }
                                                >
                                                    删除
                                                </Button>
                                            </footer>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                ) : (
                    <section className="org-management">
                        <p className="org-help">
                            记录组织、任职、头像及授权变更。界面显示最近可查看的100条；历史记录继续保存在数据库中。
                        </p>
                        <div className="org-event-list">
                            {events.map((e) => (
                                <article key={e.id}>
                                    <span className="org-event-dot" />
                                    <div>
                                        <strong>{e.action}</strong>
                                        <p>
                                            {e.detail.name ||
                                                e.detail.configuration?.name ||
                                                "配置已更新"}
                                        </p>
                                        <small>
                                            {e.actor} · {when(e.created_at)}
                                        </small>
                                    </div>
                                </article>
                            ))}
                            {!events.length && (
                                <p className="org-empty">
                                    暂无可查看的变更记录
                                </p>
                            )}
                        </div>
                    </section>
                )}
            </main>
            {notice && (
                <div className="org-toast" role="status">
                    <Check size={18} />
                    {notice}
                </div>
            )}
            {selectedPerson && (profileLoading || personError) && (
                <div className="org-profile org-profile-placeholder">
                    <Button
                        className="icon"
                        aria-label="关闭成员资料"
                        onClick={closePerson}
                    >
                        <X size={20} />
                    </Button>
                    {profileLoading ? (
                        "正在载入成员资料…"
                    ) : (
                        <ErrorBox error={personError} />
                    )}
                </div>
            )}
            {person && (
                <Profile
                    person={person}
                    data={{ ...data, documents: links.documents }}
                    onClose={closePerson}
                    onEdit={() => editPerson(person)}
                    onAvatar={() => setAvatar(true)}
                    onAccount={account}
                    onLocate={(id) => {
                        selectUnit(id);
                        setView("chart");
                    }}
                />
            )}
            {editor && data && (
                <FormDialog
                    key={editor.kind + editor.id}
                    title={editor.title}
                    initial={editor.value}
                    onClose={() => setEditor(null)}
                    onSave={saved}
                    wide={editor.kind === "person"}
                    label={editor.kind === "owner" ? "确认转交" : "保存"}
                >
                    {(v, set) =>
                        editor.kind === "unit" ? (
                            <UnitFields
                                v={v}
                                set={set}
                                data={data}
                                id={editor.id}
                            />
                        ) : editor.kind === "person" ? (
                            <PersonFields v={v} set={set} data={data} />
                        ) : editor.kind === "position" ? (
                            <>
                                <Field label="岗位名称">
                                    <input
                                        autoFocus
                                        required
                                        maxLength={80}
                                        value={v.name}
                                        onChange={(e) =>
                                            set({ ...v, name: e.target.value })
                                        }
                                    />
                                </Field>
                                <Field label="岗位说明">
                                    <textarea
                                        maxLength={2000}
                                        value={v.description || ""}
                                        onChange={(e) =>
                                            set({
                                                ...v,
                                                description: e.target.value,
                                            })
                                        }
                                    />
                                </Field>
                                <label className="org-inline">
                                    <input
                                        type="checkbox"
                                        checked={v.enabled}
                                        onChange={(e) =>
                                            set({
                                                ...v,
                                                enabled: e.target.checked,
                                            })
                                        }
                                    />
                                    启用岗位
                                </label>
                            </>
                        ) : config ? (
                            <PermissionFields
                                editor={editor}
                                v={v}
                                set={set}
                                data={data}
                                config={config}
                            />
                        ) : null
                    }
                </FormDialog>
            )}
            {avatar && person && (
                <AvatarEditor
                    person={person}
                    api={api}
                    onSaved={load}
                    onClose={() => setAvatar(false)}
                />
            )}
        </div>
    );
}
