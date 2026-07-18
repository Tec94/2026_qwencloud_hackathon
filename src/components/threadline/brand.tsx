import Link from "next/link"

import { cn } from "@/lib/utils"

export function ThreadlineMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-8", className)}
      viewBox="0 0 36 36"
      fill="none"
    >
      <path
        d="M11 6.5c8.5 1.5 4.5 9.2 13.5 11.2C29 18.7 28 28 19 29.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="11" cy="6.5" r="3.5" fill="currentColor" />
      <circle cx="24.5" cy="17.7" r="3.5" fill="currentColor" />
      <circle cx="19" cy="29.5" r="3.5" fill="currentColor" />
    </svg>
  )
}

export function BrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex min-h-11 items-center gap-2 rounded-lg outline-none transition-[color,transform] duration-160 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      aria-label="Threadline home"
    >
      <ThreadlineMark className="text-primary transition-transform duration-160 group-hover:rotate-3 motion-reduce:transition-none motion-reduce:group-hover:rotate-0" />
      <span className="font-heading text-lg font-semibold tracking-[-0.02em]">
        Threadline
      </span>
      {compact ? null : (
        <span className="hidden text-sm text-muted-foreground lg:inline">
          continuity you can inspect
        </span>
      )}
    </Link>
  )
}
