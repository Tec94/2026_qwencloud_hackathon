// @vitest-environment jsdom

import type { ReactNode } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PatientDashboard } from "./patient-dashboard"

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/patient",
  useRouter: () => navigation,
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

function installEmptyWorkspaceFetch() {
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = requestPath(input)
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
    if (path === "/api/sessions" && (!init?.method || init.method === "GET")) {
      return response({ data: { sessions: [] } })
    }
    if (path === "/api/patients/patient-1/memories") {
      return response({ data: { memories: [] } })
    }
    if (path === "/api/sessions" && init?.method === "POST") {
      return response({
        data: {
          session: {
            id: "session-new",
            patientId: "patient-1",
            status: "active",
            startedAt: "2026-07-18T12:00:00.000Z",
          },
        },
      })
    }
    throw new Error(`Unexpected request: ${path} ${init?.method ?? "GET"}`)
  })
}

describe("PatientDashboard", () => {
  beforeEach(() => {
    navigation.push.mockReset()
    navigation.refresh.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("announces loading and prevents starting before identity resolves", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}))

    render(<PatientDashboard />)

    expect(screen.getByLabelText("Loading latest reflection")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start a reflection" })).toBeDisabled()
  })

  it("renders useful empty states after parallel workspace requests", async () => {
    installEmptyWorkspaceFetch()

    render(<PatientDashboard />)

    expect(await screen.findByText("No reflection yet")).toBeVisible()
    expect(screen.getByText("No approved memories yet")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Good to see you, Maya Rivera." })).toBeVisible()
    expect(screen.getAllByRole("button", { name: "Start a reflection" })).toHaveLength(2)
  })

  it("starts a reflection from the exact accessible action", async () => {
    const user = userEvent.setup()
    installEmptyWorkspaceFetch()
    render(<PatientDashboard />)

    const startActions = await screen.findAllByRole("button", {
      name: "Start a reflection",
    })
    await user.click(startActions[0])

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/patient/session?session=session-new",
      ),
    )
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("keeps a server error visible and offers role recovery", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const path = requestPath(input)
      if (path === "/api/me") {
        return response(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Your demo session expired.",
            },
          },
          401,
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<PatientDashboard />)

    expect(
      await screen.findByText("We could not open your workspace"),
    ).toBeVisible()
    expect(screen.getByText("Your demo session expired.")).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Return to role selection" }),
    ).toHaveAttribute("href", "/")
  })
})
