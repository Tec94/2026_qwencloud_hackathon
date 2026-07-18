"use client"

import { CheckIcon, PencilLineIcon, SaveIcon, XIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import { actOnMemory, updateMemory, type MemoryRecord } from "./api-client"

const categoryLabels: Record<string, string> = {
  goal: "Goal",
  preference: "Preference",
  coping_strategy: "Coping strategy",
  trigger: "Trigger",
  symptom: "Symptom",
  context: "Context",
  follow_up: "Follow-up",
}

export function MemoryReviewCard({
  memory,
  onChange,
}: {
  memory: MemoryRecord
  onChange: (memory: MemoryRecord) => void
}) {
  const [statement, setStatement] = useState(memory.statement)
  const [pendingAction, setPendingAction] = useState<"save" | "approve" | "reject" | null>(null)
  const [isPending, startTransition] = useTransition()
  const changed = statement.trim() !== memory.statement

  const persist = (action: "save" | "approve" | "reject") => {
    if (!statement.trim()) return
    setPendingAction(action)
    startTransition(async () => {
      try {
        let current = memory
        if (changed) {
          current = await updateMemory(memory.id, { statement: statement.trim() })
        }
        if (action !== "save") {
          current = await actOnMemory(current.id, action)
        }
        onChange(current)
        setStatement(current.statement)
        toast.success(
          action === "approve"
            ? "Memory approved for future retrieval"
            : action === "reject"
              ? "Memory rejected"
              : "Memory wording saved",
        )
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "The review could not be saved.")
      } finally {
        setPendingAction(null)
      }
    })
  }

  const resolved = ["active", "rejected"].includes(memory.status)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{categoryLabels[memory.category] ?? memory.category}</CardTitle>
        <CardDescription>
          Qwen confidence {Math.round(memory.confidence * 100)}% · importance {memory.importance}/5
        </CardDescription>
        <CardAction>
          <Badge variant={memory.status === "active" ? "default" : memory.status === "rejected" ? "outline" : "secondary"}>
            {memory.status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {memory.supersedesId ? (
          <Alert>
            <PencilLineIcon aria-hidden="true" />
            <AlertTitle>Possible contradiction</AlertTitle>
            <AlertDescription>
              Approval will supersede an older memory. Confirm the new wording is
              more accurate before carrying it forward.
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup>
          <Field data-invalid={!statement.trim()}>
            <FieldLabel htmlFor={`memory-${memory.id}`}>Memory statement</FieldLabel>
            <Textarea
              id={`memory-${memory.id}`}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              disabled={isPending || resolved}
              aria-invalid={!statement.trim()}
              className="min-h-24 text-base"
            />
            <FieldDescription>
              Edit for fidelity and specificity. Do not add details that were not in
              the reflection.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        {resolved ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {memory.status === "active" ? <CheckIcon aria-hidden="true" /> : <XIcon aria-hidden="true" />}
            {memory.status === "active" ? "Available for relevant future retrieval." : "Excluded from future retrieval."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => persist("save")}
                disabled={!changed || !statement.trim() || isPending}
              >
                {isPending && pendingAction === "save" ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" aria-hidden="true" />}
                Save edit
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => persist("reject")}
                disabled={!statement.trim() || isPending}
              >
                {isPending && pendingAction === "reject" ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" aria-hidden="true" />}
                Reject memory
              </Button>
            </div>
            <Button
              type="button"
              onClick={() => persist("approve")}
              disabled={!statement.trim() || isPending}
            >
              {isPending && pendingAction === "approve" ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" aria-hidden="true" />}
              Approve memory
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
