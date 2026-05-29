import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from its previous value to the new target.
 * Returns the current animated value.
 */
export function useCountUp(target: number, duration = 700): number {
  const [current, setCurrent] = useState(target)
  const prevTarget = useRef(target)

  useEffect(() => {
    const start = prevTarget.current
    const diff = target - start
    if (diff === 0) return

    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const t = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setCurrent(Math.round(start + diff * eased))
      if (t < 1) requestAnimationFrame(tick)
      else prevTarget.current = target
    }

    const id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [target, duration])

  return current
}
