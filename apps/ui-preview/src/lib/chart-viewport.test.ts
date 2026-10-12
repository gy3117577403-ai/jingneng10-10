import { describe, expect, it } from "vitest"
import { frameOrganization, revealOrganization } from "./chart-viewport"
import { NODE_WIDTH, type LayoutNode } from "./organization"

const nodes: LayoutNode[] = [
  { id: "parent", unitId: "parent", kind: "unit", x: 0, y: 100, height: 80 },
  {
    id: "selected",
    unitId: "selected",
    kind: "unit",
    x: 552,
    y: 200,
    height: 80,
  },
]

describe("organization viewport with inspector", () => {
  it("fits the desktop graph at natural size", () => {
    const view = frameOrganization(
      nodes,
      { width: 888, height: 664 },
      "selected",
      0.86
    )
    expect(view.zoom).toBe(1)
    expect(552 + NODE_WIDTH + view.x).toBeLessThanOrEqual(860)
  })
  it("keeps the selected node readable and visible in the uncovered canvas", () => {
    const frame = { width: 490, height: 670 }
    const view = frameOrganization(nodes, frame, "selected", 0.86)
    expect(view.zoom).toBe(0.86)
    expect(552 * view.zoom + view.x).toBeGreaterThanOrEqual(28)
    expect((552 + NODE_WIDTH) * view.zoom + view.x).toBeLessThanOrEqual(
      frame.width - 28
    )
  })
  it("allows an explicit fit to reveal the full graph at a smaller scale", () => {
    const view = frameOrganization(
      nodes,
      { width: 390, height: 640 },
      "selected"
    )
    expect(view.zoom).toBeLessThan(0.86)
    for (const node of nodes) {
      expect(node.x * view.zoom + view.x).toBeGreaterThanOrEqual(27.99)
      expect((node.x + NODE_WIDTH) * view.zoom + view.x).toBeLessThanOrEqual(
        362.01
      )
    }
  })
  it("keeps both the selected organization and its visible members clear of an overlay", () => {
    const people: LayoutNode[] = [
      {
        id: "person-a",
        unitId: "selected",
        kind: "person",
        x: 828,
        y: 160,
        height: 60,
      },
      {
        id: "person-b",
        unitId: "selected",
        kind: "person",
        x: 828,
        y: 248,
        height: 60,
      },
    ]
    const frame = { width: 490, height: 670 }
    const view = frameOrganization(
      [...nodes, ...people],
      frame,
      "selected",
      0.86
    )
    for (const node of [nodes[1], ...people]) {
      expect(node.x * view.zoom + view.x).toBeGreaterThanOrEqual(27.99)
      expect((node.x + NODE_WIDTH) * view.zoom + view.x).toBeLessThanOrEqual(
        462.01
      )
    }
  })
  it("does not pan an already visible selection or change its zoom", () => {
    const view = { x: 32, y: 40, zoom: 0.9 }
    expect(
      revealOrganization(nodes[0], { width: 800, height: 600 }, view)
    ).toEqual(view)
    const moved = revealOrganization(
      nodes[1],
      { width: 490, height: 600 },
      view
    )
    expect(moved.zoom).toBe(view.zoom)
    expect((nodes[1].x + NODE_WIDTH) * moved.zoom + moved.x).toBeCloseTo(462, 8)
  })
})
