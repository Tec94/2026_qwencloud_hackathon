import { expect, test } from "@playwright/test";

import { APP_ORIGIN, apiData } from "./helpers";

test("denies cross-role mutations and untrusted origins", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Authorization is exercised once.");
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as Maya" }).click();
  await expect(page).toHaveURL(/\/patient$/, { timeout: 20_000 });

  const createResponse = await page.context().request.post("/api/sessions", {
    data: {},
    headers: { Origin: APP_ORIGIN },
  });
  expect(createResponse.status()).toBe(201);
  const created = await apiData<{ session: { id: string } }>(createResponse);

  const originAttack = await page.context().request.post("/api/sessions", {
    data: {},
    headers: { Origin: "https://attacker.invalid" },
  });
  expect(originAttack.status()).toBe(403);
  expect((await originAttack.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");

  const switchResponse = await page.context().request.post("/api/auth/demo", {
    data: { role: "clinician" },
    headers: { Origin: APP_ORIGIN },
  });
  expect(switchResponse.ok()).toBe(true);

  const forbiddenFinalize = await page.context().request.post(
    `/api/sessions/${created.session.id}/finalize`,
    { data: {}, headers: { Origin: APP_ORIGIN } },
  );
  expect(forbiddenFinalize.status()).toBe(403);
  expect((await forbiddenFinalize.json()).error.code).toBe("FORBIDDEN");

  const forbiddenStream = await page.context().request.post(
    `/api/sessions/${created.session.id}/messages`,
    {
      data: { content: "A clinician must not be able to write as the patient." },
      headers: { Origin: APP_ORIGIN, Accept: "application/x-ndjson" },
    },
  );
  expect(forbiddenStream.status()).toBe(200);
  expect(await forbiddenStream.text()).toContain('"code":"FORBIDDEN"');
});

test("does not disclose a session across isolated demo workspaces", async (
  { browser },
  testInfo,
) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Workspace isolation is exercised once.");
  const firstContext = await browser.newContext({ baseURL: APP_ORIGIN });
  const secondContext = await browser.newContext({ baseURL: APP_ORIGIN });

  try {
    const firstPage = await firstContext.newPage();
    await firstPage.goto("/");
    await firstPage.getByRole("button", { name: "Enter as Maya" }).click();
    await expect(firstPage).toHaveURL(/\/patient$/, { timeout: 20_000 });
    const createResponse = await firstContext.request.post("/api/sessions", {
      data: {},
      headers: { Origin: APP_ORIGIN },
    });
    const created = await apiData<{ session: { id: string } }>(createResponse);

    const secondPage = await secondContext.newPage();
    await secondPage.goto("/");
    await secondPage.getByRole("button", { name: "Enter as Maya" }).click();
    await expect(secondPage).toHaveURL(/\/patient$/, { timeout: 20_000 });

    const crossWorkspaceRead = await secondContext.request.get(
      `/api/sessions/${created.session.id}`,
    );
    expect(crossWorkspaceRead.status()).toBe(404);
    expect((await crossWorkspaceRead.json()).error.code).toBe("NOT_FOUND");
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});
