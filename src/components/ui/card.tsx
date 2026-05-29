import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

/** Standard card — bordered, bg-card */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[14px] border-theme bg-card px-[18px] py-4', className)}
      {...props}
    />
  )
}

/** Emphasis card — no border, bg-card-alt (wish pool, highlights) */
export function CardAlt({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[14px] bg-card-alt px-[18px] py-4', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3',
        className,
      )}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props} />
}
