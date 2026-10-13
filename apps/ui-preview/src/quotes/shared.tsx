import type { ReactNode } from "react"
import { Box, Check, CircleDashed, Factory, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Business } from "./model"

export function TypeIcon({
  type,
  small = false,
}: {
  type: Business
  small?: boolean
}) {
  return (
    <span
      className={`q-type-icon ${small ? "small" : ""} ${type === "钣金" ? "sheet" : ""}`}
    >
      {type === "成套" ? <Factory /> : <Box />}
    </span>
  )
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "green" | "amber" | "blue"
}) {
  return (
    <span className={`q-status ${tone}`}>
      {tone === "green" ? <Check /> : <CircleDashed />}
      {children}
    </span>
  )
}
export function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={(value) => value && onChange(value)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>{value === "全部" ? label : value}</SelectValue>
      </SelectTrigger>
      <SelectContent className="q-popover">
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
export function SearchInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="q-search">
      <Search />
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="清除搜索"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      )}
    </div>
  )
}
export function Empty({
  title,
  message,
  onClear,
}: {
  title: string
  message: string
  onClear?: () => void
}) {
  return (
    <div className="q-empty">
      <Search />
      <strong>{title}</strong>
      <p>{message}</p>
      {onClear && (
        <Button variant="outline" onClick={onClear}>
          清除筛选
        </Button>
      )}
    </div>
  )
}
