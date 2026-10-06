import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-semibold tracking-[-0.005em] transition-[background-color,box-shadow,transform,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[18px] shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:ring-2 aria-invalid:ring-bahaya",
  {
    variants: {
      variant: {
        default:
          "bg-accent-fill text-on-accent bg-[image:var(--kilau)] shadow-[var(--accent-glow)] hover:brightness-105",
        destructive:
          "bg-bahaya-soft text-bahaya hover:bg-[color-mix(in_srgb,var(--bahaya)_16%,var(--bahaya-soft))]",
        outline:
          "bg-fill-1 text-ink hover:bg-fill-2",
        secondary:
          "bg-fill-1 text-ink hover:bg-fill-2",
        ghost:
          "text-ink hover:bg-fill-1",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 text-[13px] has-[>svg]:px-3",
        lg: "h-[52px] px-6 text-[17px] has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
