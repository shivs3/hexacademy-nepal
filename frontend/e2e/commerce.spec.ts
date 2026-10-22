import { expect, test } from "@playwright/test";

/**
 * Paid course -> checkout -> sandbox gateway -> verified payment -> enrollment.
 * Needs the same accounts as learning.spec.ts, and the backend started with the
 * development-only sandbox provider:
 *
 *   PAYMENTS_ENABLE_SANDBOX=true PAYMENTS_SANDBOX_SECRET=<random> python manage.py runserver
 *
 * The test skips itself when the sandbox provider is not offered.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;
const instructor = process.env.E2E_INSTRUCTOR_EMAIL;

test.skip(!email || !password || !instructor, "E2E_EDITOR_EMAIL, E2E_EDITOR_PASSWORD and E2E_INSTRUCTOR_EMAIL are not set");

test("a student buys a paid course through the sandbox gateway and gains access", async ({ page, browser, request }) => {
  test.setTimeout(120_000);
  const methods = await (await request.get("/api/v1/payments/methods/")).json();
  test.skip(!methods.sandbox, "The sandbox payment provider is not enabled on the backend");

  const slug = `e2e-paid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E paid course ${slug}`;

  await page.goto("/login?next=/admin/catalog");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/catalog$/);

  await page.getByRole("button", { name: "New course" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/catalog\/courses\/\d+$/);
  const courseUrl = page.url();

  await page.getByLabel("Subtitle").fill("Demo paid course created by an end-to-end test.");
  await page.getByLabel("Price (NPR)", { exact: true }).fill("1500");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.getByRole("tab", { name: /^Teaching team/ }).click();
  await page.getByLabel("Search staff").fill(instructor!);
  await page.getByRole("button", { name: new RegExp(instructor!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await page.getByRole("button", { name: "Save team" }).click();
  await expect(page.getByText(/team saved/i)).toBeVisible();

  await page.getByRole("tab", { name: /^Curriculum/ }).click();
  await page.getByRole("button", { name: "Add module" }).first().click();
  await page.getByRole("dialog").getByLabel("Title").fill("Getting started");
  await page.getByRole("dialog").getByRole("button", { name: "Add module" }).click();
  await page.getByRole("button", { name: "Add lesson" }).first().click();
  await page.getByRole("dialog").getByLabel("Title").fill("Welcome");
  await page.getByRole("dialog").getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/\/admin\/catalog\/lessons\/\d+$/);
  const lessonId = page.url().split("/").pop();
  await page.getByRole("checkbox", { name: /^Published/ }).check();
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByText(/^Lesson saved/)).toBeVisible();

  await page.goto(courseUrl);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Course published.")).toBeVisible();

  const student = await browser.newPage();
  const studentPassword = "Correct-Horse-42";
  await student.goto(`/register?next=${encodeURIComponent(`/courses/${slug}`)}`);
  await student.getByLabel("Full name").fill("E2E Buyer");
  await student.getByLabel("Email").fill(`e2e-buyer-${Date.now()}@example.com`);
  await student.getByRole("textbox", { name: "Password", exact: true }).fill(studentPassword);
  await student.getByLabel("Confirm password").fill(studentPassword);
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student).toHaveURL(/\/(dashboard|courses)/);

  await student.goto(`/courses/${slug}`);
  expect((await student.request.get(`/api/v1/lessons/${lessonId}/`)).status()).toBe(403);

  await student.getByRole("link", { name: "Buy now" }).click();
  await expect(student).toHaveURL((u) => u.pathname === "/checkout");
  await student.getByRole("radio", { name: /Test payment/ }).check();
  await student.getByRole("button", { name: "Continue to payment" }).click();

  await expect(student).toHaveURL(/\/checkout\/sandbox\//);
  await student.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(student).toHaveURL(/\/checkout\/complete\//);
  await expect(student.getByText("Payment confirmed")).toBeVisible();

  expect((await student.request.get(`/api/v1/lessons/${lessonId}/`)).status()).toBe(200);
  await student.getByRole("link", { name: "Start learning" }).click();
  await expect(student).toHaveURL(new RegExp(`/learn/${slug}`));

  await student.goto("/dashboard/orders");
  await expect(student.getByText(title).first()).toBeVisible();
  await expect(student.getByText("Paid", { exact: true }).first()).toBeVisible();
  await student.close();
});
