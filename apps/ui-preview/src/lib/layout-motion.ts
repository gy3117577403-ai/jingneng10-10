import { NODE_WIDTH, type Branch, type LayoutNode } from "./organization"

export type MotionNode = LayoutNode & { opacity?: number; leaving?: boolean }
export type MotionBranch = Branch & { opacity?: number }
export type MotionLayout = { nodes: MotionNode[]; branches: MotionBranch[] }

/** A single frame drives cards and every connector anchor, including interrupted folds. */
export function interpolateLayout(
  from: MotionLayout,
  to: MotionLayout,
  progress: number
): MotionLayout {
  const t = Math.min(1, Math.max(0, progress))
  if (t === 1) return to
  const oldNodes = new Map(from.nodes.map((node) => [node.id, node]))
  const nextNodes = new Map(to.nodes.map((node) => [node.id, node]))
  const parents = new Map<string, string>()
  for (const branch of [...from.branches, ...to.branches])
    for (const target of branch.targets) parents.set(target.id, branch.source)
  const mix = (a: number, b: number) => a + (b - a) * t
  function folded(
    node: MotionNode,
    lookup: Map<string, MotionNode>
  ): MotionNode {
    const parentId = parents.get(node.id)
    const parent =
      parentId &&
      (lookup.get(parentId) ||
        nextNodes.get(parentId) ||
        oldNodes.get(parentId))
    return {
      ...node,
      x: parent ? parent.x + NODE_WIDTH + 12 : node.x - 20,
      y: parent ? parent.y + (parent.height - node.height) / 2 : node.y,
      opacity: 0,
    }
  }
  const ids = new Set([...oldNodes.keys(), ...nextNodes.keys()])
  const nodes = [...ids].map((id) => {
    const old = oldNodes.get(id),
      next = nextNodes.get(id)
    const start = old || folded(next!, oldNodes)
    const end = next || folded(old!, nextNodes)
    return {
      ...end,
      x: mix(start.x, end.x),
      y: mix(start.y, end.y),
      opacity: mix(start.opacity ?? 1, end.opacity ?? 1),
      leaving: !next,
    }
  })
  const live = new Map(nodes.map((node) => [node.id, node]))
  const oldBranches = new Map(
    from.branches.map((branch) => [branch.id, branch])
  )
  const nextBranches = new Map(to.branches.map((branch) => [branch.id, branch]))
  const branches = [
    ...new Set([...oldBranches.keys(), ...nextBranches.keys()]),
  ].map((id) => {
    const old = oldBranches.get(id),
      next = nextBranches.get(id),
      branch = next || old!
    const source = live.get(branch.source)!
    const targetsById = new Map(
      [...(old?.targets || []), ...(next?.targets || [])].map((p) => [p.id, p])
    )
    const targets = [...targetsById.values()].map((point) => {
      const node = live.get(point.id)!
      return { ...point, x: node.x, y: node.y + node.height / 2 }
    })
    return {
      ...branch,
      start: { x: source.x + NODE_WIDTH, y: source.y + source.height / 2 },
      trunkX:
        (source.x + NODE_WIDTH + Math.min(...targets.map((p) => p.x))) / 2,
      targets,
      opacity: mix(old?.opacity ?? (old ? 1 : 0), next ? 1 : 0),
    }
  })
  return { nodes, branches }
}
