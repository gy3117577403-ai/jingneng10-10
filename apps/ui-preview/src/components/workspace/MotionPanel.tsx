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
      initial={{ opacity: 0, x: reduced ? 0 : 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduced ? 0 : 14,
        transition: { duration: reduced ? 0.05 : 0.12 },
      }}
      transition={
        reduced
          ? { duration: 0.08 }
          : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </motion.aside>
  )
}
