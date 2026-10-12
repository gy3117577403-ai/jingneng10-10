import { describe, expect, it } from "vitest"
import { demoMembers, demoUnits } from "@/data/demo"
import { layoutOrganization, NODE_WIDTH } from "./organization"
import { interpolateLayout, type MotionLayout } from "./layout-motion"

const closed = layoutOrganization(
  demoUnits,
  demoMembers,
  "production",
  new Set(["production", "workshop"]),
  false,
  "metal"
)
const opened = layoutOrganization(
  demoUnits,
  demoMembers,
  "production",
  new Set(["production", "workshop", "metal"]),
  false,
  "metal"
)
function assertConnected(frame: MotionLayout) {
  const nodes = new Map(frame.nodes.map((node) => [node.id, node]))
  for (const branch of frame.branches) {
    const parent = nodes.get(branch.source)!
    expect(branch.start.x).toBeCloseTo(parent.x + NODE_WIDTH)
    expect(branch.start.y).toBeCloseTo(parent.y + parent.height / 2)
    for (const target of branch.targets) {
      const child = nodes.get(target.id)!
      expect(target.x).toBeCloseTo(child.x)
      expect(target.y).toBeCloseTo(child.y + child.height / 2)
    }
  }
}
describe("synchronized organization motion", () => {
  it("keeps connector anchors on their moving cards at every sampled frame", () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.85, 1])
      assertConnected(interpolateLayout(closed, opened, t))
  })
  it("enters expanded nodes from their parent and settles to the exact layout", () => {
    expect(
      interpolateLayout(closed, opened, 0).nodes.find((n) => n.id === "cutting")
        ?.opacity
    ).toBe(0)
    expect(
      interpolateLayout(closed, opened, 0.5).nodes.find(
        (n) => n.id === "cutting"
      )?.opacity
    ).toBe(0.5)
    expect(interpolateLayout(closed, opened, 1)).toBe(opened)
  })
  it("retains disappearing nodes until the fold finishes, then removes them", () => {
    const frame = interpolateLayout(opened, closed, 0.5)
    const leaving = frame.nodes.find((n) => n.id === "cutting")!
    expect(leaving.leaving).toBe(true)
    expect(leaving.opacity).toBe(0.5)
    assertConnected(frame)
    expect(
      interpolateLayout(opened, closed, 1).nodes.some((n) => n.id === "cutting")
    ).toBe(false)
  })
  it("can reverse a partially completed expansion without jumping at its start", () => {
    const interrupted = interpolateLayout(closed, opened, 0.4)
    const resumed = interpolateLayout(interrupted, closed, 0)
    for (const node of interrupted.nodes) {
      const next = resumed.nodes.find((n) => n.id === node.id)!
      expect([next.x, next.y, next.opacity]).toEqual([
        node.x,
        node.y,
        node.opacity,
      ])
    }
    assertConnected(interpolateLayout(interrupted, closed, 0.35))
  })
})
