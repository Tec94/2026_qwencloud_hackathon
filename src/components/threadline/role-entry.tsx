"use client"

import { useRouter } from "next/navigation"
import { ArrowRightIcon, StethoscopeIcon, UserRoundIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import { enterDemo, type UserRole } from "./api-client"

const WORKSPACE_KEY = "threadline:demo-workspace:v1"

const roles = [
  {
    role: "patient" as const,
    name: "Maya",
    title: "Continue as the patient",
    description:
      "Reflect with Qwen, see what context was used, and stay in control of every memory.",
    action: "Enter as Maya",
    icon: UserRoundIcon,
  },
  {
    role: "clinician" as const,
    name: "Dr. Chen",
    title: "Continue as the clinician",
    description:
      "Review proposed memories, correct the record, and approve only what should carry forward.",
    action: "Enter as Dr. Chen",
    icon: StethoscopeIcon,
  },
]

export function RoleEntry() {
  const router = useRouter()
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const enter = (role: UserRole) => {
    setError(null)
    setPendingRole(role)

    startTransition(async () => {
      try {
        const existingWorkspace = window.sessionStorage.getItem(WORKSPACE_KEY)
        const result = await enterDemo(role, existingWorkspace ?? undefined)
        window.sessionStorage.setItem(WORKSPACE_KEY, result.workspaceId)
        router.push(role === "patient" ? "/patient" : "/clinician")
        router.refresh()
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The demo workspace could not be created.",
        )
        setPendingRole(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>We could not open the demo</AlertTitle>
          <AlertDescription>{error} Please try again.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((item) => {
          const Icon = item.icon
          const loading = isPending && pendingRole === item.role

          return (
            <Card key={item.role} className="threadline-role-card">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
                <CardAction>
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <Icon aria-hidden="true" />
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Synthetic persona · {item.name}
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  className="min-h-11 w-full"
                  variant={item.role === "patient" ? "default" : "outline"}
                  onClick={() => enter(item.role)}
                  disabled={isPending}
                >
                  {loading ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <ArrowRightIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {item.action}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
