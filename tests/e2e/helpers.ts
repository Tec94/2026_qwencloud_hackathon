import AxeBuilder from "@axe-core/playwright";
import { expect, type APIResponse, type Page } from "@playwright/test";

export const APP_ORIGIN = "http://127.0.0.1:4173";

export async function enterPatientSession(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as Maya" }).click();
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 });
  await page.locator("header").getByRole("button", { name: "Start a reflection" }).click();
  await expect(page).toHaveURL(/\/patient\/session\?session=/, { timeout: 20_000 });
  const composer = page.getByRole("textbox", { name: "Share what is on your mind" });
  await expect(composer).toBeVisible();
  await expect(composer).toBeEnabled({ timeout: 20_000 });
}

export async function sendReflection(page: Page, content: string): Promise<void> {
  const composer = page.getByRole("textbox", { name: "Share what is on your mind" });
  const send = page.getByRole("button", { name: "Send message" });
  await composer.fill(content);
  await send.click();
  await expect(
    page.getByRole("region", { name: "Reflection conversation" }),
  ).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
}

export async function apiData<T>(response: APIResponse): Promise<T> {
  const payload = (await response.json()) as { data: T } | T;
  return payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload;
}

export async function finalizeReflection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "End & create review" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "End & create review" }).click();
}

export async function expectNoWcagAaViolations(
  page: Page,
  surface: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`,
    )
    .join("\n");

  expect(results.violations, `${surface} accessibility violations:\n${summary}`).toEqual([]);
}
