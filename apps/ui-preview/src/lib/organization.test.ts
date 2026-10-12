import { describe, expect, it } from "vitest"
import { demoMembers, demoUnits, type Member, type Unit } from "../data/demo"
import {
  activeBranchPath,
  branchPath,
  filterMembers,
  layoutOrganization,
  membersIn,
  NODE_WIDTH,
  NODE_HEIGHT,
  ROW_GAP,
  unitPath,
  validateMember,
} from "./organization"

describe("shared-trunk organization geometry", () => {
  const expanded = new Set(["production", "workshop"])
  it("draws exactly one shared trunk for each parent, with endpoints at card centers", () => {
    const graph = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      expanded,
      false,
      "project"
    )
    expect(graph.nodes).toHaveLength(6)
    expect(graph.branches).toHaveLength(2)
    for (const branch of graph.branches) {
      const source = graph.nodes.find((n) => n.id === branch.source)!
      expect(branch.start).toEqual({
        x: source.x + NODE_WIDTH,
        y: source.y + source.height / 2,
      })
      expect((branchPath(branch).match(/ V /g) || []).length).toBe(1)
      for (const point of branch.targets) {
        const target = graph.nodes.find((n) => n.id === point.id)!
        expect(point.x).toBe(target.x)
        expect(point.y).toBe(target.y + target.height / 2)
        expect(branch.trunkX).toBeGreaterThan(source.x + NODE_WIDTH)
        expect(branch.trunkX).toBeLessThan(target.x)
      }
    }
    expect(activeBranchPath(graph.branches[0])).not.toBe("")
  })
  it("does not re-layout when the selected organization changes", () => {
    const first = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      expanded,
      false,
      "production"
    )
    const second = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      expanded,
      false,
      "project"
    )
    expect(first.nodes).toEqual(second.nodes)
  })
  it("removes only the collapsed descendants and their lines", () => {
    const graph = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      new Set(["production"]),
      false,
      "production"
    )
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "production",
      "workshop",
      "warehouse",
    ])
    expect(graph.branches).toHaveLength(1)
  })
  it("gives each person assignment its own node and limits long person branches", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...demoMembers[0],
      id: `p${i}`,
      unitId: "production",
    }))
    const graph = layoutOrganization(
      demoUnits,
      many,
      "production",
      expanded,
      true,
      "production"
    )
    expect(graph.nodes.filter((n) => n.kind === "person")).toHaveLength(4)
    expect(graph.nodes.find((n) => n.kind === "more")?.count).toBe(10)
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length)
  })
  it("shows people only for the selected organization, keeping the rest of the chart quiet", () => {
    const graph = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      new Set(["production", "workshop", "project"]),
      true,
      "project"
    )
    expect(
      graph.nodes
        .filter((n) => n.kind === "person")
        .every((n) => n.unitId === "project")
    ).toBe(true)
    expect(graph.nodes.filter((n) => n.kind === "person")).toHaveLength(4)
  })
  it.each([1, 3, 20])(
    "keeps %i sibling cards separated and connectors outside cards",
    (count) => {
      const units: Unit[] = [
        { ...demoUnits[0], id: "root", parentId: null },
        ...Array.from({ length: count }, (_, i) => ({
          ...demoUnits[0],
          id: `c${i}`,
          parentId: "root",
          name: "很长的组织名称用于验证节点尺寸",
        })),
      ]
      const graph = layoutOrganization(
        units,
        [],
        "root",
        new Set(["root"]),
        false,
        "root"
      )
      const children = graph.nodes.filter((n) => n.id !== "root")
      for (let i = 1; i < children.length; i++)
        expect(children[i].y).toBeGreaterThan(
          children[i - 1].y + children[i - 1].height
        )
      expect(graph.branches).toHaveLength(1)
    }
  )
  it("handles empty organizations without invalid paths", () => {
    expect(
      layoutOrganization([], [], "unknown", new Set(), true, "unknown")
    ).toEqual({ nodes: [], branches: [] })
    const graph = layoutOrganization(
      [demoUnits[0]],
      [],
      "company",
      new Set(["company"]),
      true,
      "company"
    )
    expect(graph.nodes).toHaveLength(1)
    expect(graph.branches).toHaveLength(0)
  })
  it("keeps a leaf sibling close to its peer when that peer has a deep member branch", () => {
    const graph = layoutOrganization(
      demoUnits,
      demoMembers,
      "production",
      new Set(["production", "workshop", "project"]),
      true,
      "project"
    )
    const workshop = graph.nodes.find((node) => node.id === "workshop")!
    const warehouse = graph.nodes.find((node) => node.id === "warehouse")!
    expect(warehouse.y - workshop.y).toBe(NODE_HEIGHT + ROW_GAP)
    for (const node of graph.nodes) {
      for (const other of graph.nodes.filter(
        (candidate) => candidate.x === node.x && candidate.y > node.y
      ))
        expect(other.y - node.y - node.height).toBeGreaterThanOrEqual(ROW_GAP)
    }
  })
  it("packs mixed fully expanded branches without overlapping nodes in any column", () => {
    for (const selected of demoUnits) {
      const graph = layoutOrganization(
        demoUnits,
        demoMembers,
        "company",
        new Set(demoUnits.map((unit) => unit.id)),
        true,
        selected.id
      )
      for (const node of graph.nodes) {
        for (const other of graph.nodes.filter(
          (candidate) => candidate.x === node.x && candidate.y > node.y
        ))
          expect(other.y - node.y - node.height).toBeGreaterThanOrEqual(ROW_GAP)
      }
    }
  })
  it("cannot loop forever when malformed organizational input contains a cycle", () => {
    const units: Unit[] = [
      { ...demoUnits[0], id: "a", parentId: "b" },
      { ...demoUnits[0], id: "b", parentId: "a" },
    ]
    expect(unitPath(units, "a")).toHaveLength(2)
    expect(
      layoutOrganization(units, [], "a", new Set(["a", "b"]), false, "a").nodes
    ).toHaveLength(2)
  })
})
describe("member filtering and edits", () => {
  const base = { query: "", review: "all", account: "all", descendants: true }
  it("includes secondary assignments without counting the same person twice", () => {
    expect(membersIn(demoUnits, demoMembers, "project")).toHaveLength(5)
    const all = membersIn(demoUnits, demoMembers, "production")
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length)
    expect(all).toHaveLength(22)
  })
  it("distinguishes direct members from members of descendants", () => {
    expect(
      filterMembers(demoUnits, demoMembers, "production", {
        ...base,
        descendants: false,
      })
    ).toHaveLength(3)
  })
  it("combines search, account status and review filters", () => {
    const people = filterMembers(demoUnits, demoMembers, "production", {
      ...base,
      review: "pending",
      account: "none",
      query: "焊工",
    })
    expect(people.map((p) => p.name)).toEqual(["郑南", "白榆"])
    expect(
      filterMembers(demoUnits, demoMembers, "production", {
        ...base,
        query: "不存在的成员",
      })
    ).toHaveLength(0)
  })
  it("allows search by demo identifier and missing position", () => {
    expect(
      filterMembers(demoUnits, demoMembers, "company", {
        ...base,
        query: "demo-015",
      })[0].name
    ).toBe("乔一")
    expect(
      filterMembers(demoUnits, demoMembers, "company", {
        ...base,
        review: "missing",
      }).map((p) => p.name)
    ).toEqual(["乔一"])
  })
  it("rejects empty names and account activation before review", () => {
    const member = demoMembers[0]
    expect(validateMember({ ...member, name: "  " })).toContain("姓名")
    expect(validateMember({ ...member, review: "pending" })).toContain(
      "核对资料"
    )
    expect(validateMember({ ...member, title: "" })).toContain("补充岗位")
    expect(validateMember(member)).toBe("")
  })
  it("an edited position participates in filtering immediately", () => {
    const edited: Member[] = demoMembers.map((p) =>
      p.id === "person-15" ? { ...p, title: "装配检验员" } : p
    )
    expect(
      filterMembers(demoUnits, edited, "project", {
        ...base,
        query: "装配检验",
      })
    ).toHaveLength(1)
  })
})
