import { NODE_WIDTH, type LayoutNode } from "./organization"

export type CanvasFrame = { width: number; height: number }
export type ChartViewport = { x: number; y: number; zoom: number }

const SIDE = 28
const TOP = 108
const BOTTOM = 68

/** Fit explicitly when requested; automatic framing keeps labels readable. */
export function frameOrganization(
  nodes: LayoutNode[],
  frame: CanvasFrame,
  selectedId: string,
  minimumZoom = 0.25
): ChartViewport {
  if (!nodes.length) return { x: SIDE, y: TOP, zoom: 1 }
  const left = Math.min(...nodes.map((node) => node.x))
  const top = Math.min(...nodes.map((node) => node.y))
  const width = Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) - left
  const height = Math.max(...nodes.map((node) => node.y + node.height)) - top
  const usableWidth = Math.max(1, frame.width - SIDE * 2)
  const usableHeight = Math.max(1, frame.height - TOP - BOTTOM)
  const zoom = Math.min(
    1,
    Math.max(minimumZoom, Math.min(usableWidth / width, usableHeight / height))
  )
  const viewport = {
    x: (frame.width - width * zoom) / 2 - left * zoom,
    y: TOP + (usableHeight - height * zoom) * 0.42 - top * zoom,
    zoom,
  }
  const selected = nodes.find((node) => node.id === selectedId)
  if (!selected || minimumZoom <= 0.25) return viewport
  const people = nodes.filter(
    (node) => node.kind !== "unit" && node.unitId === selected.unitId
  )
  const focal = [selected, ...people]
  const focalWidth =
    Math.max(...focal.map((node) => node.x + NODE_WIDTH)) - selected.x
  let revealed = viewport
  if (focalWidth * zoom <= usableWidth)
    for (const person of people)
      revealed = revealOrganization(person, frame, revealed)
  return revealOrganization(selected, frame, revealed)
}

/** Preserve scale, moving only enough to clear a docked or overlay inspector. */
export function revealOrganization(
  node: LayoutNode,
  frame: CanvasFrame,
  viewport: ChartViewport
): ChartViewport {
  const { zoom } = viewport
  const left = node.x * zoom + viewport.x
  const right = left + NODE_WIDTH * zoom
  const top = node.y * zoom + viewport.y
  const bottom = top + node.height * zoom
  const dx =
    right > frame.width - SIDE
      ? frame.width - SIDE - right
      : left < SIDE
        ? SIDE - left
        : 0
  const dy =
    bottom > frame.height - BOTTOM
      ? frame.height - BOTTOM - bottom
      : top < TOP
        ? TOP - top
        : 0
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy }
}
