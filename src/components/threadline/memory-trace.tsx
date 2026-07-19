import { BrainCircuitIcon, GaugeIcon, ShieldCheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Progress } from "@/components/ui/progress"

import type { RetrievalTrace } from "./api-client"

const categoryLabels: Record<string, string> = {
  goal: "Goal",
  preference: "Preference",
  coping_strategy: "Coping strategy",
  trigger: "Trigger",
  symptom: "Symptom",
  context: "Context",
  follow_up: "Follow-up",
}

export function MemoryTrace({
  trace,
  hasRun = false,
  showTitle = true,
}: {
  trace: RetrievalTrace | null
  /** True once at least one response has completed a retrieval pass. */
  hasRun?: boolean
  showTitle?: boolean
}) {
  const selected = trace?.selectedMemories ?? []
  const ranWithNoMatch = hasRun && selected.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {showTitle ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-xl font-semibold">Memory Trace</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Approved context selected for this reply.
            </p>
          </div>
          <Badge variant="secondary">Live trace</Badge>
        </div>
      ) : null}

      <Marker>
        <MarkerIcon>
          <ShieldCheckIcon />
        </MarkerIcon>
        <MarkerContent>
          Memory text is treated as untrusted context, never as instructions.
        </MarkerContent>
      </Marker>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
        {selected.length > 0 ? (
          <ol className="flex flex-col gap-3" aria-label="Selected memories">
            {selected.map((memory, index) => {
              const score = Math.round(memory.score * 100)
              return (
                <li
                  key={memory.id}
                  className="rounded-xl bg-secondary/55 p-3 shadow-[inset_0_0_0_1px_oklch(0.235_0.025_340/0.06)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background font-heading text-sm font-semibold tabular-nums text-primary">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline">
                          {categoryLabels[memory.category] ?? memory.category}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {score}% match
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-pretty">
                        {memory.statement}
                      </p>
                      <Progress
                        value={score}
                        aria-label={`Retrieval match ${score} percent`}
                      />
                      {memory.similarity !== undefined ? (
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">Semantic</dt>
                            <dd className="tabular-nums">{formatFactor(memory.similarity)}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">Importance</dt>
                            <dd className="tabular-nums">{formatFactor(memory.importance)}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">Recency</dt>
                            <dd className="tabular-nums">{formatFactor(memory.recency)}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-muted-foreground">Confidence</dt>
                            <dd className="tabular-nums">{formatFactor(memory.confidence)}</dd>
                          </div>
                        </dl>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-5 text-center">
            <BrainCircuitIcon className="text-muted-foreground" aria-hidden="true" />
            <div className="flex max-w-xs flex-col gap-1">
              {ranWithNoMatch ? (
                <>
                  <p className="text-sm font-medium">No eligible memory matched</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Approved memories were checked for this response and none were
                    selected.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No memory check has run yet</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Send a message and Threadline will show any approved memory it
                    selects here, with the reason.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Candidates</dt>
          <dd className="font-medium tabular-nums">{trace?.candidateCount ?? 0}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Context budget</dt>
          <dd className="font-medium tabular-nums">
            {trace?.contextCharacters ?? 0}/{trace?.contextBudget ?? 3200} chars
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="flex items-center gap-1 text-muted-foreground">
            <GaugeIcon aria-hidden="true" /> Model
          </dt>
          <dd className="font-medium">{trace?.model ?? "qwen3.7-plus"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Latency</dt>
          <dd className="font-medium tabular-nums">
            {trace?.latencyMs ? `${trace.latencyMs} ms` : "Waiting"}
          </dd>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <dt className="text-muted-foreground">Prompt version</dt>
          <dd className="font-medium">{trace?.promptVersion ?? "threadline-v1"}</dd>
        </div>
      </dl>
    </div>
  )
}

function formatFactor(value?: number) {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`
}
