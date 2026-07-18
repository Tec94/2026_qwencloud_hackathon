import { expect, test } from "@playwright/test";

import {
  expectNoWcagAaViolations,
  enterPatientSession,
  sendReflection,
} from "./helpers";

test("landing page has no automated WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoWcagAaViolations(page, "landing page");
});

test("role entry is operable by keyboard with a visible focus indicator", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Keyboard flow is covered once on desktop.");
  await page.goto("/");
  const patientEntry = page.getByRole("button", { name: "Enter as Maya" });

  for (let index = 0; index < 12; index += 1) {
    if (await patientEntry.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }

  await expect(patientEntry).toBeFocused();
  const focusStyle = await patientEntry.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(focusStyle.height).toBeGreaterThanOrEqual(44);
  expect(
    focusStyle.outlineStyle !== "none" || focusStyle.boxShadow !== "none",
    "Keyboard focus must have a visible outline or ring.",
  ).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 });
});

test("reduced-motion preference removes transform feedback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);

  const patientEntry = page.getByRole("button", { name: "Enter as Maya" });
  const motionStyle = await patientEntry.evaluate((element) => {
    const style = getComputedStyle(element);
    return { scale: style.scale, translate: style.translate };
  });
  expect(["1", "none"]).toContain(motionStyle.scale);
  expect(motionStyle.translate).toBe("none");
});

test("patient dashboard and clinician review have no automated WCAG A/AA violations", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Primary role surfaces are audited once.");
  test.setTimeout(60_000);

  await page.goto("/");
  await page.getByRole("button", { name: "Enter as Maya" }).click();
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 });
  await expect(page.locator("header").getByRole("button", { name: "Start a reflection" })).toBeEnabled();
  await expectNoWcagAaViolations(page, "patient dashboard");

  await page.locator("header").getByRole("button", { name: "Start a reflection" }).click();
  await expect(
    page.getByRole("textbox", { name: "Share what is on your mind" }),
  ).toBeEnabled({ timeout: 20_000 });
  await sendReflection(page, "Paced breathing helps me prepare for difficult meetings.");
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Session ready for review" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Switch role" }).click();
  await expect(page).toHaveURL(/\/clinician$/, { timeout: 20_000 });
  const openReview = page.getByRole("link", { name: /Open next review|Review session/ }).first();
  await expect(openReview).toBeVisible();
  await expectNoWcagAaViolations(page, "clinician dashboard");

  await openReview.click();
  await expect(page.getByText("Qwen session summary")).toBeVisible();
  await expectNoWcagAaViolations(page, "clinician review");
});

test("mobile session exposes Memory Trace in an accessible sheet without overflow", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "This assertion targets the mobile layout.");
  await enterPatientSession(page);

  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.viewport + 1);

  await page.getByRole("button", { name: "Memory Trace" }).click();
  const traceSheet = page.getByRole("dialog", { name: "Memory Trace" });
  await expect(traceSheet).toBeVisible();
  await expect(traceSheet.getByText("No approved context selected")).toBeVisible();
  await expectNoWcagAaViolations(page, "mobile Memory Trace sheet");
});
