import { useEffect, useRef } from 'react'
import { drawPorter, LOGICAL_W, LOGICAL_H } from './porter.ts'

interface Props {
  points: number
  capacity: number
  celebrate?: boolean
  seed?: number
  scale?: number
}

export function PorterCanvas({ points, capacity, celebrate, seed = 0, scale = 1.5 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ points, capacity, celebrate, seed })
  propsRef.current = { points, capacity, celebrate, seed }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const { points, capacity, celebrate, seed } = propsRef.current
      drawPorter(ctx, { points, capacity, celebrate, seed, t: (now - start) / 1000 })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={ref}
      width={LOGICAL_W}
      height={LOGICAL_H}
      className="porter-canvas"
      style={{ width: LOGICAL_W * scale, height: LOGICAL_H * scale }}
    />
  )
}
