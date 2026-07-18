"use client"

import Link from "next/link"
import { ArrowLeftIcon, FileCheck2Icon, LockKeyholeIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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

import { AppShell } from "./app-shell"
import {
  getMe,
  getRetrievalTrace,
  getSession,
  getSessionSummary,
  listPatientMemories,
  listSessions,
  type MemoryRecord,
  type RetrievalTrace,
  type SessionSummary,
  type TherapySession,
} from "./api-client"
import { MemoryReviewCard } from "./memory-review-card"
import { MemoryTrace } from "./memory-trace"

export function ClinicianReview({ initialSessionId }: { initialSessionId?: string }) {
  const [session, setSession] = useState<TherapySession | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [trace, setTrace] = useState<RetrievalTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const user = await getMe()
        if (user.role !== "clinician") {
          throw new Error("This review belongs to the clinician role.")
        }

        let sessionId = initialSessionId
        if (!sessionId) {
          const sessions = await listSessions()
          sessionId = sessions.find((item) => item.status === "finalized")?.id
        }
        if (!sessionId) {
          if (active) setLoading(false)
          return
        }

        const nextSession = await getSession(sessionId)
        const [nextSummary, nextMemories, nextTrace] = await Promise.all([
          getSessionSummary(sessionId),
          listPatientMemories(nextSession.patientId),
          getRetrievalTrace(sessionId).catch(() => null),
        ])
        if (!active) return
        setSession(nextSession)
        setSummary(nextSummary)
        setMemories(
          nextSummary.memories?.length
            ? nextSummary.memories
            : nextMemories.filter(
                (memory) => memory.sourceSessionId === sessionId,
              ),
        )
        setTrace(nextTrace)
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "The review package could not be loaded.",
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
  }, [initialSessionId])

  const updateMemory = (updated: MemoryRecord) => {
    setMemories((current) =>
      current.map((memory) => (memory.id === updated.id ? updated : memory)),
    )
  }

  const proposed = memories.filter((memory) =>
    ["proposed", "disputed"].includes(memory.status),
  )
  const resolved = memories.filter((memory) =>
    ["active", "rejected"].includes(memory.status),
  )

  return (
    <AppShell role="clinician">
      <main className="threadline-app-main">
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-3">
            <Button asChild variant="ghost" className="w-fit">
              <Link href="/clinician">
                <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                Review queue
              </Link>
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex max-w-3xl flex-col gap-2">
                <p className="threadline-kicker">Session review</p>
                <h1 className="threadline-app-heading">Decide what deserves continuity.</h1>
                <p className="max-w-[65ch] leading-relaxed text-muted-foreground">
                  Review the source summary first, then make each proposed memory
                  specific, faithful, and safe to reuse.
                </p>
              </div>
              <Badge variant="secondary" className="w-fit">
                {proposed.length} awaiting decision
              </Badge>
            </div>
          </header>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Review package unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <Skeleton className="h-80 rounded-xl" />
              <Skeleton className="h-80 rounded-xl" />
            </div>
          ) : !session || !summary ? (
            <Empty className="min-h-80 border border-dashed border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileCheck2Icon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No finalized session to review</EmptyTitle>
                <EmptyDescription>
                  Complete and end a reflection as Maya. Qwen’s summary and memory
                  proposals will appear here after extraction succeeds.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="outline">
                  <Link href="/">Switch to Maya</Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <section aria-labelledby="summary-heading" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                  <CardHeader>
                    <CardTitle id="summary-heading">Qwen session summary</CardTitle>
                    <CardDescription>
                      A compact source for review. The raw transcript is no longer retained.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <p className="max-w-[68ch] font-heading text-lg leading-relaxed text-pretty">
                      {summary.narrative}
                    </p>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">Themes</h3>
                        <ul className="flex flex-wrap gap-2">
                          {summary.themes.map((theme) => (
                            <li key={theme}><Badge variant="secondary">{theme}</Badge></li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">Follow-ups</h3>
                        {summary.followUps.length ? (
                          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
                            {summary.followUps.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground">No follow-up proposed.</p>}
                      </div>
                    </div>
                    <Marker>
                      <MarkerIcon><LockKeyholeIcon /></MarkerIcon>
                      <MarkerContent>
                        {summary.transcriptDeleted === false
                          ? "Transcript deletion is still pending"
                          : "Transcript deletion recorded after extraction"}
                      </MarkerContent>
                    </Marker>
                  </CardContent>
                </Card>
                <div className="threadline-app-surface min-h-80 p-5">
                  <MemoryTrace trace={trace} />
                </div>
              </section>

              <section aria-labelledby="proposed-heading" className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="threadline-kicker">Proposed memory</p>
                    <h2 id="proposed-heading" className="font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                      Review each detail
                    </h2>
                  </div>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    Editing changes the durable record. Approval makes the detail
                    eligible for future retrieval.
                  </p>
                </div>
                {memories.length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {[...proposed, ...resolved].map((memory) => (
                      <MemoryReviewCard key={memory.id} memory={memory} onChange={updateMemory} />
                    ))}
                  </div>
                ) : (
                  <Empty className="min-h-56 border border-dashed border-border">
                    <EmptyHeader>
                      <EmptyTitle>No memory candidates extracted</EmptyTitle>
                      <EmptyDescription>
                        The summary remains available, but Qwen found no durable detail
                        worth carrying into another session.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </AppShell>
  )
}
