// shadcn/Base UI composition, scoped styles instead of a second global CSS reset.
// See ../ui/shadcn/LICENSE.shadcn-ui.txt. Keep Base UI focus, portals and keyboard behavior.
import React from "react";
import { Button as B } from "@base-ui/react/button";
import { Dialog as D } from "@base-ui/react/dialog";
import { Select as S } from "@base-ui/react/select";
import { Tabs as T } from "@base-ui/react/tabs";
import { Checkbox as C } from "@base-ui/react/checkbox";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import "./controls.css";
const MB = motion.create(B);
export const Button = React.forwardRef(
    ({ variant = "default", size = "", className = "", ...p }, ref) => {
        const reduced = useReducedMotion();
        return (
            <MB
                ref={ref}
                data-slot="button"
                data-variant={variant}
                className={`q-button ${size.startsWith("icon") ? "size-7" : ""} ${className}`}
                whileHover={reduced || p.disabled ? undefined : { y: -1 }}
                whileTap={
                    reduced || p.disabled ? undefined : { scale: 0.98, y: 0.5 }
                }
                transition={{ duration: 0.12 }}
                {...p}
            />
        );
    },
);
export const Input = React.forwardRef((p, ref) => (
    <input ref={ref} data-slot="input" {...p} />
));
export const Textarea = React.forwardRef((p, ref) => (
    <textarea ref={ref} data-slot="textarea" {...p} />
));
export const Checkbox = React.forwardRef(({ children, ...p }, ref) => (
    <C.Root ref={ref} data-slot="checkbox" {...p}>
        <C.Indicator>
            <Check />
        </C.Indicator>
        {children}
    </C.Root>
));
export const Tabs = T.Root;
export const TabsList = ({ variant, ...p }) => (
    <T.List data-slot="tabs-list" {...p} />
);
export const TabsTrigger = React.forwardRef((p, ref) => (
    <T.Tab ref={ref} data-slot="tabs-trigger" {...p} />
));
export const TabsContent = ({ className = "", ...p }) => (
    <T.Panel className={className} data-slot="tabs-content" {...p} />
);
export const Select = S.Root;
export const SelectValue = S.Value;
export const SelectTrigger = React.forwardRef(({ children, ...p }, ref) => (
    <S.Trigger ref={ref} data-slot="select-trigger" {...p}>
        {children}
        <S.Icon>
            <ChevronDown />
        </S.Icon>
    </S.Trigger>
));
export const SelectContent = ({ children, className = "", ...p }) => (
    <S.Portal>
        <S.Positioner className="q-select-positioner" sideOffset={6}>
            <S.Popup className={`q-popover ${className}`} {...p}>
                <S.List>{children}</S.List>
            </S.Popup>
        </S.Positioner>
    </S.Portal>
);
export const SelectItem = ({ children, ...p }) => (
    <S.Item className="q-select-item" {...p}>
        <S.ItemText>{children}</S.ItemText>
        <S.ItemIndicator>
            <Check />
        </S.ItemIndicator>
    </S.Item>
);
export const Dialog = D.Root;
export const Sheet = D.Root;
export const DialogHeader = (p) => <div data-slot="dialog-header" {...p} />;
export const DialogFooter = (p) => <div data-slot="dialog-footer" {...p} />;
export const DialogTitle = (p) => <D.Title data-slot="dialog-title" {...p} />;
export const DialogDescription = (p) => (
    <D.Description data-slot="dialog-description" {...p} />
);
export const SheetHeader = (p) => <div data-slot="sheet-header" {...p} />;
export const SheetTitle = (p) => <D.Title data-slot="sheet-title" {...p} />;
export const SheetDescription = (p) => (
    <D.Description data-slot="sheet-description" {...p} />
);
export function DialogContent({
    children,
    className = "",
    showCloseButton = true,
    ...p
}) {
    return (
        <D.Portal>
            <D.Backdrop className="q-overlay" />
            <D.Popup className={`q-dialog ${className}`} {...p}>
                {children}
                {showCloseButton && (
                    <D.Close className="q-modal-close" aria-label="关闭窗口">
                        <X />
                    </D.Close>
                )}
            </D.Popup>
        </D.Portal>
    );
}
export function SheetContent({
    children,
    className = "",
    showCloseButton = false,
    ...p
}) {
    return (
        <D.Portal>
            <D.Backdrop className="q-overlay" />
            <D.Popup
                className={`q-sheet ${className}`}
                data-slot="sheet-content"
                {...p}
            >
                {children}
                {showCloseButton && (
                    <D.Close aria-label="关闭详情">
                        <X />
                    </D.Close>
                )}
            </D.Popup>
        </D.Portal>
    );
}
export const Table = (p) => <table {...p} />;
export const TableHeader = (p) => <thead {...p} />;
export const TableBody = (p) => <tbody {...p} />;
export const TableRow = (p) => <tr {...p} />;
export const TableHead = (p) => <th {...p} />;
export const TableCell = (p) => <td {...p} />;
