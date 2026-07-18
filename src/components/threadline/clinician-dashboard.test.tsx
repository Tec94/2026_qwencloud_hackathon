// @vitest-environment jsdom

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClinicianDashboard } from "./clinician-dashboard"

vi.mock("next/navigation", () => ({
  usePathname: () => "/clinician",
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

function requestPath(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
}

describe("ClinicianDashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("holds the queue in a loading state until identity resolves", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}))

    render(<ClinicianDashboard />)

    expect(screen.getByRole("heading", { name: "Review before reuse." })).toBeVisible()
    expect(screen.queryByText("The queue is clear")).not.toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("shows the clinician empty state with a role-switch path", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const path = requestPath(input)
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
      if (path === "/api/sessions") {
        return response({ data: { sessions: [] } })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<ClinicianDashboard />)

    expect(await screen.findByText("The queue is clear")).toBeVisible()
    expect(
      screen.getByRole("heading", {
        name: "Dr. Chen, the record is waiting for judgment.",
      }),
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "Switch to Maya" })).toHaveAttribute(
      "href",
      "/",
    )
  })

  it("links the next finalized session to its review action", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const path = requestPath(input)
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
      if (path === "/api/sessions") {
        return response({
          data: {
            sessions: [
              {
                id: "session-ready",
                patientId: "patient-1",
                status: "finalized",
                startedAt: "2026-07-18T15:00:00.000Z",
                patient: { id: "patient-1", displayName: "Maya Rivera" },
              },
              {
                id: "session-active",
                patientId: "patient-1",
                status: "active",
                startedAt: "2026-07-18T14:00:00.000Z",
              },
            ],
          },
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<ClinicianDashboard />)

    expect(
      await screen.findByRole("link", { name: "Open next review" }),
    ).toHaveAttribute("href", "/clinician/review?session=session-ready")
    expect(screen.getByRole("link", { name: "Review session" })).toHaveAttribute(
      "href",
      "/clinician/review?session=session-ready",
    )
    expect(screen.getAllByText("1 sessions")).toHaveLength(2)
  })

  it("renders authorization failures as persistent page content", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      response(
        {
          error: {
            code: "FORBIDDEN",
            message: "This workspace belongs to another role.",
          },
        },
        403,
      ),
    )

    render(<ClinicianDashboard />)

    expect(
      await screen.findByText("We could not load the review queue"),
    ).toBeVisible()
    expect(screen.getByText("This workspace belongs to another role.")).toBeVisible()
  })
})
