"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOutIcon } from "lucide-react"
import { useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { enterDemo, type UserRole } from "./api-client"
import { BrandLink } from "./brand"

const roleNavigation: Record<UserRole, Array<{ href: string; label: string }>> = {
  patient: [
    { href: "/patient", label: "Today" },
    { href: "/patient/session", label: "Reflection" },
  ],
  clinician: [
    { href: "/clinician", label: "Review queue" },
    { href: "/clinician/review", label: "Session review" },
  ],
}

export function AppShell({
  role,
  children,
}: {
  role: UserRole
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isSwitching, startSwitching] = useTransition()

  const switchRole = () => {
    startSwitching(async () => {
      try {
        const nextRole: UserRole = role === "patient" ? "clinician" : "patient"
        const result = await enterDemo(nextRole)
        window.sessionStorage.setItem(
          "threadline:demo-workspace:v1",
          result.workspaceId,
        )
        router.push(nextRole === "patient" ? "/patient" : "/clinician")
        router.refresh()
      } catch {
        router.push("/")
      }
    })
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 border-b border-border/70 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/82">
        <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <BrandLink compact />
          <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
            {role} view
          </Badge>

          <nav
            aria-label={`${role} navigation`}
            className="ms-auto hidden items-center gap-1 md:flex"
          >
            {roleNavigation[role].map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== `/${role}` && pathname.startsWith(item.href))

              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className="min-h-11"
                >
                  <Link href={item.href} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Link>
                </Button>
              )
            })}
          </nav>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn("ms-auto min-h-11 md:ms-2", isSwitching && "opacity-70")}
                onClick={switchRole}
                disabled={isSwitching}
              >
                <LogOutIcon data-icon="inline-start" aria-hidden="true" />
                <span className="hidden sm:inline">Switch role</span>
                <span className="sm:hidden">Switch role</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Continue this demo from the other perspective
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      {children}
    </div>
  )
}
