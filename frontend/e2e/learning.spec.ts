import { expect, test } from "@playwright/test";

/**
 * Catalog -> enrollment -> lesson -> saved progress. Reuses the content editor
 * from cms.spec.ts (content editors manage the catalog) and needs an account
 * with the instructor role in the disposable test database:
 *
 *   python manage.py grant_role e2e-instructor@example.com --role instructor
 *
 * and E2E_EDITOR_EMAIL / E2E_EDITOR_PASSWORD / E2E_INSTRUCTOR_EMAIL in the environment.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;
const instructor = process.env.E2E_INSTRUCTOR_EMAIL;

test.skip(!email || !password || !instructor, "E2E_EDITOR_EMAIL, E2E_EDITOR_PASSWORD and E2E_INSTRUCTOR_EMAIL are not set");

test("a manager publishes a free course and a student enrolls and saves progress", async ({ page, browser }) => {
  const slug = `e2e-course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E demo course ${slug}`;

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

  await page.getByLabel("Subtitle").fill("Demo content created by an end-to-end test.");
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

  // A new student finds the course, enrolls and completes the lesson.
  const student = await browser.newPage();
  const studentEmail = `e2e-learner-${Date.now()}@example.com`;
  const studentPassword = "Correct-Horse-42";
  await student.goto(`/register?next=${encodeURIComponent(`/courses/${slug}`)}`);
  await student.getByLabel("Full name").fill("E2E Learner");
  await student.getByLabel("Email").fill(studentEmail);
  await student.getByRole("textbox", { name: "Password", exact: true }).fill(studentPassword);
  await student.getByLabel("Confirm password").fill(studentPassword);
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student).toHaveURL(/\/(dashboard|courses)/);

  await student.goto(`/courses?search=${encodeURIComponent(slug)}`);
  await student.getByRole("link", { name: title }).first().click();
  await expect(student).toHaveURL(new RegExp(`/courses/${slug}$`));

  // The lesson is closed before enrolling.
  const closed = await student.request.get(`/api/v1/lessons/${lessonId}/`);
  expect(closed.status()).toBe(403);

  await student.getByRole("button", { name: "Enroll for free" }).click();
  await expect(student).toHaveURL(new RegExp(`/learn/${slug}`));
  await student.goto(`/learn/${slug}/${lessonId}`);
  await student.getByRole("button", { name: "Mark complete" }).click();
  await expect(student.getByRole("button", { name: /Completed/ })).toBeVisible();

  // Progress is stored on the server, so it survives a reload.
  await student.reload();
  await expect(student.getByRole("button", { name: /Completed/ })).toHaveAttribute("aria-pressed", "true");
  await student.goto("/dashboard/courses");
  await expect(student.getByText("1 of 1 lessons · 100%").or(student.getByText(/^Completed/)).first()).toBeVisible();
  await student.close();
});
