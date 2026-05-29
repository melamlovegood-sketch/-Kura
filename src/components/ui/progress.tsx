import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number       // 0–100
  className?: string
  barClassName?: string
}

export function Progress({ value, className, barClassName }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('h-[2px] w-full overflow-hidden rounded-full bg-track', className)}>
      <div
        className={cn(
          'h-full rounded-full bg-progress transition-all duration-700 ease-out',
          barClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
