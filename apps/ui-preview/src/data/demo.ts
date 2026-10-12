/** Explicitly fictional records, isolated from the business application's data. */
export type UnitKind =
  "company" | "department" | "workshop" | "team" | "project"
export type Unit = {
  id: string
  parentId: string | null
  name: string
  kind: UnitKind
  manager: string
  description: string
}
export type Member = {
  id: string
  name: string
  unitId: string
  title: string
  code: string
  review: "verified" | "pending"
  account: "active" | "none"
  employment: "active" | "inactive"
  email: string
  notes: string
  joined: string
  extraUnitId?: string
}
export const kindNames: Record<UnitKind, string> = {
  company: "公司",
  department: "部门",
  workshop: "车间",
  team: "班组",
  project: "项目组",
}
export const demoUnits: Unit[] = [
  {
    id: "company",
    parentId: null,
    name: "京能制造 · 演示组织",
    kind: "company",
    manager: "陈明",
    description: "用于体验组织与成员的虚构企业空间。",
  },
  {
    id: "office",
    parentId: "company",
    name: "总经办",
    kind: "department",
    manager: "陈明",
    description: "企业运营协调与行政管理。",
  },
  {
    id: "sales",
    parentId: "company",
    name: "销售与服务中心",
    kind: "department",
    manager: "林悦",
    description: "客户需求、销售协作与项目服务。",
  },
  {
    id: "business",
    parentId: "sales",
    name: "业务部",
    kind: "team",
    manager: "许宁",
    description: "销售需求与客户服务。",
  },
  {
    id: "purchase",
    parentId: "sales",
    name: "采购部",
    kind: "team",
    manager: "苏晴",
    description: "供应商与采购需求协调。",
  },
  {
    id: "production",
    parentId: "company",
    name: "生产计划部",
    kind: "department",
    manager: "周航",
    description: "统筹生产计划、车间协作与仓储调度。",
  },
  {
    id: "workshop",
    parentId: "production",
    name: "生产车间",
    kind: "workshop",
    manager: "陆川",
    description: "负责钣金制造、成套装配及项目交付协作。",
  },
  {
    id: "metal",
    parentId: "workshop",
    name: "钣金车间",
    kind: "workshop",
    manager: "沈言",
    description: "下料、折弯与焊接工序的日常协作。",
  },
  {
    id: "cutting",
    parentId: "metal",
    name: "下料班组",
    kind: "team",
    manager: "方岩",
    description: "负责材料准备和下料。",
  },
  {
    id: "welding",
    parentId: "metal",
    name: "焊接班组",
    kind: "team",
    manager: "叶舟",
    description: "负责焊接、修整和过程自检。",
  },
  {
    id: "assembly",
    parentId: "workshop",
    name: "成套车间",
    kind: "workshop",
    manager: "顾辰",
    description: "电气装配、接线与成套设备检查。",
  },
  {
    id: "project",
    parentId: "workshop",
    name: "青禾项目组",
    kind: "project",
    manager: "程越",
    description: "虚构项目，用于体验跨组织协作和多岗位任职。",
  },
  {
    id: "warehouse",
    parentId: "production",
    name: "仓储组",
    kind: "department",
    manager: "方乔",
    description: "来料、在制品与成品的仓储协调。",
  },
  {
    id: "material",
    parentId: "warehouse",
    name: "原料仓",
    kind: "team",
    manager: "季宁",
    description: "原材料接收与领用。",
  },
  {
    id: "finished",
    parentId: "warehouse",
    name: "成品仓",
    kind: "team",
    manager: "唐悦",
    description: "成品入库与发运准备。",
  },
  {
    id: "quality",
    parentId: "company",
    name: "品质部",
    kind: "department",
    manager: "赵川",
    description: "来料检查、过程质量与交付检查。",
  },
  {
    id: "finance",
    parentId: "company",
    name: "财务部",
    kind: "department",
    manager: "季安",
    description: "财务核算与经营数据管理。",
  },
]
const rows: [string, string, string][] = [
  ["周航", "production", "生产计划主管"],
  ["林川", "production", "生产计划员"],
  ["陆川", "workshop", "车间主管"],
  ["沈言", "metal", "钣金组长"],
  ["方岩", "cutting", "下料操作员"],
  ["温宁", "cutting", "激光切割操作员"],
  ["叶舟", "welding", "焊接组长"],
  ["何远", "welding", "焊工"],
  ["郑南", "welding", "焊工"],
  ["顾辰", "assembly", "成套组长"],
  ["许禾", "assembly", "电气装配员"],
  ["宋青", "assembly", "接线员"],
  ["程越", "project", "项目协调"],
  ["江澄", "project", "装配工程师"],
  ["乔一", "project", ""],
  ["白榆", "project", "焊工"],
  ["方乔", "warehouse", "仓储主管"],
  ["季宁", "material", "仓管员"],
  ["唐悦", "finished", "仓管员"],
  ["陈明", "office", "运营主管"],
  ["林悦", "sales", "销售主管"],
  ["许宁", "business", "销售工程师"],
  ["苏晴", "purchase", "采购专员"],
  ["赵川", "quality", "质量工程师"],
  ["季安", "finance", "会计"],
  ["许知", "metal", "折弯操作员"],
  ["方辰", "assembly", "装配检验员"],
  ["程禾", "production", "计划助理"],
]
export const demoMembers: Member[] = rows.map(
  ([name, unitId, title], index) => ({
    id: `person-${index + 1}`,
    name,
    unitId,
    title,
    code: `DEMO-${String(index + 1).padStart(3, "0")}`,
    review: [8, 12, 13, 14, 15, 27].includes(index) ? "pending" : "verified",
    account: [8, 12, 13, 14, 15, 27].includes(index) ? "none" : "active",
    employment: index === 26 ? "inactive" : "active",
    email: `member${index + 1}@example.com`,
    notes: "",
    joined: "2026-06-15",
    ...(index === 9 ? { extraUnitId: "project" } : {}),
  })
)
export const STORAGE_KEY = "jingneng.organization-component-preview.v1"

export function loadDemo(): { units: Unit[]; members: Member[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
    if (
      raw?.version === 1 &&
      Array.isArray(raw.units) &&
      Array.isArray(raw.members) &&
      raw.units.some((u: Unit) => u.id === "company") &&
      raw.members.every(
        (p: Member) => typeof p.id === "string" && typeof p.name === "string"
      )
    )
      return raw
  } catch {
    /* Unavailable or incompatible storage starts a fresh isolated preview. */
  }
  return {
    units: structuredClone(demoUnits),
    members: structuredClone(demoMembers),
  }
}
