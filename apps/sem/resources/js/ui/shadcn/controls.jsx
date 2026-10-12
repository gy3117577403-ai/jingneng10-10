// Adapted from the shadcn/ui Base UI registry used by apps/ui-preview.
// MIT license: LICENSE.shadcn-ui.txt. CSS is scoped for the existing application.
import React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import "../../../css/component-controls.css";

const MotionButton = motion.create(ButtonPrimitive);
export const Button = React.forwardRef(function Button(
    { className = "", variant = "outline", size = "default", ...props },
    ref,
) {
    const reduced = useReducedMotion();
    return (
        <MotionButton
            ref={ref}
            data-slot="button"
            data-variant={variant}
            data-size={size}
            className={`jn-control-button ${className}`}
            whileHover={reduced || props.disabled ? undefined : { y: -0.6 }}
            whileTap={reduced || props.disabled ? undefined : { scale: 0.98, y: 0.5 }}
            transition={{
                type: "spring",
                stiffness: 650,
                damping: 40,
                mass: 0.5,
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
}) {
    return (
        <SelectPrimitive.Root
            value={value}
            onValueChange={onValueChange}
            items={items}
            disabled={disabled}
        >
            <SelectPrimitive.Trigger
                data-slot="select-trigger"
                aria-label={label}
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
export function MenuItem({ className = "", ...props }) {
    return (
        <MenuPrimitive.Item
            className={`jn-control-option ${className}`}
            {...props}
        />
    );
}
