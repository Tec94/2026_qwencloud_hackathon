// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RoleEntry } from "./role-entry"

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}))

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

describe("RoleEntry", () => {
  beforeEach(() => {
    navigation.push.mockReset()
    navigation.refresh.mockReset()
    window.sessionStorage.clear()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("exposes both demo roles with exact, keyboard-reachable names", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({
        data: {
          user: { id: "patient-1", role: "patient", displayName: "Maya" },
          workspaceId: "workspace-1",
          expiresAt: "2026-07-19T12:00:00.000Z",
        },
      }),
    )

    render(<RoleEntry />)

    const patientEntry = screen.getByRole("button", { name: "Enter as Maya" })
    const clinicianEntry = screen.getByRole("button", {
      name: "Enter as Dr. Chen",
    })
    expect(patientEntry).toBeEnabled()
    expect(clinicianEntry).toBeEnabled()

    await user.tab()
    expect(patientEntry).toHaveFocus()
    await user.keyboard("{Enter}")

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/patient"))
    expect(window.sessionStorage.getItem("threadline:demo-workspace:v1")).toBe(
      "workspace-1",
    )
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/demo",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ role: "patient" }),
      }),
    )
  })

  it("reuses the browser workspace when entering the clinician role", async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(
      "threadline:demo-workspace:v1",
      "existing-workspace",
    )
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({
        data: {
          user: {
            id: "clinician-1",
            role: "clinician",
            displayName: "Dr. Chen",
          },
          workspaceId: "existing-workspace",
          expiresAt: "2026-07-19T12:00:00.000Z",
        },
      }),
    )

    render(<RoleEntry />)
    await user.click(screen.getByRole("button", { name: "Enter as Dr. Chen" }))

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith("/clinician"),
    )
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/demo",
      expect.objectContaining({
        body: JSON.stringify({
          role: "clinician",
          workspaceId: "existing-workspace",
        }),
      }),
    )
  })

  it("keeps role controls named while a request is pending", async () => {
    const user = userEvent.setup()
    let release!: (value: Response) => void
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )

    render(<RoleEntry />)
    await user.click(screen.getByRole("button", { name: "Enter as Maya" }))

    expect(screen.getByRole("button", { name: "Enter as Maya" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Enter as Dr. Chen" }),
    ).toBeDisabled()

    release(
      new Response(
        JSON.stringify({
          data: {
            user: { id: "patient-1", role: "patient", displayName: "Maya" },
            workspaceId: "workspace-1",
            expiresAt: "2026-07-19T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    await waitFor(() => expect(navigation.push).toHaveBeenCalled())
  })

  it("renders a persistent error message when role entry fails", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "DEMO_UNAVAILABLE",
            message: "Demo capacity is currently full.",
            requestId: "request-1",
          },
        },
        503,
      ),
    )

    render(<RoleEntry />)
    await user.click(screen.getByRole("button", { name: "Enter as Maya" }))

    expect(
      await screen.findByText("We could not open the demo"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Demo capacity is currently full/)).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enter as Maya" })).toBeEnabled(),
    )
  })
})
