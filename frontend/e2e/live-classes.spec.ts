import { expect, test, type Page } from "@playwright/test";

/**
 * Instructor schedules a live class -> enrolled batch member sees it and joins.
 * Needs the accounts from learning.spec.ts, plus the instructor's password so
 * the spec can sign in as them: E2E_INSTRUCTOR_PASSWORD.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;
const instructor = process.env.E2E_INSTRUCTOR_EMAIL;
const instructorPassword = process.env.E2E_INSTRUCTOR_PASSWORD;

test.skip(
  !email || !password || !instructor || !instructorPassword,
  "E2E_EDITOR_EMAIL, E2E_EDITOR_PASSWORD, E2E_INSTRUCTOR_EMAIL and E2E_INSTRUCTOR_PASSWORD are not set",
);

/** "YYYY-MM-DDTHH:MM" in Nepal time, `minutes` from now: what a datetime-local input takes. */
function nepalInput(minutes: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + minutes * 60_000));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

async function signIn(page: Page, user: string, pass: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((u) => u.pathname === next);
}

test("an instructor schedules a class and an enrolled batch member joins it", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const slug = `e2e-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E live course ${slug}`;

  // The content editor publishes a free course taught by the instructor.
  await signIn(page, email!, password!, "/admin/catalog");
  await page.getByRole("button", { name: "New course" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/catalog\/courses\/\d+$/);
  const courseUrl = page.url();
  await page.getByLabel("Subtitle").fill("Demo course with live classes, created by an end-to-end test.");
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
  await page.getByRole("checkbox", { name: /^Published/ }).check();
  await page.getByRole("button", { name: "Save lesson" }).click();
  await expect(page.getByText(/^Lesson saved/)).toBeVisible();

  await page.goto(courseUrl);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Course published.")).toBeVisible();

  // A student enrolls.
  const student = await browser.newPage();
  const studentEmail = `e2e-live-learner-${Date.now()}@example.com`;
  const studentPassword = "Correct-Horse-42";
  await student.goto(`/register?next=${encodeURIComponent(`/courses/${slug}`)}`);
  await student.getByLabel("Full name").fill("E2E Live Learner");
  await student.getByLabel("Email").fill(studentEmail);
  await student.getByRole("textbox", { name: "Password", exact: true }).fill(studentPassword);
  await student.getByLabel("Confirm password").fill(studentPassword);
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student).toHaveURL(/\/(dashboard|courses)/);
  await student.goto(`/courses/${slug}`);
  await student.getByRole("button", { name: "Enroll for free" }).click();
  await expect(student).toHaveURL(new RegExp(`/learn/${slug}`));

  // The instructor creates a batch, adds the student and schedules a class starting in 5 minutes.
  const teacher = await browser.newPage();
  await signIn(teacher, instructor!, instructorPassword!, "/admin/live-classes");
  await teacher.getByRole("button", { name: "New batch" }).click();
  const batchDialog = teacher.getByRole("dialog");
  await batchDialog.getByLabel("Course").selectOption({ label: title });
  await batchDialog.getByLabel("Name").fill("E2E evening cohort");
  await batchDialog.getByRole("button", { name: "Create batch" }).click();
  await expect(teacher).toHaveURL(/\/admin\/live-classes\/\d+$/);

  await teacher.getByRole("tab", { name: "Learners" }).click();
  await teacher.getByRole("button", { name: "Add by email" }).click();
  await teacher.getByRole("dialog").getByLabel("Email addresses").fill(studentEmail);
  await teacher.getByRole("dialog").getByRole("button", { name: "Add learner" }).click();
  await expect(teacher.getByText("1 added.")).toBeVisible();
  await expect(teacher.getByText(studentEmail)).toBeVisible();

  await teacher.getByRole("tab", { name: "Classes" }).click();
  await teacher.getByRole("button", { name: "Schedule class" }).click();
  const sessionDialog = teacher.getByRole("dialog");
  await sessionDialog.getByLabel("Title").fill("Live Q&A");
  await sessionDialog.getByLabel("Starts (Nepal time)").fill(nepalInput(5));
  await expect(sessionDialog.getByLabel("Ends (Nepal time)")).toHaveValue(nepalInput(65));
  await sessionDialog.getByLabel("Meeting link").fill("https://meet.google.com/abc-defg-hij");
  await sessionDialog.getByLabel("Passcode").fill("e2e-pass");
  await sessionDialog.getByRole("button", { name: "Schedule class" }).click();
  await expect(teacher.getByText("Class scheduled.")).toBeVisible();
  await teacher.getByRole("link", { name: "Live Q&A" }).click();
  await expect(teacher).toHaveURL(/\/admin\/live-classes\/sessions\/\d+$/);
  const sessionId = teacher.url().split("/").pop();
  await expect(teacher.getByRole("link", { name: /meet\.google\.com\/abc-defg-hij/ })).toBeVisible();
  await teacher.close();

  // The student sees it, and joining opens 15 minutes ahead, so it is open now.
  await student.goto("/dashboard/classes");
  await expect(student.getByText("Live Q&A")).toBeVisible();
  await student.getByRole("button", { name: "Join class" }).click();
  const joinDialog = student.getByRole("dialog");
  await expect(joinDialog.getByText("e2e-pass")).toBeVisible();
  await expect(joinDialog.getByRole("link", { name: /Open meeting/ })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  await student.close();

  // Someone outside the batch gets no link.
  const outsider = await browser.newContext();
  const res = await outsider.request.post(`/api/v1/class-sessions/${sessionId}/join/`);
  expect([401, 403]).toContain(res.status());
  await outsider.close();
});
