import { describe, expect, it } from "vitest"
import { historyLines, makeInitialQuotes } from "./demo"
import {
  costTotal,
  issues,
  lineAmount,
  reuseLine,
  searchHistory,
  total,
  updateLine,
} from "./model"

describe("quotation preview business interactions", () => {
  it("keeps historical prices immutable and requires a new review after reuse", () => {
    const before = structuredClone(historyLines[0])
    const line = reuseLine(historyLines[0], "test-line")
    expect(line.checked).toBe(false)
    expect(line.costs.every((cost) => !cost.checked)).toBe(true)
    line.costs[0].price = 999
    line.price = 888
    expect(historyLines[0]).toEqual(before)
  })
  it("combines drawing/material, business and verification filters", () => {
    expect(
      searchHistory(historyLines, "远川 2.0", "钣金", true).map(
        (item) => item.id
      )
    ).toEqual(["h3"])
    expect(searchHistory(historyLines, "SUS304", "全部", false)).toHaveLength(1)
    expect(searchHistory(historyLines, "SUS304", "全部", true)).toHaveLength(0)
  })
  it("distinguishes unknown costs from explicitly recorded zero costs", () => {
    const quote = makeInitialQuotes()[0]
    expect(costTotal(quote.lines[0])).toBeNull()
    expect(issues(quote).some((issue) => issue.text.includes("待核价"))).toBe(
      true
    )
    quote.lines[0].costs = quote.lines[0].costs.map((cost) => ({
      ...cost,
      price: cost.price ?? 0,
      checked: true,
    }))
    quote.lines[0].checked = true
    expect(costTotal(quote.lines[0])).toBe(2500)
    expect(issues(quote)).toHaveLength(0)
  })
  it("invalidates confirmation after a quantity, price or basis edit", () => {
    const line = { ...reuseLine(historyLines[2], "test-line"), checked: true }
    for (const change of [
      { qty: 24 },
      { price: 1350 },
      { spec: "different revision" },
      { costs: [] },
    ]) {
      expect(updateLine(line, change).checked).toBe(false)
    }
  })
  it("rejects empty quotes, missing basis and invalid values", () => {
    const quote = makeInitialQuotes()[1]
    quote.lines[0].costs = quote.lines[0].costs.map((cost) => ({
      ...cost,
      checked: true,
    }))
    quote.lines[0].checked = true
    expect(issues(quote)).toHaveLength(0)
    quote.lines[0].qty = 0
    quote.lines[0].price = Number.NaN
    quote.lines[0].costs[0].source = " "
    expect(issues(quote)).toHaveLength(3)
    quote.lines = []
    expect(issues(quote)[0].text).toContain("尚未添加")
  })
  it("uses cents to avoid floating point drift in line and quote totals", () => {
    expect(lineAmount(0.1, 3)).toBe(0.3)
    const quote = makeInitialQuotes()[1]
    expect(total(quote)).toBe(30720)
    quote.lines[0].qty = 25
    expect(total(quote)).toBe(32000)
  })
})
