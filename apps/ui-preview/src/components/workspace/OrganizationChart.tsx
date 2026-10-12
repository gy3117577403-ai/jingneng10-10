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
  type LayoutNode,
} from "@/lib/organization"
import { kindNames, type Member, type Unit } from "@/data/demo"
import "reactflow/dist/style.css"
import { useReducedMotion } from "motion/react"
import { useLayoutMotion } from "@/hooks/use-layout-motion"
import type { MotionBranch } from "@/lib/layout-motion"
import { frameOrganization, revealOrganization } from "@/lib/chart-viewport"

type NodeData = {
  item: LayoutNode
  unit: Unit
  member?: Member
  count: number
  directCount: number
  selected: boolean
  root: boolean
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
          data-root={data.root}
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
              <ChevronRight size={13} />
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
const SharedBranch = memo(function SharedBranch({
  data,
}: EdgeProps<MotionBranch>) {
  if (!data) return null
  return (
    <g
      data-testid={data.id}
      className="shared-branch"
      opacity={data.opacity ?? 1}
    >
      <path d={branchPath(data)} className="branch-line" />
      {activeBranchPath(data) && (
        <path
          key={data.targets
            .filter((point) => point.active)
            .map((point) => point.id)
            .join(":")}
          d={activeBranchPath(data)}
          pathLength={1}
          className="branch-line active"
        />
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
  const reduced = useReducedMotion()
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
  const animatedLayout = useLayoutMotion(layout, rootId)
  const nodes = useMemo(
    () =>
      animatedLayout.nodes.map((item) => {
        const unit = units.find((u) => u.id === item.unitId)!
        return {
          id: item.id,
          type: "organization",
          position: { x: item.x, y: item.y },
          // Controlled animation replaces node objects every frame. React Flow
          // 11 otherwise drops measured dimensions and hides nodes until its
          // ResizeObserver runs again. These cards have fixed known dimensions.
          width: NODE_WIDTH,
          height: item.height,
          style: {
            width: NODE_WIDTH,
            height: item.height,
            opacity: item.opacity ?? 1,
            pointerEvents: item.leaving ? ("none" as const) : ("all" as const),
          },
          draggable: false,
          data: {
            item,
            unit,
            member: members.find((p) => p.id === item.personId),
            count: membersIn(units, members, unit.id).length,
            directCount: membersIn(units, members, unit.id, false).length,
            selected: selectedId === unit.id,
            root: rootId === unit.id,
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
      animatedLayout,
      units,
      members,
      selectedId,
      rootId,
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
      animatedLayout.branches.map((branch) => ({
        id: branch.id,
        source: branch.source,
        target: branch.target,
        type: "branch",
        data: branch,
      })),
    [animatedLayout]
  )
  const latestLayout = useRef(layout)
  const selectedRef = useRef(selectedId)
  useEffect(() => {
    latestLayout.current = layout
    selectedRef.current = selectedId
  }, [layout, selectedId])
  const canvasFrame = useCallback(() => {
    const wrapper = container.current
    if (!wrapper) return null
    const panel = wrapper
      .closest(".work-area")
      ?.querySelector<HTMLElement>(".detail-panel")
    // At narrow desktop widths the inspector overlays the work area. Reserve
    // its actual width rather than measuring its animated entrance position.
    const covered =
      panel && getComputedStyle(panel).position === "absolute"
        ? panel.offsetWidth
        : 0
    return {
      width: wrapper.clientWidth - covered,
      height: wrapper.clientHeight,
    }
  }, [])
  const fitLayout = useCallback(
    (minimumZoom = 0.25) => {
      const frame = canvasFrame(),
        instance = flow.current
      if (!frame || !instance || frame.width < 220) return
      instance.setViewport(
        frameOrganization(
          latestLayout.current.nodes,
          frame,
          selectedRef.current,
          minimumZoom
        ),
        { duration: reduced ? 0 : 280 }
      )
    },
    [canvasFrame, reduced]
  )
  useEffect(() => {
    if (!fitSignal) return
    const timer = requestAnimationFrame(() => fitLayout(0.86))
    return () => cancelAnimationFrame(timer)
  }, [fitSignal, fitLayout])
  const previousScope = useRef({ rootId, layout, fitSignal })
  useEffect(() => {
    const previous = previousScope.current
    previousScope.current = { rootId, layout, fitSignal }
    if (previous.rootId !== rootId || previous.fitSignal !== fitSignal) return
    const oldIds = new Set(previous.layout.nodes.map((node) => node.id))
    const added = layout.nodes.filter((node) => !oldIds.has(node.id))
    if (!added.length) return
    const frame = requestAnimationFrame(() => {
      const wrapper = container.current,
        instance = flow.current
      if (!wrapper || !instance) return
      const v = instance.getViewport(),
        frame = canvasFrame()
      if (!frame || frame.width < 220) return
      // Preserve the current view when the new branch fits. Reveal the full
      // layout only when expanding would leave its result outside the canvas.
      if (
        added.some(
          (node) =>
            node.x * v.zoom + v.x < 24 ||
            (node.x + NODE_WIDTH) * v.zoom + v.x > frame.width - 24 ||
            node.y * v.zoom + v.y < 96 ||
            (node.y + node.height) * v.zoom + v.y > frame.height - 56
        )
      )
        fitLayout(0.86)
    })
    return () => cancelAnimationFrame(frame)
  }, [layout, rootId, fitSignal, fitLayout, canvasFrame])
  useEffect(() => {
    let scheduled = 0
    const reveal = () => {
      cancelAnimationFrame(scheduled)
      scheduled = requestAnimationFrame(() => {
        const instance = flow.current,
          frame = canvasFrame()
        const node = latestLayout.current.nodes.find(
          (n) => n.id === selectedRef.current
        )
        if (!instance || !frame || !node || frame.width < 220) return
        const current = instance.getViewport()
        const next = revealOrganization(node, frame, current)
        if (next.x !== current.x || next.y !== current.y)
          instance.setViewport(next, { duration: reduced ? 0 : 260 })
      })
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    if (container.current) observer.observe(container.current)
    return () => {
      cancelAnimationFrame(scheduled)
      observer.disconnect()
    }
  }, [selectedId, inspectorOpen, canvasFrame, reduced])
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
          if (!viewport) requestAnimationFrame(() => fitLayout(0.86))
        }}
        defaultViewport={viewport || { x: 0, y: 0, zoom: 1 }}
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
          color="#cdd6e3"
          variant={BackgroundVariant.Dots}
          gap={24}
          size={0.65}
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
                  { zoom, duration: reduced ? 0 : 340 }
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
            onClick={() =>
              flow.current?.zoomOut({ duration: reduced ? 0 : 220 })
            }
          >
            <Minus />
          </Button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大架构图"
            onClick={() =>
              flow.current?.zoomIn({ duration: reduced ? 0 : 220 })
            }
          >
            <Plus />
          </Button>
          <span className="control-divider" />
          <Button variant="ghost" size="sm" onClick={() => fitLayout()}>
            <Maximize />
            适应视图
          </Button>
        </div>
      </div>
    </div>
  )
}
