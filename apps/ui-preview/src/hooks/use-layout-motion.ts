import { useEffect, useRef, useState } from "react"
import { animate, useReducedMotion } from "motion/react"
import { interpolateLayout, type MotionLayout } from "@/lib/layout-motion"

export function useLayoutMotion(target: MotionLayout, rootId: string) {
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState(target)
  const latest = useRef(target)
  const previousRoot = useRef(rootId)
  useEffect(() => {
    const from = latest.current
    const scopeChanged = previousRoot.current !== rootId
    previousRoot.current = rootId
    const sameGeometry =
      from.nodes.length === target.nodes.length &&
      target.nodes.every((node, index) => {
        const old = from.nodes[index]
        return (
          old.id === node.id &&
          old.x === node.x &&
          old.y === node.y &&
          (old.opacity ?? 1) === 1
        )
      })
    if (reduced || scopeChanged || sameGeometry) {
      const id = requestAnimationFrame(() => {
        latest.current = target
        setFrame(target)
      })
      return () => cancelAnimationFrame(id)
    }
    const animation = animate(0, 1, {
      duration: 0.36,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => {
        const next = interpolateLayout(from, target, value)
        latest.current = next
        setFrame(next)
      },
    })
    return () => animation.stop()
  }, [target, rootId, reduced])
  return frame
}
