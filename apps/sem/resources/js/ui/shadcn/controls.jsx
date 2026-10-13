// Adapted from the shadcn/ui Base UI registry used by apps/ui-preview.
// MIT license: LICENSE.shadcn-ui.txt. CSS is scoped for the existing application.
import React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import "../../../css/component-controls.css";

const MotionButton = motion.create(ButtonPrimitive);
export const Button = React.forwardRef(function Button(
    { className = "", variant = "outline", size = "default", feedback = "control", ...props },
    ref,
) {
    const reduced = useReducedMotion();
    // Graph cards and directory labels keep their attachment/baseline fixed.
    // Their feedback comes from surface and edge changes; controls can depress.
    const anchored = feedback === "surface";
    return (
        <MotionButton
            ref={ref}
            data-slot="button"
            data-variant={variant}
            data-size={size}
            className={`jn-control-button ${className}`}
            whileHover={reduced || props.disabled || anchored ? undefined : { y: -0.5 }}
            whileTap={reduced || props.disabled || anchored ? undefined : { scale: 0.97, y: 0.7 }}
            transition={{
                type: "spring",
                stiffness: 760,
                damping: 42,
                mass: 0.45,
            }}
            {...props}
        />
    );
});

export function Switch({ className = "", ...props }) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={`jn-control-switch ${className}`}
            {...props}
        >
            <SwitchPrimitive.Thumb data-slot="switch-thumb" />
        </SwitchPrimitive.Root>
    );
}

export function Select({
    value,
    onValueChange,
    items,
    label,
    className = "",
    disabled = false,
    id,
    required = false,
    name,
    describedBy,
}) {
    return (
        <SelectPrimitive.Root
            value={value}
            onValueChange={onValueChange}
            items={items}
            disabled={disabled}
            id={id}
            required={required}
            name={name}
        >
            <SelectPrimitive.Trigger
                data-slot="select-trigger"
                aria-label={label}
                aria-describedby={describedBy}
                className={`jn-control-select ${className}`}
            >
                <SelectPrimitive.Value data-slot="select-value" />
                <SelectPrimitive.Icon>
                    <ChevronDown size={14} />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                <SelectPrimitive.Positioner
                    sideOffset={5}
                    className="jn-control-positioner"
                    alignItemWithTrigger={false}
                >
                    <SelectPrimitive.Popup
                        data-slot="select-content"
                        className="jn-control-popup"
                    >
                        <SelectPrimitive.ScrollUpArrow className="jn-control-scroll">
                            <ChevronUp size={14} />
                        </SelectPrimitive.ScrollUpArrow>
                        <SelectPrimitive.List>
                            {items.map((item) => (
                                <SelectPrimitive.Item
                                    key={item.value}
                                    value={item.value}
                                    className="jn-control-option"
                                >
                                    <SelectPrimitive.ItemText>
                                        {item.label}
                                    </SelectPrimitive.ItemText>
                                    <SelectPrimitive.ItemIndicator>
                                        <Check size={14} />
                                    </SelectPrimitive.ItemIndicator>
                                </SelectPrimitive.Item>
                            ))}
                        </SelectPrimitive.List>
                        <SelectPrimitive.ScrollDownArrow className="jn-control-scroll">
                            <ChevronDown size={14} />
                        </SelectPrimitive.ScrollDownArrow>
                    </SelectPrimitive.Popup>
                </SelectPrimitive.Positioner>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}

export function ActionMenu({ label, icon, children }) {
    return (
        <MenuPrimitive.Root>
            <MenuPrimitive.Trigger
                render={
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label={label}
                        title={label}
                    />
                }
            >
                {icon}
            </MenuPrimitive.Trigger>
            <MenuPrimitive.Portal>
                <MenuPrimitive.Positioner
                    sideOffset={6}
                    align="end"
                    className="jn-control-positioner"
                >
                    <MenuPrimitive.Popup
                        data-slot="dropdown-menu-content"
                        className="jn-control-popup"
                    >
                        {children}
                    </MenuPrimitive.Popup>
                </MenuPrimitive.Positioner>
            </MenuPrimitive.Portal>
        </MenuPrimitive.Root>
    );
}

// Searchable-select composition from the shadcn/Base UI combobox pattern.
// Use for organization paths and job catalogs, keeping the form value stable.
export function SearchSelect({value, onValueChange, items, label, id, disabled, required, describedBy}) {
    const selected = items.find(item => item.value === value) ?? null;
    return <ComboboxPrimitive.Root items={items} value={selected}
        onValueChange={item => onValueChange(item?.value ?? '')}
        isItemEqualToValue={(a, b) => a.value === b.value}
        disabled={disabled} required={required}>
        <ComboboxPrimitive.Trigger id={id} className="jn-control-select" aria-label={label} aria-describedby={describedBy}>
            <span data-slot="select-value"><ComboboxPrimitive.Value /></span><ChevronDown size={14}/>
        </ComboboxPrimitive.Trigger>
        <ComboboxPrimitive.Portal>
            <ComboboxPrimitive.Positioner align="start" sideOffset={5} className="jn-control-positioner">
                <ComboboxPrimitive.Popup className="jn-control-popup jn-combobox-popup" aria-label={label}>
                    <ComboboxPrimitive.Input className="jn-combobox-search" aria-label={`搜索${label}`} placeholder="输入名称查找…"/>
                    <ComboboxPrimitive.Empty className="jn-combobox-empty">没有匹配选项</ComboboxPrimitive.Empty>
                    <ComboboxPrimitive.List className="jn-combobox-list">
                        {item => <ComboboxPrimitive.Item key={item.value} value={item} className="jn-control-option">
                            <span>{item.label}</span><ComboboxPrimitive.ItemIndicator><Check size={14}/></ComboboxPrimitive.ItemIndicator>
                        </ComboboxPrimitive.Item>}
                    </ComboboxPrimitive.List>
                </ComboboxPrimitive.Popup>
            </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>;
}
export function MenuItem({ className = "", ...props }) {
    return (
        <MenuPrimitive.Item
            className={`jn-control-option ${className}`}
            {...props}
        />
    );
}
