import { expect, test } from "@playwright/test";

import { axeViolations as violations } from "./axe";

/** Automated WCAG 2.1 A/AA checks (see ./axe.ts for what they cover). */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;

for (const path of ["/", "/courses", "/blog", "/login", "/register", "/forgot-password", "/certificates/verify"]) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });
}

test("a course page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/courses");
  const card = page.locator('main a[href^="/courses/"]').first();
  test.skip((await card.count()) === 0, "No published course to open");
  await card.click();
  await expect(page).toHaveURL(/\/courses\/[^/?]+$/);
  await page.waitForLoadState("networkidle");
  expect(await violations(page)).toEqual([]);
});

test("signed-in pages have no WCAG A/AA violations", async ({ page }) => {
  test.skip(!email || !password, "E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD are not set");
  await page.goto("/login?next=/admin");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const paths = [
    "/dashboard", "/dashboard/courses", "/dashboard/exams", "/dashboard/orders", "/dashboard/certificates",
    "/dashboard/notifications", "/dashboard/profile",
    "/admin", "/admin/cms/pages", "/admin/cms/blog", "/admin/cms/media", "/admin/cms/menus", "/admin/cms/settings",
    "/admin/catalog", "/admin/catalog/categories",
  ];
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    expect(await violations(page), path).toEqual([]);
  }
});
