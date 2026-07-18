"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
  BrainIcon,
  CalendarClockIcon,
  LockKeyholeIcon,
  MessageCircleMoreIcon,
} from "lucide-react"
import { useEffect, useState, useTransition } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

import { AppShell } from "./app-shell"
import {
  createSession,
  getMe,
  listPatientMemories,
  listSessions,
  type MemoryRecord,
  type TherapySession,
  type ThreadlineUser,
} from "./api-client"
import { formatDate } from "./date-format"
import { MemoryRecordCard } from "./memory-record-card"

export function PatientDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<ThreadlineUser | null>(null)
  const [sessions, setSessions] = useState<TherapySession[]>([])
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, startReflection] = useTransition()

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const currentUser = await getMe()
        if (currentUser.role !== "patient") {
          throw new Error("This workspace is currently signed in as the clinician.")
        }

        const [nextSessions, nextMemories] = await Promise.all([
          listSessions(),
          listPatientMemories(currentUser.id),
        ])

        if (!active) return
        setUser(currentUser)
        setSessions(nextSessions)
        setMemories(nextMemories)
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The patient workspace could not be loaded.",
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const beginReflection = () => {
    setError(null)
    startReflection(async () => {
      try {
        const session = await createSession()
        router.push(`/patient/session?session=${encodeURIComponent(session.id)}`)
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "A reflection could not be started.",
        )
      }
    })
  }

  const updateMemory = (updated: MemoryRecord) => {
    setMemories((current) =>
      current.map((memory) => (memory.id === updated.id ? updated : memory)),
    )
  }

  const sortedSessions = sessions.toSorted((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  )
  const mostRecent = sortedSessions[0]
  const activeMemories = memories.filter((memory) => memory.status === "active")
  const controllableMemories = memories.filter((memory) =>
    ["active", "disputed"].includes(memory.status),
  )

  return (
    <AppShell role="patient">
      <main className="threadline-app-main">
        <div className="flex flex-col gap-10">
          <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex max-w-3xl flex-col gap-3">
              <p className="threadline-kicker">Maya’s continuity workspace</p>
              <h1 className="threadline-app-heading">
                {user ? `Good to see you, ${user.displayName}.` : "A calmer place to continue."}
              </h1>
              <p className="max-w-[65ch] leading-relaxed text-pretty text-muted-foreground">
                Begin with what matters today. Threadline only brings forward
                details that you and Dr. Chen have already approved.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full sm:w-auto"
              onClick={beginReflection}
              disabled={starting || loading || !user}
            >
              {starting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MessageCircleMoreIcon data-icon="inline-start" aria-hidden="true" />
              )}
              Start a reflection
            </Button>
          </header>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>We could not open your workspace</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{error}</span>
                <Button asChild variant="outline">
                  <Link href="/">Return to role selection</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert>
            <LockKeyholeIcon aria-hidden="true" />
            <AlertTitle>Consent is active for this synthetic demo</AlertTitle>
            <AlertDescription>
              Approved memories may be retrieved for continuity. Raw session text is
              deleted after successful extraction, and every memory can be disputed
              or forgotten.
            </AlertDescription>
          </Alert>

          <section aria-labelledby="continuity-heading" className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
            <Card>
              <CardHeader>
                <CardTitle id="continuity-heading">Your latest reflection</CardTitle>
                <CardDescription>
                  The clearest next step in your continuity loop.
                </CardDescription>
                <CardAction>
                  <Badge variant={mostRecent?.status === "finalized" ? "default" : "secondary"}>
                    {mostRecent?.status ?? "Not started"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex flex-col gap-3" aria-label="Loading latest reflection">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : mostRecent ? (
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-start gap-3">
                        <CalendarClockIcon className="mt-0.5 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium">Started</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(mostRecent.startedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <BrainIcon className="mt-0.5 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium">Memory state</p>
                          <p className="text-sm text-muted-foreground">
                            {mostRecent.status === "finalized"
                              ? "Ready for clinician review"
                              : "Transcript retained until finalization"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Empty className="min-h-48">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MessageCircleMoreIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No reflection yet</EmptyTitle>
                      <EmptyDescription>
                        Start with what is on your mind today. You decide when the
                        session is ready to summarize.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
              {mostRecent ? (
                <CardFooter className="justify-between gap-3">
                  <Marker>
                    <MarkerIcon>
                      <LockKeyholeIcon />
                    </MarkerIcon>
                    <MarkerContent>
                      {mostRecent.status === "finalized"
                        ? "Transcript deletion recorded"
                        : "Session remains private and active"}
                    </MarkerContent>
                  </Marker>
                  {mostRecent.status === "active" ? (
                    <Button asChild variant="outline">
                      <Link href={`/patient/session?session=${encodeURIComponent(mostRecent.id)}`}>
                        Continue
                        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </CardFooter>
              ) : null}
            </Card>

            <div className="threadline-app-surface flex flex-col gap-5 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="font-heading text-xl font-semibold">What carries forward</h2>
                  <p className="text-sm text-muted-foreground">
                    Only active, clinician-reviewed memories.
                  </p>
                </div>
                <span className="font-heading text-3xl font-semibold tabular-nums text-primary">
                  {loading ? "—" : activeMemories.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {["Inspectable", "Reviewable", "Reversible"].map((label, index) => (
                  <div key={label} className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      0{index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="memory-heading" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-2">
                <p className="threadline-kicker">Memory record</p>
                <h2 id="memory-heading" className="font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  Details you have approved
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">
                Disputing pauses reuse. Forgetting removes both the statement and
                its retrieval vector.
              </p>
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-56 rounded-xl" />
              </div>
            ) : controllableMemories.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {controllableMemories.map((memory) => (
                  <MemoryRecordCard
                    key={memory.id}
                    memory={memory}
                    onChange={updateMemory}
                  />
                ))}
              </div>
            ) : (
              <Empty className="min-h-64 border border-dashed border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No approved memories yet</EmptyTitle>
                  <EmptyDescription>
                    Complete a reflection, then switch to Dr. Chen to review the
                    small set of details Threadline proposes carrying forward.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" onClick={beginReflection} disabled={starting}>
                    Start a reflection
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  )
}
