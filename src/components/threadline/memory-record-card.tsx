"use client"

import { useState, useTransition } from "react"
import {
  BanIcon,
  CircleAlertIcon,
  InfoIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  actOnMemory,
  type MemoryCategory,
  type MemoryRecord,
} from "./api-client"
import { formatDate } from "./date-format"

const categoryLabels: Record<MemoryCategory, string> = {
  goal: "Goal",
  preference: "Preference",
  coping_strategy: "Coping strategy",
  trigger: "Trigger",
  symptom: "Symptom",
  context: "Context",
  follow_up: "Follow-up",
}

const statusVariants = {
  proposed: "secondary",
  active: "default",
  superseded: "outline",
  disputed: "destructive",
  forgotten: "outline",
  rejected: "outline",
} as const

export function MemoryRecordCard({
  memory,
  onChange,
}: {
  memory: MemoryRecord
  onChange: (memory: MemoryRecord) => void
}) {
  const [pendingAction, setPendingAction] = useState<"dispute" | "forget" | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()

  const runAction = (action: "dispute" | "forget") => {
    setPendingAction(action)
    startTransition(async () => {
      try {
        const updated = await actOnMemory(memory.id, action)
        onChange(updated)
        toast.success(
          action === "forget"
            ? "Memory forgotten"
            : "Memory marked for clinician review",
        )
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "The memory could not be updated.",
        )
      } finally {
        setPendingAction(null)
      }
    })
  }

  const confidence = Math.round(memory.confidence * 100)
  const isInactive = ["forgotten", "rejected", "superseded"].includes(memory.status)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{categoryLabels[memory.category]}</CardTitle>
        <CardDescription>
          {memory.status === "forgotten"
            ? "The original statement and retrieval vector have been removed."
            : `Added ${formatDate(memory.createdAt)}`}
        </CardDescription>
        <CardAction>
          <Badge variant={statusVariants[memory.status]} className="capitalize">
            {memory.status.replace("_", " ")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-heading text-base leading-relaxed text-pretty">
          {memory.status === "forgotten"
            ? "This memory has been forgotten."
            : `“${memory.statement}”`}
        </p>
        {isInactive ? null : (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">Importance {memory.importance}/5</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={`Extraction confidence ${confidence} percent`}
                >
                  <InfoIcon aria-hidden="true" />
                  <span className="tabular-nums">{confidence}% confidence</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Qwen’s extraction confidence, not a clinical certainty.
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
      {memory.status === "active" ? (
        <CardFooter className="flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => runAction("dispute")}
            disabled={isPending}
          >
            {isPending && pendingAction === "dispute" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CircleAlertIcon data-icon="inline-start" aria-hidden="true" />
            )}
            Dispute memory
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={isPending}>
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                Forget memory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Forget this memory?</DialogTitle>
                <DialogDescription>
                  Threadline will remove the statement and its retrieval vector.
                  A content-free audit event remains so the deletion can be verified.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Keep memory
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => runAction("forget")}
                  >
                    <BanIcon data-icon="inline-start" aria-hidden="true" />
                    Forget permanently
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      ) : memory.status === "disputed" ? (
        <CardFooter className="gap-2 text-sm text-muted-foreground">
          <RotateCcwIcon aria-hidden="true" />
          Waiting for Dr. Chen to review your concern.
        </CardFooter>
      ) : null}
    </Card>
  )
}
