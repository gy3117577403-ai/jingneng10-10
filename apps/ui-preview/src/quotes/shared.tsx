import type { ReactNode, Ref } from "react"
import { Box, Check, CircleDashed, Factory, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <div className="q-search">
      <Search />
      <Input
        ref={inputRef}
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
export function DetailSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="q-sheet" showCloseButton={false}>
        <SheetHeader className="q-sheet-header">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭详情面板"
            onClick={onClose}
          >
            <X />
          </Button>
        </SheetHeader>
        <div className="q-sheet-body">{children}</div>
        <div className="q-sheet-footer">{footer}</div>
      </SheetContent>
    </Sheet>
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
