// @vitest-environment jsdom

import type { HTMLAttributes, ReactNode } from "react"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { PatientSession } from "./patient-session"

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/patient/session",
  useRouter: () => navigation,
}))

vi.mock("./app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/message-scroller", () => ({
  MessageScrollerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  MessageScroller: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  MessageScrollerViewport: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  MessageScrollerContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  MessageScrollerItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerButton: () => null,
}))

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function streamResponse(lines: unknown[]) {
  return Promise.resolve(
    new Response(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    }),
  )
}

function pathOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
}

function installSessionFetch(
  onMessage?: (init?: RequestInit) => Promise<Response>,
  onFinalize?: () => Promise<Response>,
) {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = pathOf(input)
    if (path === "/api/me") {
      return response({
        data: {
          user: {
            id: "patient-1",
            role: "patient",
            displayName: "Maya Rivera",
          },
        },
      })
    }
    if (path === "/api/sessions/session-1" && (!init?.method || init.method === "GET")) {
      return response({
        data: {
          session: {
            id: "session-1",
            patientId: "patient-1",
            status: "active",
            startedAt: "2026-07-18T15:00:00.000Z",
          },
        },
      })
    }
    if (path === "/api/sessions/session-1/messages" && init?.method === "POST") {
      if (!onMessage) throw new Error("Message request was not expected")
      return onMessage(init)
    }
    if (path === "/api/sessions/session-1/finalize" && init?.method === "POST") {
      if (!onFinalize) throw new Error("Finalize request was not expected")
      return onFinalize()
    }
    throw new Error(`Unexpected request: ${path} ${init?.method ?? "GET"}`)
  })
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  })
})

describe("PatientSession", () => {
  beforeEach(() => {
    navigation.push.mockReset()
    navigation.refresh.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("marks the conversation busy and disables its named composer while loading", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}))

    render(<PatientSession initialSessionId="session-1" />)

    expect(
      screen.getByRole("region", { name: "Reflection conversation" }),
    ).toHaveAttribute("aria-busy", "true")
    expect(
      screen.getByRole("textbox", { name: "Share what is on your mind" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled()
  })

  it("sends on Enter, streams into the live log, and displays the normalized trace", async () => {
    const user = userEvent.setup()
    installSessionFetch(() =>
      streamResponse([
        {
          type: "trace",
          data: {
            candidateCount: 4,
            selected: [
              {
                id: "memory-1",
                category: "coping_strategy",
                statement: "A short walk helped after a difficult meeting.",
                score: {
                  semantic: 0.82,
                  importance: 0.8,
                  recency: 0.75,
                  confidence: 0.9,
                  total: 0.84,
                },
              },
            ],
            contextCharacters: 62,
            contextLimit: 3200,
            model: "qwen3.7-plus",
            promptVersion: "threadline-v1",
            latencyMs: 121,
          },
        },
        { type: "token", token: "That sounds like a useful signal to notice." },
        { type: "done" },
      ]),
    )
    render(<PatientSession initialSessionId="session-1" />)

    const composer = await screen.findByRole("textbox", {
      name: "Share what is on your mind",
    })
    await waitFor(() => expect(composer).toBeEnabled())
    await user.type(composer, "Walking helped after the meeting.")
    await user.keyboard("{Enter}")

    const log = await screen.findByRole("log")
    expect(within(log).getByText("Walking helped after the meeting.")).toBeVisible()
    expect(
      within(log).getByText("That sounds like a useful signal to notice."),
    ).toBeVisible()
    expect(screen.getByText("84% match")).toBeVisible()
    expect(screen.getByText("62/3200 chars")).toBeVisible()
    expect(screen.getByText("121 ms")).toBeVisible()
    expect(composer).toHaveValue("")

    const messageCall = vi.mocked(fetch).mock.calls.find(
      ([input, init]) =>
        pathOf(input) === "/api/sessions/session-1/messages" &&
        init?.method === "POST",
    )
    expect(messageCall?.[1]?.body).toBe(
      JSON.stringify({ content: "Walking helped after the meeting." }),
    )
  })

  it("uses Shift+Enter for a new line without sending", async () => {
    const user = userEvent.setup()
    installSessionFetch()
    render(<PatientSession initialSessionId="session-1" />)
    const composer = await screen.findByRole("textbox", {
      name: "Share what is on your mind",
    })
    await waitFor(() => expect(composer).toBeEnabled())

    await user.type(composer, "First thought")
    await user.keyboard("{Shift>}{Enter}{/Shift}")

    expect(composer).toHaveValue("First thought\n")
    expect(
      vi.mocked(fetch).mock.calls.some(
        ([input, init]) =>
          pathOf(input) === "/api/sessions/session-1/messages" &&
          init?.method === "POST",
      ),
    ).toBe(false)
  })

  it("finalizes through the exact action and visibly confirms transcript deletion", async () => {
    const user = userEvent.setup()
    installSessionFetch(undefined, () =>
      response({
        data: {
          session: {
            id: "session-1",
            patientId: "patient-1",
            status: "finalized",
            startedAt: "2026-07-18T15:00:00.000Z",
            endedAt: "2026-07-18T15:10:00.000Z",
            transcriptDeletedAt: "2026-07-18T15:10:00.000Z",
          },
          summary: {
            sessionId: "session-1",
            narrative: "A synthetic summary.",
            themes: [],
            followUps: [],
            safetyFlags: [],
            transcriptDeleted: true,
          },
          proposedMemories: [],
        },
      }),
    )
    render(<PatientSession initialSessionId="session-1" />)
    const endSession = screen.getByRole("button", { name: "End session" })
    await waitFor(() => expect(endSession).toBeEnabled())

    await user.click(endSession)

    expect(await screen.findByText("Session ready for review")).toBeVisible()
    expect(screen.getByText(/raw transcript was deleted/i)).toBeVisible()
    expect(endSession).toBeDisabled()
    expect(
      screen.getByRole("textbox", { name: "Share what is on your mind" }),
    ).toBeDisabled()
  })

  it("replaces generated guidance with deterministic crisis support", async () => {
    const user = userEvent.setup()
    installSessionFetch(() =>
      streamResponse([
        {
          type: "error",
          error: {
            code: "RISK_HIGH",
            message: "Generation was suppressed for safety.",
          },
        },
      ]),
    )
    render(<PatientSession initialSessionId="session-1" />)
    const composer = await screen.findByRole("textbox", {
      name: "Share what is on your mind",
    })
    await waitFor(() => expect(composer).toBeEnabled())

    await user.type(composer, "I may be in immediate danger")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(
      await screen.findByText("Connect with immediate human support"),
    ).toBeVisible()
    expect(screen.getByText(/call or text 988/i)).toBeVisible()
    expect(screen.queryByText("Generation was suppressed for safety.")).not.toBeInTheDocument()
  })

  it("keeps session-load failures visible and leaves actions disabled", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      response(
        {
          error: { code: "NOT_FOUND", message: "That reflection no longer exists." },
        },
        404,
      ),
    )

    render(<PatientSession initialSessionId="missing" />)

    expect(await screen.findByText("The session needs your attention")).toBeVisible()
    expect(screen.getByText("That reflection no longer exists.")).toBeVisible()
    expect(screen.getByRole("button", { name: "End session" })).toBeDisabled()
  })
})
