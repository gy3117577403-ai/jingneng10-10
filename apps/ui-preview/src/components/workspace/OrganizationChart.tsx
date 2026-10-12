import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type EdgeProps,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "reactflow"
import {
  ChevronDown,
  ChevronRight,
  LocateFixed,
  Maximize,
  Minus,
  Plus,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PersonAvatar, UnitIcon } from "./shared"
import {
  activeBranchPath,
  branchPath,
  layoutOrganization,
  membersIn,
  NODE_WIDTH,
  type Branch,
  type LayoutNode,
} from "@/lib/organization"
import { kindNames, type Member, type Unit } from "@/data/demo"
import "reactflow/dist/style.css"

type NodeData = {
  item: LayoutNode
  unit: Unit
  member?: Member
  count: number
  directCount: number
  selected: boolean
  open: boolean
  expandable: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onPerson: (id: string) => void
  onMembers: (id: string) => void
}
const OrganizationNode = memo(function OrganizationNode({
  data,
}: NodeProps<NodeData>) {
  const { item, unit, member, selected, open, expandable } = data
  return (
    <>
      <Handle type="target" position={Position.Left} />
      {item.kind === "unit" ? (
        <div
          className={`organization-node ${selected ? "selected" : ""}`}
          data-testid={`org-node-${unit.id}`}
        >
          <button
            className="node-body nodrag nopan"
            aria-label={`查看组织 ${unit.name}`}
            aria-pressed={selected}
            onClick={() => data.onSelect(unit.id)}
          >
            <UnitIcon kind={unit.kind} />
            <span className="node-copy">
              <strong title={unit.name}>{unit.name}</strong>
              <small>
                {kindNames[unit.kind]}
                <span className="meta-divider" />
                {data.count} 位成员
              </small>
            </span>
          </button>
          {expandable && (
            <button
              className="node-expand nodrag nopan"
              aria-label={`${open ? "收起" : "展开"} ${unit.name}`}
              aria-expanded={open}
              onClick={() => data.onToggle(unit.id)}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
        </div>
      ) : item.kind === "person" && member ? (
        <button
          className="person-node"
          aria-label={`查看成员 ${member.name}`}
          onClick={() => data.onPerson(member.id)}
        >
          <PersonAvatar name={member.name} />
          <span>
            <strong>{member.name}</strong>
            <small>{member.title || "岗位待补充"}</small>
          </span>
          {member.review === "pending" && <i title="资料待核对" />}
        </button>
      ) : (
        <button className="more-node" onClick={() => data.onMembers(unit.id)}>
          <Users size={15} />
          查看全部 {item.count} 位成员
          <ChevronRight size={14} />
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </>
  )
})
const SharedBranch = memo(function SharedBranch({ data }: EdgeProps<Branch>) {
  if (!data) return null
  return (
    <g data-testid={data.id} className="shared-branch">
      <path d={branchPath(data)} className="branch-line" />
      {activeBranchPath(data) && (
        <path d={activeBranchPath(data)} className="branch-line active" />
      )}
    </g>
  )
})
const nodeTypes = { organization: OrganizationNode }
const edgeTypes = { branch: SharedBranch }

export type ChartProps = {
  units: Unit[]
  members: Member[]
  rootId: string
  selectedId: string
  expanded: Set<string>
  showPeople: boolean
  inspectorOpen: boolean
  viewport: Viewport | null
  onViewport: (viewport: Viewport) => void
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onPerson: (id: string) => void
  onMembers: (id: string) => void
  fitSignal: number
}
export function OrganizationChart(props: ChartProps) {
  const {
    units,
    members,
    rootId,
    selectedId,
    expanded,
    showPeople,
    inspectorOpen,
    viewport,
    onViewport,
    onSelect,
    onToggle,
    onPerson,
    onMembers,
    fitSignal,
  } = props
  const flow = useRef<ReactFlowInstance | null>(null),
    container = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(viewport?.zoom || 1)
  // React Flow 11's onMoveEnd only fires for pointer/scroll gestures.
  // onMove also observes programmatic zoom/fit, keeping the label and saved view exact.
  const syncViewport = useCallback(
    (_: unknown, next: Viewport) => {
      setZoom(next.zoom)
      onViewport(next)
    },
    [onViewport]
  )
  const layout = useMemo(
    () =>
      layoutOrganization(
        units,
        members,
        rootId,
        expanded,
        showPeople,
        selectedId
      ),
    [units, members, rootId, expanded, showPeople, selectedId]
  )
  const nodes = useMemo(
    () =>
      layout.nodes.map((item) => {
        const unit = units.find((u) => u.id === item.unitId)!
        return {
          id: item.id,
          type: "organization",
          position: { x: item.x, y: item.y },
          style: {
            width: NODE_WIDTH,
            height: item.height,
            pointerEvents: "all" as const,
          },
          draggable: false,
          data: {
            item,
            unit,
            member: members.find((p) => p.id === item.personId),
            count: membersIn(units, members, unit.id).length,
            directCount: membersIn(units, members, unit.id, false).length,
            selected: selectedId === unit.id,
            open: expanded.has(unit.id),
            expandable:
              units.some((u) => u.parentId === unit.id) ||
              (showPeople &&
                selectedId === unit.id &&
                membersIn(units, members, unit.id, false).length > 0),
            onSelect,
            onToggle,
            onPerson,
            onMembers,
          },
        }
      }),
    [
      layout,
      units,
      members,
      selectedId,
      expanded,
      showPeople,
      onSelect,
      onToggle,
      onPerson,
      onMembers,
    ]
  )
  const edges = useMemo(
    () =>
      layout.branches.map((branch) => ({
        id: branch.id,
        source: branch.source,
        target: branch.target,
        type: "branch",
        data: branch,
      })),
    [layout]
  )
  const latestLayout = useRef(layout)
  useEffect(() => {
    latestLayout.current = layout
  }, [layout])
  const fitLayout = useCallback(() => {
    const wrapper = container.current,
      instance = flow.current
    const visible = latestLayout.current.nodes
    if (!wrapper || !instance || !visible.length) return
    const left = Math.min(...visible.map((node) => node.x))
    const top = Math.min(...visible.map((node) => node.y))
    const width = Math.max(...visible.map((node) => node.x + NODE_WIDTH)) - left
    const height =
      Math.max(...visible.map((node) => node.y + node.height)) - top
    // Use the new layout directly; React Flow's measured nodes can lag one frame
    // after expanding members. Reserve room for the heading and canvas controls.
    const scale = Math.min(
      1,
      Math.max(
        0.25,
        Math.min(
          (wrapper.clientWidth - 64) / width,
          (wrapper.clientHeight - 164) / height
        )
      )
    )
    instance.setViewport(
      {
        x: (wrapper.clientWidth - width * scale) / 2 - left * scale,
        y:
          108 + (wrapper.clientHeight - 164 - height * scale) / 2 - top * scale,
        zoom: scale,
      },
      { duration: 0 }
    )
  }, [])
  useEffect(() => {
    if (!fitSignal) return
    const timer = requestAnimationFrame(fitLayout)
    return () => cancelAnimationFrame(timer)
  }, [fitSignal, fitLayout])
  useEffect(() => {
    // Keep scale and pan stable. Only nudge the selected card if a panel hides it.
    const frame = requestAnimationFrame(() => {
      const instance = flow.current,
        wrapper = container.current
      const node = latestLayout.current.nodes.find((n) => n.id === selectedId)
      if (!instance || !wrapper || !node || !inspectorOpen) return
      const v = instance.getViewport(),
        left = node.x * v.zoom + v.x,
        right = (node.x + NODE_WIDTH) * v.zoom + v.x
      const delta =
        right > wrapper.clientWidth - 24
          ? wrapper.clientWidth - 24 - right
          : left < 24
            ? 24 - left
            : 0
      if (delta) instance.setViewport({ ...v, x: v.x + delta }, { duration: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId, inspectorOpen])
  const root = units.find((u) => u.id === rootId)!
  return (
    <div className="chart-canvas" ref={container} aria-label="组织架构画布">
      <div className="canvas-heading">
        <span>组织关系</span>
        <strong>{root.name}</strong>
        <p>
          {layout.nodes.filter((n) => n.kind === "unit").length} 个组织
          <span>·</span>
          {membersIn(units, members, rootId).length} 位成员
        </p>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          flow.current = instance
        }}
        defaultViewport={viewport || { x: 0, y: 0, zoom: 1 }}
        fitView={!viewport}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        onMove={syncViewport}
        minZoom={0.25}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#dce1e7"
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.7}
        />
      </ReactFlow>
      <div className="canvas-footer">
        <span className="canvas-hint">
          拖动画布浏览<span>·</span>点击节点查看详情
        </span>
        <div className="canvas-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label="定位当前组织"
            onClick={() => {
              const node = layout.nodes.find((n) => n.id === selectedId)
              if (node)
                flow.current?.setCenter(
                  node.x + NODE_WIDTH / 2,
                  node.y + node.height / 2,
                  { zoom, duration: 0 }
                )
            }}
          >
            <LocateFixed />
          </Button>
          <span className="control-divider" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="缩小架构图"
            onClick={() => flow.current?.zoomOut()}
          >
            <Minus />
          </Button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大架构图"
            onClick={() => flow.current?.zoomIn()}
          >
            <Plus />
          </Button>
          <span className="control-divider" />
          <Button variant="ghost" size="sm" onClick={fitLayout}>
            <Maximize />
            适应视图
          </Button>
        </div>
      </div>
    </div>
  )
}
