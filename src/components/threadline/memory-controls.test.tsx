// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import type { MemoryRecord } from "./api-client"
import { MemoryRecordCard } from "./memory-record-card"
import { MemoryReviewCard } from "./memory-review-card"

const activeMemory: MemoryRecord = {
  id: "memory-active",
  patientId: "patient-1",
  sourceSessionId: "session-1",
  category: "goal",
  statement: "Maya wants to make room for one restorative evening each week.",
  importance: 4,
  confidence: 0.88,
  status: "active",
  createdAt: "2026-07-18T15:00:00.000Z",
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function renderPatientMemory(memory = activeMemory, onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <TooltipProvider>
        <MemoryRecordCard memory={memory} onChange={onChange} />
      </TooltipProvider>,
    ),
  }
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  })
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  })
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  })
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  })
})

describe("patient memory controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("opens a labelled confirmation dialog, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup()
    renderPatientMemory()
    const trigger = screen.getByRole("button", { name: "Forget memory" })

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "Forget this memory?" })
    expect(dialog).toBeVisible()
    expect(
      within(dialog).getByText(/remove the statement and its retrieval vector/i),
    ).toBeVisible()
    expect(within(dialog).getByRole("button", { name: "Keep memory" })).toBeVisible()
    expect(
      within(dialog).getByRole("button", { name: "Forget permanently" }),
    ).toBeVisible()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Forget this memory?" }),
      ).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveFocus()
  })

  it("forgets only after explicit confirmation", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const forgotten = {
      ...activeMemory,
      statement: "",
      status: "forgotten" as const,
    }
    vi.mocked(fetch).mockImplementation(() =>
      response({ data: { memory: forgotten } }),
    )
    renderPatientMemory(activeMemory, onChange)

    await user.click(screen.getByRole("button", { name: "Forget memory" }))
    await user.click(
      screen.getByRole("button", { name: "Forget permanently" }),
    )

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(forgotten))
    expect(fetch).toHaveBeenCalledWith(
      "/api/memories/memory-active/forget",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("supports the dispute action from the keyboard", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const disputed = { ...activeMemory, status: "disputed" as const }
    vi.mocked(fetch).mockImplementation(() =>
      response({ data: { memory: disputed } }),
    )
    renderPatientMemory(activeMemory, onChange)

    const dispute = screen.getByRole("button", { name: "Dispute memory" })
    dispute.focus()
    await user.keyboard("{Enter}")

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(disputed))
    expect(fetch).toHaveBeenCalledWith(
      "/api/memories/memory-active/dispute",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("renders a forgotten tombstone without its deleted statement or actions", () => {
    renderPatientMemory({
      ...activeMemory,
      statement: "",
      status: "forgotten",
    })

    expect(screen.getByText("This memory has been forgotten.")).toBeVisible()
    expect(screen.getByText(/original statement and retrieval vector have been removed/i)).toBeVisible()
    expect(screen.queryByText(activeMemory.statement)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Forget memory" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Dispute memory" })).not.toBeInTheDocument()
  })
})

describe("clinician memory controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("marks an empty statement invalid and disables every destructive decision", async () => {
    const user = userEvent.setup()
    render(
      <MemoryReviewCard
        memory={{ ...activeMemory, status: "proposed", supersedesId: "memory-old" }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Possible contradiction")).toBeVisible()
    const statement = screen.getByRole("textbox", { name: "Memory statement" })
    await user.clear(statement)

    expect(statement).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("button", { name: "Save edit" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Reject memory" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Approve memory" })).toBeDisabled()
  })

  it("rejects a proposal and converts the card to a read-only state", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rejected = { ...activeMemory, status: "rejected" as const }
    vi.mocked(fetch).mockImplementation(() =>
      response({ data: { memory: rejected } }),
    )
    render(
      <MemoryReviewCard
        memory={{ ...activeMemory, status: "proposed" }}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Reject memory" }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(rejected))
    expect(fetch).toHaveBeenCalledWith(
      "/api/memories/memory-active/reject",
      expect.objectContaining({ method: "POST" }),
    )
  })
})
