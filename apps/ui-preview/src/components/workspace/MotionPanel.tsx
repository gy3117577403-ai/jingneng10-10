import { motion, useIsPresent, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

export function MotionPanel({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  const reduced = useReducedMotion(),
    present = useIsPresent()
  return (
    <motion.aside
      className="detail-panel"
      aria-label={label}
      inert={!present}
      initial={{ opacity: 0, x: reduced ? 0 : 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduced ? 0 : 24,
        transition: { duration: reduced ? 0.05 : 0.12 },
      }}
      transition={
        reduced
          ? { duration: 0.08 }
          : { type: "spring", stiffness: 420, damping: 36, mass: 0.9 }
      }
    >
      {children}
    </motion.aside>
  )
}
