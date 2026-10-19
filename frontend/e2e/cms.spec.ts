import { expect, test } from "@playwright/test";

/**
 * Needs a content editor (or super admin) account in the disposable test
 * database, for example:
 *
 *   python manage.py createsuperuser --email e2e-editor@example.com
 *   python manage.py grant_role e2e-editor@example.com --role content_editor
 *
 * and E2E_EDITOR_EMAIL / E2E_EDITOR_PASSWORD in the environment.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;

test.skip(!email || !password, "E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD are not set");

test("an editor publishes a page and a visitor sees it", async ({ page, browser }) => {
  const slug = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const heading = `Demo heading ${slug}`;

  await page.goto("/login?next=/admin/cms/pages");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/cms\/pages$/);

  await page.getByRole("button", { name: "New page" }).click();
  await page.getByLabel("Title").fill("E2E demo page");
  await page.getByLabel("Address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/cms\/pages\/\d+$/);

  await page.getByRole("button", { name: "Add a section" }).click();
  await page.getByRole("button", { name: /^Call to action/ }).click();
  await page.getByRole("textbox", { name: "Heading", exact: true }).fill(heading);
  await page.getByRole("textbox", { name: "Button label", exact: true }).fill("Browse courses");
  await page.getByRole("textbox", { name: "Button link", exact: true }).fill("/courses");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // Drafts are not public.
  const visitor = await browser.newPage();
  const draftResponse = await visitor.goto(`/${slug}`);
  expect(draftResponse?.status()).toBe(404);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Page published.")).toBeVisible();

  const response = await visitor.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(visitor.getByRole("heading", { name: heading })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Browse courses" })).toHaveAttribute("href", "/courses");
  await visitor.close();
});
