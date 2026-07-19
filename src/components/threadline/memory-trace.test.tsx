// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MemoryTrace } from "./memory-trace"

afterEach(cleanup)

describe("MemoryTrace", () => {
  it("explains that no memory check has run yet before the first retrieval", () => {
    render(<MemoryTrace trace={null} />)

    expect(screen.getByRole("heading", { name: "Memory Trace" })).toBeVisible()
    expect(screen.getByText("No memory check has run yet")).toBeVisible()
    expect(screen.getByText("0/3200 chars")).toBeVisible()
    expect(screen.getByText("qwen3.7-plus")).toBeVisible()
    expect(
      screen.getByText(/treated as untrusted context, never as instructions/i),
    ).toBeVisible()
  })

  it("distinguishes a completed retrieval with no match from not-run", () => {
    render(<MemoryTrace trace={null} hasRun />)

    expect(screen.getByText("No eligible memory matched")).toBeVisible()
    expect(screen.queryByText("No memory check has run yet")).not.toBeInTheDocument()
  })

  it("renders selected memories and every normalized score component", () => {
    render(
      <MemoryTrace
        hasRun
        trace={{
          candidateCount: 7,
          contextCharacters: 248,
          contextBudget: 3200,
          model: "qwen3.7-plus",
          promptVersion: "threadline-v2",
          latencyMs: 143,
          selectedMemories: [
            {
              id: "memory-1",
              category: "coping_strategy",
              statement: "A short walk helps Maya reset after a difficult meeting.",
              score: 0.87,
              similarity: 0.8,
              importance: 1,
              recency: 0.72,
              confidence: 0.91,
            },
          ],
        }}
      />,
    )

    const memory = screen.getByRole("listitem")
    expect(within(memory).getByText("Coping strategy")).toBeVisible()
    expect(within(memory).getByText("87% match")).toBeVisible()
    expect(
      within(memory).getByRole("progressbar", {
        name: "Retrieval match 87 percent",
      }),
    ).toHaveAttribute("aria-valuenow", "87")
    expect(within(memory).getByText("80%")).toBeVisible()
    expect(within(memory).getByText("100%")).toBeVisible()
    expect(within(memory).getByText("72%")).toBeVisible()
    expect(within(memory).getByText("91%")).toBeVisible()
    expect(screen.getByText("248/3200 chars")).toBeVisible()
    expect(screen.getByText("143 ms")).toBeVisible()
    expect(screen.getByText("threadline-v2")).toBeVisible()
  })

  it("can omit the duplicate title when composed inside a Sheet", () => {
    render(<MemoryTrace trace={null} showTitle={false} />)

    expect(screen.queryByRole("heading", { name: "Memory Trace" })).not.toBeInTheDocument()
    expect(screen.getByText("No memory check has run yet")).toBeVisible()
  })
})
