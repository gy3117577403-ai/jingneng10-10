import { useState, type FormEvent } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FilePenLine,
  Mail,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Pick, PersonAvatar, ReviewStatus, UnitIcon } from "./shared"
import { kindNames, type Member, type Unit } from "@/data/demo"
import { membersIn, unitPath, validateMember } from "@/lib/organization"

type SaveMember = (member: Member) => string | null
function MemberFields({
  value,
  set,
  units,
}: {
  value: Member
  set: (value: Member) => void
  units: Unit[]
}) {
  return (
    <div className="field-grid">
      <div>
        <Label htmlFor="member-name">
          姓名 <span className="required">*</span>
        </Label>
        <Input
          id="member-name"
          value={value.name}
          maxLength={24}
          onChange={(e) => set({ ...value, name: e.target.value })}
          placeholder="填写成员姓名"
        />
      </div>
      <div>
        <Label htmlFor="member-code">演示编号</Label>
        <Input
          id="member-code"
          value={value.code}
          maxLength={30}
          onChange={(e) => set({ ...value, code: e.target.value })}
        />
      </div>
      <div className="full">
        <Label>主要组织</Label>
        <Pick
          label="成员主要组织"
          value={value.unitId}
          onChange={(unitId) => set({ ...value, unitId })}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
        />
      </div>
      <div className="full">
        <Label htmlFor="member-title">岗位</Label>
        <Input
          id="member-title"
          value={value.title}
          maxLength={40}
          placeholder="填写岗位名称"
          onChange={(e) => set({ ...value, title: e.target.value })}
        />
      </div>
      <div>
        <Label>资料核对</Label>
        <Pick
          label="编辑资料核对状态"
          value={value.review}
          onChange={(review) =>
            set({ ...value, review: review as Member["review"] })
          }
          options={[
            { value: "pending", label: "待核对" },
            { value: "verified", label: "已核对" },
          ]}
        />
      </div>
      <div>
        <Label>账号状态</Label>
        <Pick
          label="编辑演示账号状态"
          value={value.account}
          onChange={(account) =>
            set({ ...value, account: account as Member["account"] })
          }
          options={[
            { value: "none", label: "未开通" },
            { value: "active", label: "已开通" },
          ]}
        />
      </div>
      <div className="full">
        <Label htmlFor="member-email">演示邮箱</Label>
        <Input
          id="member-email"
          type="email"
          value={value.email}
          onChange={(e) => set({ ...value, email: e.target.value })}
        />
      </div>
      <div className="full">
        <Label htmlFor="member-notes">备注</Label>
        <Textarea
          id="member-notes"
          rows={3}
          maxLength={500}
          value={value.notes}
          placeholder="补充需要协同的信息…"
          onChange={(e) => set({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
export function MemberDetails({
  member,
  units,
  editInitially = false,
  onClose,
  onBack,
  onLocate,
  onSave,
  onDirty,
}: {
  member: Member
  units: Unit[]
  editInitially?: boolean
  onClose: () => void
  onBack?: () => void
  onLocate: (id: string) => void
  onSave: SaveMember
  onDirty: (dirty: boolean) => void
}) {
  const [tab, setTab] = useState("profile"),
    [editing, setEditing] = useState(editInitially),
    [draft, setDraft] = useState(member),
    [error, setError] = useState("")
  const primary = units.find((u) => u.id === member.unitId)!
  function change(next: Member) {
    setDraft(next)
    setError("")
    onDirty(JSON.stringify(next) !== JSON.stringify(member))
  }
  function save(event: FormEvent) {
    event.preventDefault()
    const invalid = validateMember(draft)
    if (invalid) {
      setError(invalid)
      return
    }
    const failure = onSave({
      ...draft,
      name: draft.name.trim(),
      title: draft.title.trim(),
    })
    if (failure) {
      setError(failure)
      return
    }
    onDirty(false)
    setEditing(false)
  }
  function cancel() {
    setEditing(false)
    setDraft(member)
    setError("")
    onDirty(false)
  }
  return (
    <aside className="detail-panel" aria-label={`成员详情 ${member.name}`}>
      <div className="detail-top">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} />
            组织详情
          </Button>
        ) : (
          <span>成员详情</span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="关闭详情面板"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="person-heading">
        <PersonAvatar name={member.name} large />
        <div>
          <h2>{member.name}</h2>
          <span>
            {member.title || "岗位待补充"}
            <span className="inline-dot">·</span>
            {member.code}
          </span>
        </div>
      </div>
      <div className="person-badges">
        <ReviewStatus member={member} />
        <Badge variant="secondary">
          {member.employment === "active" ? "在职" : "已停用"}
        </Badge>
      </div>
      {editing ? (
        <form className="detail-form" onSubmit={save}>
          <div className="form-intro">
            <FilePenLine size={15} />
            <strong>编辑成员资料</strong>
            <Button type="button" variant="ghost" size="xs" onClick={cancel}>
              取消编辑
            </Button>
          </div>
          <MemberFields value={draft} set={change} units={units} />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="edit-footer">
            <span>仅保存到本地演示</span>
            <Button type="submit">
              <Check size={14} />
              保存修改
            </Button>
          </div>
        </form>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(String(v))}
          className="details-tabs"
        >
          <TabsList variant="line" aria-label="成员详情分类">
            <TabsTrigger value="profile">资料</TabsTrigger>
            <TabsTrigger value="assignments">任职</TabsTrigger>
            <TabsTrigger value="account">账号</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <div className="detail-section">
              <div className="section-label">
                <h3>基本资料</h3>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setDraft(member)
                    setEditing(true)
                  }}
                >
                  <FilePenLine size={13} />
                  编辑
                </Button>
              </div>
              <dl className="detail-facts">
                <div>
                  <dt>姓名</dt>
                  <dd>{member.name}</dd>
                </div>
                <div>
                  <dt>成员编号</dt>
                  <dd className="tabular-nums">{member.code}</dd>
                </div>
                <div>
                  <dt>主要组织</dt>
                  <dd>
                    <button
                      className="inline-link"
                      onClick={() => onLocate(member.unitId)}
                    >
                      {primary.name}
                      <ArrowUpRight size={12} />
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>岗位</dt>
                  <dd>{member.title || "待补充"}</dd>
                </div>
                <div className="full">
                  <dt>演示邮箱</dt>
                  <dd>
                    <Mail size={13} />
                    {member.email || "未填写"}
                  </dd>
                </div>
                <div>
                  <dt>加入日期</dt>
                  <dd>{member.joined}</dd>
                </div>
                <div>
                  <dt>资料状态</dt>
                  <dd>{member.review === "verified" ? "已核对" : "待核对"}</dd>
                </div>
              </dl>
            </div>
            {member.review === "pending" && (
              <div className="review-note">
                <CircleHelp size={16} />
                <div>
                  <strong>这份资料需要核对</strong>
                  <p>核对姓名、组织与岗位后，再处理账号开通。</p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setDraft(member)
                      setEditing(true)
                    }}
                  >
                    核对资料
                    <ChevronRight size={12} />
                  </Button>
                </div>
              </div>
            )}
            <div className="detail-section">
              <h3>备注</h3>
              <p className="muted-copy">
                {member.notes ||
                  "暂无备注。需要补充的信息可以在编辑资料中填写。"}
              </p>
            </div>
            <div className="detail-footer-note">此成员为虚构演示资料</div>
          </TabsContent>
          <TabsContent value="assignments">
            <div className="detail-section">
              <h3>组织与任职</h3>
              <div className="assignment-card">
                <UnitIcon kind={primary.kind} />
                <div>
                  <strong>
                    {primary.name}
                    <Badge variant="secondary">主职</Badge>
                  </strong>
                  <span>{member.title || "岗位待补充"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="定位主要组织"
                  onClick={() => onLocate(primary.id)}
                >
                  <ArrowUpRight />
                </Button>
              </div>
              {member.extraUnitId && (
                <div className="assignment-card">
                  <UnitIcon kind="project" />
                  <div>
                    <strong>
                      {units.find((u) => u.id === member.extraUnitId)?.name}
                      <Badge variant="secondary">兼任</Badge>
                    </strong>
                    <span>项目协作</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="定位兼任组织"
                    onClick={() => onLocate(member.extraUnitId!)}
                  >
                    <ArrowUpRight />
                  </Button>
                </div>
              )}
              <p className="muted-copy">
                组织任职用于说明协作关系，系统权限单独管理。
              </p>
            </div>
          </TabsContent>
          <TabsContent value="account">
            <div className="detail-section">
              <h3>账号状态</h3>
              <div className="account-card">
                <ShieldCheck size={21} />
                <div>
                  <strong>
                    {member.account === "active"
                      ? "演示账号已开通"
                      : "尚未开通账号"}
                  </strong>
                  <p>
                    {member.review === "pending"
                      ? "请先核对成员资料。"
                      : "预览只演示账号状态，不创建真实登录账号。"}
                  </p>
                </div>
              </div>
              <dl className="detail-facts">
                <div>
                  <dt>身份核对</dt>
                  <dd>{member.review === "verified" ? "已完成" : "待完成"}</dd>
                </div>
                <div>
                  <dt>权限范围</dt>
                  <dd>未配置实际权限</dd>
                </div>
              </dl>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(member)
                  setEditing(true)
                }}
              >
                编辑演示状态
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </aside>
  )
}
export function UnitDetails({
  unit,
  units,
  members,
  onClose,
  onPerson,
  onSelect,
  onMembers,
  onAdd,
  onEdit,
}: {
  unit: Unit
  units: Unit[]
  members: Member[]
  onClose: () => void
  onPerson: (id: string) => void
  onSelect: (id: string) => void
  onMembers: () => void
  onAdd: () => void
  onEdit: () => void
}) {
  const direct = membersIn(units, members, unit.id, false),
    children = units.filter((u) => u.parentId === unit.id)
  return (
    <aside className="detail-panel" aria-label={`组织详情 ${unit.name}`}>
      <div className="detail-top">
        <span>组织详情</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="关闭详情面板"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="unit-heading">
        <UnitIcon kind={unit.kind} />
        <h2>{unit.name}</h2>
        <Badge variant="secondary">{kindNames[unit.kind]}</Badge>
      </div>
      <p className="unit-description">
        {unit.description || "暂未填写组织说明。"}
      </p>
      <div className="unit-actions">
        <Button variant="outline" onClick={onAdd}>
          <Plus size={14} />
          添加成员
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          <FilePenLine size={14} />
          编辑
        </Button>
      </div>
      <div className="detail-section">
        <h3>组织信息</h3>
        <dl className="detail-facts">
          <div>
            <dt>负责人</dt>
            <dd>{unit.manager || "待设置"}</dd>
          </div>
          <div>
            <dt>成员范围</dt>
            <dd>{membersIn(units, members, unit.id).length} 位，含下级</dd>
          </div>
          <div className="full">
            <dt>组织路径</dt>
            <dd className="path-text">
              {unitPath(units, unit.id)
                .map((u) => u.name)
                .join(" / ")}
            </dd>
          </div>
        </dl>
      </div>
      {children.length > 0 && (
        <div className="detail-section">
          <div className="section-label">
            <h3>下级组织</h3>
            <span>{children.length}</span>
          </div>
          <div className="detail-list">
            {children.map((child) => (
              <button key={child.id} onClick={() => onSelect(child.id)}>
                <UnitIcon kind={child.kind} />
                <span>{child.name}</span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="detail-section">
        <div className="section-label">
          <h3>直属成员</h3>
          <span>{direct.length}</span>
        </div>
        {direct.length ? (
          <div className="detail-list">
            {direct.map((person) => (
              <button key={person.id} onClick={() => onPerson(person.id)}>
                <PersonAvatar name={person.name} />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.title || "岗位待补充"}</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted-copy">暂无直属成员，成员可能属于下级组织。</p>
        )}
        <Button variant="ghost" className="all-members" onClick={onMembers}>
          查看此范围全部成员
          <ChevronRight size={14} />
        </Button>
      </div>
    </aside>
  )
}
export function NewMemberDialog({
  units,
  scope,
  onClose,
  onSave,
}: {
  units: Unit[]
  scope: string
  onClose: () => void
  onSave: SaveMember
}) {
  const [draft, setDraft] = useState<Member>({
      id: `demo-${crypto.randomUUID()}`,
      name: "",
      unitId: scope,
      title: "",
      code: "DEMO-NEW",
      review: "pending",
      account: "none",
      employment: "active",
      email: "",
      notes: "",
      joined: "2026-10-12",
    }),
    [error, setError] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="member-dialog">
        <DialogHeader>
          <DialogTitle>新增成员</DialogTitle>
          <DialogDescription>
            添加一位虚构演示成员，保存后可以在列表与组织图中查看。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const invalid = validateMember(draft)
            if (invalid) {
              setError(invalid)
              return
            }
            const failure = onSave({ ...draft, name: draft.name.trim() })
            if (failure) setError(failure)
            else onClose()
          }}
        >
          <MemberFields value={draft} set={setDraft} units={units} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">添加成员</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export function UnitDialog({
  units,
  initial,
  scope,
  onClose,
  onSave,
}: {
  units: Unit[]
  initial?: Unit
  scope: string
  onClose: () => void
  onSave: (unit: Unit) => string | null
}) {
  const [draft, setDraft] = useState<Unit>(
      initial || {
        id: `org-${crypto.randomUUID()}`,
        parentId: scope,
        name: "",
        kind: "team",
        manager: "",
        description: "",
      }
    ),
    [error, setError] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "编辑组织" : "新增组织"}</DialogTitle>
          <DialogDescription>修改仅用于当前预览的演示组织。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const failure = onSave({ ...draft, name: draft.name.trim() })
            if (failure) setError(failure)
            else onClose()
          }}
        >
          <div className="field-grid">
            <div className="full">
              <Label htmlFor="unit-name">组织名称</Label>
              <Input
                id="unit-name"
                value={draft.name}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="填写组织名称"
              />
            </div>
            <div>
              <Label>组织类型</Label>
              <Pick
                label="组织类型"
                value={draft.kind}
                onChange={(kind) =>
                  setDraft({ ...draft, kind: kind as Unit["kind"] })
                }
                options={Object.entries(kindNames).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div>
              <Label htmlFor="unit-manager">负责人</Label>
              <Input
                id="unit-manager"
                value={draft.manager}
                maxLength={24}
                onChange={(e) =>
                  setDraft({ ...draft, manager: e.target.value })
                }
              />
            </div>
            {draft.parentId && (
              <div className="full">
                <Label>上级组织</Label>
                <Pick
                  label="上级组织"
                  value={draft.parentId}
                  onChange={(parentId) => setDraft({ ...draft, parentId })}
                  options={units
                    .filter(
                      (u) =>
                        !unitPath(units, u.id).some((p) => p.id === draft.id)
                    )
                    .map((u) => ({ value: u.id, label: u.name }))}
                />
              </div>
            )}
            <div className="full">
              <Label htmlFor="unit-description">组织说明</Label>
              <Textarea
                id="unit-description"
                rows={3}
                value={draft.description}
                maxLength={300}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">{initial ? "保存修改" : "创建组织"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
