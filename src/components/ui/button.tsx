import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium tracking-wide transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:     'bg-accent text-on-accent hover:opacity-90',
        ghost:       'text-ink-3 hover:bg-card-alt hover:text-ink-2',
        outline:     'border-theme text-ink-3 hover:bg-card-alt hover:text-ink-2',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3',
        lg:      'h-11 px-6 text-sm',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
