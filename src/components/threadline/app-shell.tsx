"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeftRightIcon, LogOutIcon, MenuIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { enterDemo, logout, type UserRole } from "./api-client"
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
  const [menuOpen, setMenuOpen] = useState(false)

  const nextRole: UserRole = role === "patient" ? "clinician" : "patient"
  const perspectiveLabel = nextRole === "patient" ? "View as Maya" : "View as Dr. Chen"

  const switchRole = () => {
    startSwitching(async () => {
      try {
        const result = await enterDemo(nextRole)
        window.sessionStorage.setItem(
          "threadline:demo-workspace:v1",
          result.workspaceId,
        )
        setMenuOpen(false)
        router.push(nextRole === "patient" ? "/patient" : "/clinician")
        router.refresh()
      } catch {
        router.push("/")
      }
    })
  }

  const leaveDemo = () => {
    startSwitching(async () => {
      try {
        await logout()
      } catch {
        // Leaving the demo should still land on the public page even if the
        // session is already gone.
      } finally {
        window.sessionStorage.removeItem("threadline:demo-workspace:v1")
        setMenuOpen(false)
        router.push("/")
        router.refresh()
      }
    })
  }

  const renderNavLink = (item: { href: string; label: string }, onNavigate?: () => void) => {
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
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          {item.label}
        </Link>
      </Button>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 border-b border-border/70 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/82">
        <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <BrandLink compact />
          <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
            {role === "patient" ? "Maya" : "Dr. Chen"}
          </Badge>

          <nav
            aria-label={`${role} navigation`}
            className="ms-auto hidden items-center gap-1 md:flex"
          >
            {roleNavigation[role].map((item) => renderNavLink(item))}
          </nav>

          <div className="ms-auto flex items-center gap-2 md:ms-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn("min-h-11", isSwitching && "opacity-70")}
                  onClick={switchRole}
                  disabled={isSwitching}
                >
                  <ArrowLeftRightIcon data-icon="inline-start" aria-hidden="true" />
                  <span className="hidden sm:inline">{perspectiveLabel}</span>
                  <span className="sm:hidden">Switch</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Switch perspective inside the same demo workspace. Nothing is signed out.
              </TooltipContent>
            </Tooltip>

            <Button
              type="button"
              variant="ghost"
              className="hidden min-h-11 md:inline-flex"
              onClick={leaveDemo}
              disabled={isSwitching}
            >
              <LogOutIcon data-icon="inline-start" aria-hidden="true" />
              Leave demo
            </Button>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="min-h-11 min-w-11 md:hidden"
                  aria-label="Open navigation menu"
                >
                  <MenuIcon aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[88vw] sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle>Navigate</SheetTitle>
                  <SheetDescription>
                    Move within the {role === "patient" ? "Maya" : "Dr. Chen"} workspace or switch
                    perspective. The demo workspace is preserved either way.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-2 px-4 pb-4">
                  <nav aria-label={`${role} mobile navigation`} className="flex flex-col gap-1">
                    {roleNavigation[role].map((item) => renderNavLink(item, () => setMenuOpen(false)))}
                  </nav>
                  <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 justify-start"
                      onClick={switchRole}
                      disabled={isSwitching}
                    >
                      <ArrowLeftRightIcon data-icon="inline-start" aria-hidden="true" />
                      {perspectiveLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 justify-start"
                      onClick={leaveDemo}
                      disabled={isSwitching}
                    >
                      <LogOutIcon data-icon="inline-start" aria-hidden="true" />
                      Leave demo
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
