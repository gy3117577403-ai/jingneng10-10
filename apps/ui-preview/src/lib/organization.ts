import type { Member, Unit } from "@/data/demo"

export function unitPath(units: Unit[], id: string): Unit[] {
  const path: Unit[] = [],
    seen = new Set<string>()
  let current = units.find((u) => u.id === id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = units.find((u) => u.id === current?.parentId)
  }
  return path
}
export function belongsTo(
  units: Unit[],
  unitId: string,
  scope: string,
  descendants = true
) {
  return (
    unitId === scope ||
    (descendants && unitPath(units, unitId).some((u) => u.id === scope))
  )
}
export function membersIn(
  units: Unit[],
  members: Member[],
  scope: string,
  descendants = true
) {
  return members.filter(
    (m) =>
      belongsTo(units, m.unitId, scope, descendants) ||
      (m.extraUnitId && belongsTo(units, m.extraUnitId, scope, descendants))
  )
}
export type Filters = {
  query: string
  review: string
  account: string
  descendants: boolean
}
export function filterMembers(
  units: Unit[],
  members: Member[],
  scope: string,
  filters: Filters
) {
  const query = filters.query.trim().toLocaleLowerCase()
  return membersIn(units, members, scope, filters.descendants).filter(
    (m) =>
      (filters.review === "all" ||
        (filters.review === "missing"
          ? !m.title
          : m.review === filters.review)) &&
      (filters.account === "all" || m.account === filters.account) &&
      (!query ||
        [m.name, m.code, m.title, units.find((u) => u.id === m.unitId)?.name]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query))
  )
}

export const NODE_WIDTH = 196,
  NODE_HEIGHT = 72,
  PERSON_HEIGHT = 56,
  COLUMN_GAP = 72,
  ROW_GAP = 24
export type Point = { x: number; y: number }
export type LayoutNode = {
  id: string
  kind: "unit" | "person" | "more"
  unitId: string
  personId?: string
  x: number
  y: number
  height: number
  count?: number
}
export type Branch = {
  id: string
  source: string
  target: string
  start: Point
  trunkX: number
  targets: (Point & { id: string; active: boolean })[]
}
type Tree = {
  id: string
  unitId: string
  kind: LayoutNode["kind"]
  personId?: string
  count?: number
  children: Tree[]
  height: number
  ownHeight: number
}

/** Each parent owns a single shared trunk. Selection never changes geometry. */
export function layoutOrganization(
  units: Unit[],
  members: Member[],
  rootId: string,
  expanded: Set<string>,
  showPeople: boolean,
  selected: string
) {
  const root = units.find((u) => u.id === rootId)
  if (!root) return { nodes: [] as LayoutNode[], branches: [] as Branch[] }
  const active = new Set(unitPath(units, selected).map((u) => u.id))
  function tree(unit: Unit, seen = new Set<string>()): Tree {
    const nextSeen = new Set([...seen, unit.id])
    const children: Tree[] = expanded.has(unit.id)
      ? units
          .filter((u) => u.parentId === unit.id && !nextSeen.has(u.id))
          .map((u) => tree(u, nextSeen))
      : []
    if (showPeople && expanded.has(unit.id) && unit.id === selected) {
      const direct = membersIn(units, members, unit.id, false)
      for (const person of direct.slice(0, 4))
        children.push({
          id: `${unit.id}:${person.id}`,
          unitId: unit.id,
          personId: person.id,
          kind: "person",
          children: [],
          ownHeight: PERSON_HEIGHT,
          height: PERSON_HEIGHT,
        })
      if (direct.length > 4)
        children.push({
          id: `${unit.id}:more`,
          unitId: unit.id,
          kind: "more",
          count: direct.length,
          children: [],
          ownHeight: PERSON_HEIGHT,
          height: PERSON_HEIGHT,
        })
    }
    return {
      id: unit.id,
      unitId: unit.id,
      kind: "unit",
      children,
      ownHeight: NODE_HEIGHT,
      height: Math.max(
        NODE_HEIGHT,
        children.reduce((sum, c) => sum + c.height, 0) +
          Math.max(0, children.length - 1) * ROW_GAP
      ),
    }
  }
  const nodes: LayoutNode[] = [],
    branches: Branch[] = []
  function place(item: Tree, depth: number, top: number): LayoutNode {
    const node: LayoutNode = {
      id: item.id,
      unitId: item.unitId,
      personId: item.personId,
      kind: item.kind,
      count: item.count,
      x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: top + (item.height - item.ownHeight) / 2,
      height: item.ownHeight,
    }
    nodes.push(node)
    let childTop = top
    const childNodes = item.children.map((child) => {
      const result = place(child, depth + 1, childTop)
      childTop += child.height + ROW_GAP
      return result
    })
    if (childNodes.length)
      branches.push({
        id: `branch:${item.id}`,
        source: item.id,
        target: childNodes[0].id,
        start: { x: node.x + NODE_WIDTH, y: node.y + node.height / 2 },
        trunkX: node.x + NODE_WIDTH + COLUMN_GAP / 2,
        targets: childNodes.map((child) => ({
          x: child.x,
          y: child.y + child.height / 2,
          id: child.id,
          active: child.kind === "unit" && active.has(child.unitId),
        })),
      })
    return node
  }
  place(tree(root), 0, 0)
  return { nodes, branches }
}
export function branchPath(branch: Branch) {
  const { start, trunkX, targets } = branch
  const ys = [start.y, ...targets.map((t) => t.y)]
  return (
    `M ${start.x} ${start.y} H ${trunkX} M ${trunkX} ${Math.min(...ys)} V ${Math.max(...ys)} ` +
    targets.map((t) => `M ${trunkX} ${t.y} H ${t.x}`).join(" ")
  )
}
export function activeBranchPath(branch: Branch) {
  return branch.targets
    .filter((t) => t.active)
    .map(
      (t) =>
        `M ${branch.start.x} ${branch.start.y} H ${branch.trunkX} V ${t.y} H ${t.x}`
    )
    .join(" ")
}

export function validateMember(
  member: Pick<Member, "name" | "title" | "review" | "account">
) {
  if (!member.name.trim()) return "请填写成员姓名。"
  if (member.review === "verified" && !member.title.trim())
    return "请先补充岗位，再将资料标为已核对。"
  if (member.review !== "verified" && member.account === "active")
    return "请先核对资料，再启用演示账号。"
  return ""
}
