// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BrandLink } from "./brand"

describe("BrandLink", () => {
  afterEach(cleanup)

  it("links the full brand and descriptive line to Threadline home", () => {
    const { container } = render(<BrandLink />)

    const home = screen.getByRole("link", { name: "Threadline home" })
    expect(home).toHaveAttribute("href", "/")
    expect(home).toHaveAccessibleName("Threadline home")
    expect(screen.getByText("Threadline")).toBeVisible()
    expect(screen.getByText("continuity you can inspect")).toBeVisible()
    expect(container.querySelector("svg[aria-hidden='true']")).toBeInTheDocument()
  })

  it("keeps the compact brand link named while omitting the descriptive line", () => {
    render(<BrandLink compact />)

    const home = screen.getByRole("link", { name: "Threadline home" })
    expect(home).toHaveAttribute("href", "/")
    expect(screen.getByText("Threadline")).toBeVisible()
    expect(
      screen.queryByText("continuity you can inspect"),
    ).not.toBeInTheDocument()
  })
})
