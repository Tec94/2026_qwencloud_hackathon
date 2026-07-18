// @vitest-environment jsdom

import type { ReactNode } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import { AppShell } from "./app-shell"

const shellMocks = vi.hoisted(() => ({
  pathname: "/patient",
  push: vi.fn(),
  refresh: vi.fn(),
  enterDemo: vi.fn(),
}))

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => shellMocks.pathname,
  useRouter: () => ({
    push: shellMocks.push,
    refresh: shellMocks.refresh,
  }),
}))

vi.mock("./api-client", async () => {
  const actual = await vi.importActual<typeof import("./api-client")>(
    "./api-client",
  )
  return { ...actual, enterDemo: shellMocks.enterDemo }
})

function renderShell(role: "patient" | "clinician", pathname: string) {
  shellMocks.pathname = pathname
  return render(
    <TooltipProvider delayDuration={0}>
      <AppShell role={role}>
        <main>Workspace content</main>
      </AppShell>
    </TooltipProvider>,
  )
}

describe("AppShell", () => {
  let responsiveUtilityStyle: HTMLStyleElement

  beforeEach(() => {
    shellMocks.pathname = "/patient"
    shellMocks.push.mockReset()
    shellMocks.refresh.mockReset()
    shellMocks.enterDemo.mockReset()
    window.sessionStorage.clear()

    // JSDOM does not load Tailwind's generated responsive utilities. Simulate
    // the desktop state so only one of the duplicated responsive labels is in
    // the accessibility tree, matching the browser-rendered control.
    responsiveUtilityStyle = document.createElement("style")
    responsiveUtilityStyle.textContent = ".sm\\:hidden { display: none; }"
    document.head.append(responsiveUtilityStyle)
  })

  afterEach(() => {
    cleanup()
    responsiveUtilityStyle.remove()
  })

  it("marks the nested patient reflection route as the current page", () => {
    renderShell("patient", "/patient/session/session-1")

    expect(
      screen.getByRole("navigation", { name: "patient navigation" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    )
    expect(
      screen.getByRole("link", { name: "Reflection" }),
    ).toHaveAttribute("aria-current", "page")
    expect(screen.getByText("patient view")).toBeVisible()
  })

  it("marks the clinician queue root without treating review as active", () => {
    renderShell("clinician", "/clinician")

    expect(
      screen.getByRole("navigation", { name: "clinician navigation" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Review queue" }),
    ).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByRole("link", { name: "Session review" }),
    ).not.toHaveAttribute("aria-current")
    expect(screen.getByText("clinician view")).toBeVisible()
  })

  it("switches from patient to clinician with the exact accessible action", async () => {
    const user = userEvent.setup()
    shellMocks.enterDemo.mockResolvedValue({
      user: {
        id: "clinician-1",
        role: "clinician",
        displayName: "Dr. Chen",
      },
      workspaceId: "workspace-1",
      expiresAt: "2026-07-19T12:00:00.000Z",
    })
    renderShell("patient", "/patient")

    const switchRole = screen.getByRole("button", { name: "Switch role" })
    expect(switchRole).toHaveAccessibleName("Switch role")
    await user.click(switchRole)

    await waitFor(() => expect(shellMocks.enterDemo).toHaveBeenCalledWith("clinician"))
    await waitFor(() => expect(shellMocks.push).toHaveBeenCalledWith("/clinician"))
    expect(window.sessionStorage.getItem("threadline:demo-workspace:v1")).toBe(
      "workspace-1",
    )
    expect(shellMocks.refresh).toHaveBeenCalledOnce()
  })

  it("switches from clinician to patient and preserves the returned workspace", async () => {
    const user = userEvent.setup()
    shellMocks.enterDemo.mockResolvedValue({
      user: { id: "patient-1", role: "patient", displayName: "Maya" },
      workspaceId: "workspace-2",
      expiresAt: "2026-07-19T12:00:00.000Z",
    })
    renderShell("clinician", "/clinician")

    await user.click(screen.getByRole("button", { name: "Switch role" }))

    await waitFor(() => expect(shellMocks.enterDemo).toHaveBeenCalledWith("patient"))
    await waitFor(() => expect(shellMocks.push).toHaveBeenCalledWith("/patient"))
    expect(window.sessionStorage.getItem("threadline:demo-workspace:v1")).toBe(
      "workspace-2",
    )
    expect(shellMocks.refresh).toHaveBeenCalledOnce()
  })

  it("returns to role selection when the opposite-role request fails", async () => {
    const user = userEvent.setup()
    shellMocks.enterDemo.mockRejectedValue(new Error("Demo unavailable"))
    renderShell("patient", "/patient")

    const switchRole = screen.getByRole("button", { name: "Switch role" })
    await user.click(switchRole)

    await waitFor(() => expect(shellMocks.push).toHaveBeenCalledWith("/"))
    expect(shellMocks.refresh).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem("threadline:demo-workspace:v1")).toBeNull()
  })
})
