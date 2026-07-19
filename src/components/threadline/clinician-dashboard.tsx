"use client"

import Link from "next/link"
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  Clock3Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

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
import { Skeleton } from "@/components/ui/skeleton"

import { AppShell } from "./app-shell"
import {
  getMe,
  listSessions,
  type TherapySession,
  type ThreadlineUser,
} from "./api-client"
import { formatDate } from "./date-format"

export function ClinicianDashboard() {
  const [user, setUser] = useState<ThreadlineUser | null>(null)
  const [sessions, setSessions] = useState<TherapySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const currentUser = await getMe()
        if (currentUser.role !== "clinician") {
          throw new Error("This workspace is currently signed in as the patient.")
        }
        const nextSessions = await listSessions()
        if (!active) return
        setUser(currentUser)
        setSessions(nextSessions.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt)))
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The clinician workspace could not be loaded.",
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

  const ready = sessions.filter((session) => session.status === "finalized")
  const active = sessions.filter((session) => session.status === "active")
  const safetyPriority = sessions.filter((session) => session.safetyFollowUp)

  return (
    <AppShell role="clinician">
      <main className="threadline-app-main">
        <div className="flex flex-col gap-10">
          <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex max-w-3xl flex-col gap-3">
              <p className="threadline-kicker">Clinical review workspace</p>
              <h1 className="threadline-app-heading">
                {user ? `${user.displayName}, the record is waiting for judgment.` : "Review before reuse."}
              </h1>
              <p className="max-w-[65ch] leading-relaxed text-pretty text-muted-foreground">
                Qwen proposes; you decide. Review the summary, correct each memory,
                and approve only what should shape a future conversation.
              </p>
            </div>
            {ready[0] ? (
              <Button asChild size="lg" className="min-h-12">
                <Link href={`/clinician/review?session=${encodeURIComponent(ready[0].id)}`}>
                  Open next review
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </header>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>We could not load the review queue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Alert>
            <ShieldCheckIcon aria-hidden="true" />
            <AlertTitle>Review is required before retrieval</AlertTitle>
            <AlertDescription>
              Proposed memories remain unavailable to Qwen until a linked clinician
              explicitly approves them. Contradictory details never replace an older
              record silently.
            </AlertDescription>
          </Alert>

          {!loading && safetyPriority.length > 0 ? (
            <section aria-labelledby="safety-priority" className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <ShieldAlertIcon className="text-destructive" aria-hidden="true" />
                <div>
                  <h2 id="safety-priority" className="font-heading text-2xl font-semibold">
                    Safety-priority follow-up
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Deterministic support guidance was shown. Review these first.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {safetyPriority.map((session) => (
                  <Card key={session.id} size="sm" className="border-destructive/40">
                    <CardHeader>
                      <CardTitle>{session.patient?.displayName ?? "Maya"}</CardTitle>
                      <CardDescription>
                        Reflection started {formatDate(session.startedAt)}
                      </CardDescription>
                      <CardAction>
                        <Badge variant="destructive">Immediate safety concern</Badge>
                      </CardAction>
                    </CardHeader>
                    {session.safetyReasonCodes?.length ? (
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Reason:{" "}
                          <span className="font-medium text-foreground">
                            {session.safetyReasonCodes.join(", ")}
                          </span>
                        </p>
                      </CardContent>
                    ) : null}
                    <CardFooter className="justify-end">
                      <Button asChild>
                        <Link href={`/clinician/review?session=${encodeURIComponent(session.id)}`}>
                          Review follow-up
                          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="queue-overview" className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <div className="threadline-app-surface p-5 sm:p-6">
              <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h2 id="queue-overview" className="font-heading text-2xl font-semibold">
                      Review queue
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Finalized reflections, newest first.
                    </p>
                  </div>
                  <span className="font-heading text-4xl font-semibold tabular-nums text-primary">
                    {loading ? "—" : ready.length}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-xl bg-secondary/55 p-4">
                    <ClipboardCheckIcon className="text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Ready to review</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{ready.length} sessions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
                    <Clock3Icon className="text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Still active</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{active.length} sessions</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-2 sm:p-4">
              <p className="threadline-kicker">Review standard</p>
              {[
                "Specific enough to be useful",
                "Faithful to the session",
                "Safe to carry forward",
              ].map((item, index) => (
                <div key={item} className="flex items-center gap-3 border-b border-border pb-3 last:border-b-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-sm font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="patient-timeline" className="flex flex-col gap-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="threadline-kicker">Maya’s timeline</p>
                <h2 id="patient-timeline" className="font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                  Session handoffs
                </h2>
              </div>
              <Badge variant="outline">Synthetic patient</Badge>
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-52 rounded-xl" />
                <Skeleton className="h-52 rounded-xl" />
              </div>
            ) : sessions.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {sessions.map((session) => (
                  <Card key={session.id} size="sm">
                    <CardHeader>
                      <CardTitle>{session.patient?.displayName ?? "Maya Rivera"}</CardTitle>
                      <CardDescription>
                        Reflection started {formatDate(session.startedAt)}
                      </CardDescription>
                      <CardAction>
                        <Badge variant={session.status === "finalized" ? "default" : "secondary"}>
                          {session.status}
                        </Badge>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex items-start gap-3">
                      {session.status === "finalized" ? (
                        <CheckCheckIcon className="mt-0.5 text-primary" aria-hidden="true" />
                      ) : (
                        <Clock3Icon className="mt-0.5 text-muted-foreground" aria-hidden="true" />
                      )}
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {session.status === "finalized"
                          ? "Summary extracted and transcript deletion recorded. Proposed memories await review."
                          : "The patient has not finalized this reflection. No memory proposal is available yet."}
                      </p>
                    </CardContent>
                    {session.status === "finalized" ? (
                      <CardFooter className="justify-end">
                        <Button asChild>
                          <Link href={`/clinician/review?session=${encodeURIComponent(session.id)}`}>
                            Review session
                            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                          </Link>
                        </Button>
                      </CardFooter>
                    ) : null}
                  </Card>
                ))}
              </div>
            ) : (
              <Empty className="min-h-64 border border-dashed border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardCheckIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>The queue is clear</EmptyTitle>
                  <EmptyDescription>
                    Switch to Maya, complete a reflection, and end the session. The
                    review package will appear here after extraction succeeds.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline">
                    <Link href="/">Switch to Maya</Link>
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
