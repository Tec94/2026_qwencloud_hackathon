import { expect, test } from "@playwright/test";

import { enterPatientSession } from "./helpers";

test.describe("deterministic failure presentation fixtures", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Failure UX is exercised once.");
    await enterPatientSession(page);
  });

  test("shows a stable error when a Qwen stream times out", async ({ page }) => {
    await page.route("**/api/sessions/*/messages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({
          type: "error",
          error: {
            code: "QWEN_UNAVAILABLE",
            message: "Qwen timed out in the deterministic failure fixture.",
          },
        })}\n`,
      });
    });

    const composer = page.getByRole("textbox", { name: "Share what is on your mind" });
    await composer.fill("Please reflect this back to me.");
    await page.getByRole("button", { name: "Send message" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "The session needs your attention" });
    await expect(alert).toContainText("Qwen timed out in the deterministic failure fixture.");
  });

  test("routes high-risk language to deterministic human-support guidance", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Share what is on your mind" });
    await composer.fill("I might hurt myself tonight.");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText(/Threadline cannot provide crisis care/i)).toBeVisible();
    await expect(page.getByText(/call or text 988/i)).toBeVisible();
    await expect(page.locator("aside").getByText("deterministic-safety-routing")).toBeVisible();
  });

  test("explains a public-demo rate limit without losing the draft boundary", async ({ page }) => {
    await page.route("**/api/sessions/*/messages", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "The demo turn limit has been reached. Try again later.",
            requestId: "playwright-rate-limit",
          },
        }),
      });
    });

    await page.getByRole("textbox", { name: "Share what is on your mind" }).fill("One more turn.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "The session needs your attention" }),
    ).toContainText("The demo turn limit has been reached");
  });

  test("states that a transcript is retained when extraction is malformed", async ({ page }) => {
    await page.route("**/api/sessions/*/finalize", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "EXTRACTION_FAILED",
            message: "The session is preserved and can be finalized again.",
            requestId: "playwright-extraction-failure",
          },
        }),
      });
    });

    const composer = page.getByRole("textbox", { name: "Share what is on your mind" });
    await composer.fill("My goal is to prepare for tomorrow's meeting.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("region", { name: "Reflection conversation" }),
    ).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    await page.getByRole("button", { name: "End session" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "The session needs your attention" }),
    ).toContainText("The session is preserved and can be finalized again.");
    await expect(page.getByRole("textbox", { name: "Share what is on your mind" })).toBeEnabled();
  });
});
