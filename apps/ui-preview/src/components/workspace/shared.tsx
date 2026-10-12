import type { ReactNode } from "react"
import { Building2, Factory, FolderKanban, Network, Users } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Member, UnitKind } from "@/data/demo"

export const unitIcons = {
  company: Building2,
  department: Network,
  workshop: Factory,
  team: Users,
  project: FolderKanban,
}
export function PersonAvatar({
  name,
  large = false,
}: {
  name: string
  large?: boolean
}) {
  const tone = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4
  return (
    <Avatar className={`person-avatar tone-${tone} ${large ? "large" : ""}`}>
      <AvatarFallback>{name.slice(-2)}</AvatarFallback>
    </Avatar>
  )
}
export function UnitIcon({
  kind,
  className = "",
}: {
  kind: UnitKind
  className?: string
}) {
  const Icon = unitIcons[kind]
  return (
    <span className={`unit-icon ${kind} ${className}`}>
      <Icon size={17} strokeWidth={1.7} />
    </span>
  )
}
export function ReviewStatus({ member }: { member: Member }) {
  if (!member.title)
    return (
      <Badge variant="outline" className="status-label warning">
        <span />
        岗位待补充
      </Badge>
    )
  return member.review === "verified" ? (
    <span className="status-text good">
      <span />
      已核对
    </span>
  ) : (
    <Badge variant="outline" className="status-label warning">
      <span />
      待核对
    </Badge>
  )
}
export function Pick({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v)
      }}
      items={options}
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
export function IconButton({
  label,
  children,
  onClick,
  disabled,
  className = "",
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={className}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
