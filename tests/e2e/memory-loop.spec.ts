import { expect, test } from "@playwright/test";

import { apiData, enterPatientSession, finalizeReflection, sendReflection } from "./helpers";

test("completes the reviewed two-session memory loop and permanent forgetting", async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The full loop is exercised once on desktop.");
  test.setTimeout(90_000);

  await enterPatientSession(page);

  const patientIdentity = await apiData<{
    user: { id: string; role: string };
    workspace: { id: string };
  }>(await page.context().request.get("/api/me"));

  const durableStatement = "I use paced breathing before difficult work meetings.";
  await sendReflection(
    page,
    `${durableStatement} I prefer written notes after a difficult conversation.`,
  );
  await expect(page.getByText(/Thank you for sharing that/i).last()).toBeVisible();

  await finalizeReflection(page);
  await expect(page.getByRole("alert").filter({ hasText: "Review package created" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Stored transcript deleted/i)).toBeVisible();

  await page.getByRole("button", { name: "View as Dr. Chen" }).click();
  await expect(page).toHaveURL(/\/clinician$/, { timeout: 20_000 });
  const clinicianIdentity = await apiData<{
    user: { id: string; role: string };
    workspace: { id: string };
  }>(await page.context().request.get("/api/me"));
  expect(clinicianIdentity.workspace.id).toBe(patientIdentity.workspace.id);
  expect(clinicianIdentity.user.role).toBe("clinician");

  const openReview = page.getByRole("link", { name: /Open next review|Review session/ }).first();
  await expect(openReview).toBeVisible();
  await openReview.click();
  await expect(page).toHaveURL(/\/clinician\/review\?session=/);
  await expect(page.getByText("Qwen session summary")).toBeVisible();
  await expect(page.getByText(/Transcript deletion recorded after extraction/i)).toBeVisible();

  const breathingCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: durableStatement })
    .filter({ has: page.getByRole("button", { name: "Approve memory" }) });
  await expect(breathingCard).toBeVisible();
  await breathingCard.getByRole("button", { name: "Approve memory" }).click();
  await expect(page.getByText("Available for relevant future retrieval.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View as Maya" }).click();
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 });
  await expect(page.getByText(durableStatement)).toBeVisible();

  await page.locator("header").getByRole("button", { name: "Start a reflection" }).click();
  await expect(page).toHaveURL(/\/patient\/session\?session=/);
  await sendReflection(
    page,
    "The difficult work meeting is tomorrow. What practice helped me prepare for it?",
  );
  await expect(page.getByText(/I remember that i use paced breathing before difficult work meetings/i)).toBeVisible();
  const trace = page.locator("aside");
  await expect(trace.getByText(durableStatement)).toBeVisible();
  await expect(trace.getByText("deterministic-qwen-chat")).toBeVisible();

  await page.getByRole("link", { name: "Patient workspace" }).click();
  await expect(page).toHaveURL(/\/patient$/);
  const activeMemoryCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: durableStatement })
    .filter({ has: page.getByRole("button", { name: "Forget memory" }) });
  await activeMemoryCard.getByRole("button", { name: "Forget memory" }).click();
  const forgetDialog = page.getByRole("dialog", { name: "Forget this memory?" });
  await expect(forgetDialog).toBeVisible();
  await forgetDialog.getByRole("button", { name: "Forget permanently" }).click();
  await expect(activeMemoryCard).toBeHidden();

  await page.locator("header").getByRole("button", { name: "Start a reflection" }).click();
  await sendReflection(
    page,
    "The difficult work meeting is tomorrow. What practice helped me prepare for it?",
  );
  await expect(page.getByText(/Thank you for sharing that/i).last()).toBeVisible();
  const emptyTrace = page.locator("aside");
  await expect(emptyTrace.getByText("No eligible memory matched")).toBeVisible();
  await expect(
    emptyTrace.locator("dl > div").filter({ hasText: "Candidates" }).locator("dd"),
  ).toHaveText("0");
});
