// @vitest-environment jsdom

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClinicianReview } from "./clinician-review"

vi.mock("next/navigation", () => ({
  usePathname: () => "/clinician/review",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("./app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function pathOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
}

const proposedMemory = {
  id: "memory-1",
  patientId: "patient-1",
  sourceSessionId: "session-1",
  category: "coping_strategy" as const,
  statement: "Walking outside can help after difficult work meetings.",
  importance: 4,
  confidence: 0.91,
  status: "proposed" as const,
  createdAt: "2026-07-18T15:05:00.000Z",
}

function installReviewFetch(requests: Array<{ path: string; method: string; body?: string }> = []) {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = pathOf(input)
    const method = init?.method ?? "GET"
    requests.push({ path, method, body: typeof init?.body === "string" ? init.body : undefined })

    if (path === "/api/me") {
      return response({
        data: {
          user: {
            id: "clinician-1",
            role: "clinician",
            displayName: "Dr. Chen",
          },
        },
      })
    }
    if (path === "/api/sessions/session-1") {
      return response({
        data: {
          session: {
            id: "session-1",
            patientId: "patient-1",
            status: "finalized",
            startedAt: "2026-07-18T15:00:00.000Z",
            transcriptDeletedAt: "2026-07-18T15:10:00.000Z",
          },
        },
      })
    }
    if (path === "/api/sessions/session-1/summary") {
      return response({
        data: {
          summary: {
            sessionId: "session-1",
            narrative:
              "Maya described feeling overloaded after difficult work meetings and finding brief walks useful.",
            themes: ["work stress", "recovery"],
            followUps: ["Check whether the walking routine remains helpful."],
            safetyFlags: [],
            transcriptDeletedAt: "2026-07-18T15:10:00.000Z",
            memories: [proposedMemory],
          },
        },
      })
    }
    if (path === "/api/patients/patient-1/memories") {
      return response({ data: { memories: [proposedMemory] } })
    }
    if (path === "/api/sessions/session-1/retrieval-trace") {
      return response({
        data: {
          traces: [
            {
              candidateCount: 6,
              selected: [
                {
                  id: "memory-prior",
                  category: "preference",
                  statement: "Maya prefers a short pause before discussing options.",
                  score: {
                    semantic: 0.8,
                    importance: 1,
                    recency: 0.75,
                    confidence: 0.9,
                    total: 0.86,
                  },
                },
              ],
              contextCharacters: 92,
              contextLimit: 3200,
              model: "qwen3.7-plus",
              promptVersion: "threadline-v1",
              latencyMs: 118,
            },
          ],
        },
      })
    }
    if (path === "/api/memories/memory-1" && method === "PATCH") {
      const statement = JSON.parse(String(init?.body)).statement as string
      return response({
        data: { memory: { ...proposedMemory, statement } },
      })
    }
    if (path === "/api/memories/memory-1/approve" && method === "POST") {
      return response({
        data: {
          memory: {
            ...proposedMemory,
            statement: "A brief outdoor walk helps Maya reset after difficult work meetings.",
            status: "active",
          },
        },
      })
    }
    throw new Error(`Unexpected request: ${path} ${method}`)
  })
}

describe("ClinicianReview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("does not announce an empty review while identity is loading", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}))

    render(<ClinicianReview />)

    expect(screen.getByRole("heading", { name: "Decide what deserves continuity." })).toBeVisible()
    expect(screen.queryByText("No finalized session to review")).not.toBeInTheDocument()
  })

  it("renders the empty review state when no finalized session exists", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const path = pathOf(input)
      if (path === "/api/me") {
        return response({
          data: {
            user: {
              id: "clinician-1",
              role: "clinician",
              displayName: "Dr. Chen",
            },
          },
        })
      }
      if (path === "/api/sessions") return response({ data: { sessions: [] } })
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<ClinicianReview />)

    expect(await screen.findByText("No finalized session to review")).toBeVisible()
    expect(screen.getByRole("link", { name: "Switch to Maya" })).toHaveAttribute(
      "href",
      "/",
    )
  })

  it("normalizes a raw retrieval trace for its visible technical display", async () => {
    installReviewFetch()

    render(<ClinicianReview initialSessionId="session-1" />)

    expect(await screen.findByText("Qwen session summary")).toBeVisible()
    expect(screen.getByText("86% match")).toBeVisible()
    expect(screen.getByText("80%")).toBeVisible()
    expect(screen.getByText("100%")).toBeVisible()
    expect(screen.getByText("75%")).toBeVisible()
    expect(screen.getByText("90%")).toBeVisible()
    expect(screen.getByText("92/3200 chars")).toBeVisible()
    expect(screen.getByText("118 ms")).toBeVisible()
    expect(screen.getByText("Transcript deletion recorded after extraction")).toBeVisible()
  })

  it("edits before approving and turns the resolved card read-only", async () => {
    const user = userEvent.setup()
    const requests: Array<{ path: string; method: string; body?: string }> = []
    installReviewFetch(requests)
    render(<ClinicianReview initialSessionId="session-1" />)

    const statement = await screen.findByRole("textbox", { name: "Memory statement" })
    await user.clear(statement)
    await user.type(
      statement,
      "A brief outdoor walk helps Maya reset after difficult work meetings.",
    )
    await user.click(screen.getByRole("button", { name: "Approve memory" }))

    expect(
      await screen.findByText("Available for relevant future retrieval."),
    ).toBeVisible()
    expect(statement).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Approve memory" })).not.toBeInTheDocument()

    const mutations = requests.filter((request) => request.method !== "GET")
    expect(mutations.map(({ path, method }) => `${method} ${path}`)).toEqual([
      "PATCH /api/memories/memory-1",
      "POST /api/memories/memory-1/approve",
    ])
    expect(mutations[0].body).toBe(
      JSON.stringify({
        statement:
          "A brief outdoor walk helps Maya reset after difficult work meetings.",
      }),
    )
  })

  it("keeps API errors in the review document", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      response(
        {
          error: {
            code: "FORBIDDEN",
            message: "This care relationship does not grant review access.",
          },
        },
        403,
      ),
    )

    render(<ClinicianReview initialSessionId="session-1" />)

    const alert = await screen.findByText("Review package unavailable")
    expect(alert).toBeVisible()
    expect(
      screen.getByText("This care relationship does not grant review access."),
    ).toBeVisible()
  })
})
