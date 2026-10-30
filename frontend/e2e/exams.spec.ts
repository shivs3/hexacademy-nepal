import { type APIRequestContext, expect, test } from "@playwright/test";

import { axeViolations } from "./axe";

/**
 * Question bank -> exam builder -> publish -> a learner takes the exam -> the
 * server grades it. Uses the content editor account from cms.spec.ts, which
 * also needs the exam coordinator role in the disposable test database:
 *
 *   python manage.py grant_role e2e-editor@example.com --role exam_coordinator
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;

test.skip(!email || !password, "E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD are not set");

async function csrf(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/v1/auth/csrf/");
  return ((await res.json()) as { csrf_token: string }).csrf_token;
}

test("a coordinator publishes an exam and a learner's attempt is graded by the server", async ({ page, browser }) => {
  // A long journey across two accounts; a cold dev server compiles each route on first visit.
  test.setTimeout(120_000);
  const tag = `e2e${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const slug = `e2e-exam-${tag}`;
  const title = `E2E demo exam ${tag}`;

  await page.goto("/login?next=/admin/assessments/exams");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Matched on the path: the login URL's ?next= also ends with the target.
  await page.waitForURL((url) => url.pathname === "/admin/assessments/exams");

  // Bank setup goes through the admin API; the bank editor UI is covered by component tests.
  const headers = { "X-CSRFToken": await csrf(page.request) };
  const subject = await page.request.post("/api/v1/admin/assessments/subjects/", { headers, data: { name: `Demo subject ${tag}`, slug: `demo-${tag}` } });
  expect(subject.status(), await subject.text()).toBe(201);
  const subjectId = ((await subject.json()) as { id: number }).id;
  const questions = [
    { prompt: `<p>${tag} What is 2 + 2?</p>`, options: [{ text: "<p>3</p>", is_correct: false }, { text: "<p>4</p>", is_correct: true }] },
    { prompt: `<p>${tag} Is 7 a prime number?</p>`, kind: "true_false", options: [{ text: "True", is_correct: true }, { text: "False", is_correct: false }] },
  ];
  for (const q of questions) {
    const res = await page.request.post("/api/v1/admin/assessments/questions/", {
      headers,
      data: { subject: subjectId, kind: "single", status: "active", difficulty: "easy", default_marks: "1", tags: ["demo"], ...q },
    });
    expect(res.status(), await res.text()).toBe(201);
  }

  await page.getByRole("button", { name: "New exam" }).first().click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Address").fill(slug);
  await page.getByLabel("Duration (minutes)").fill("15");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/assessments\/exams\/\d+$/);

  await page.locator("#exam-instructions").click();
  await page.keyboard.type("Demo exam created by an end-to-end test. Answer both questions.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.getByRole("tab", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Add questions" }).first().click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search questions").fill(tag);
  await expect(picker.getByRole("checkbox", { name: /^Select question/ })).toHaveCount(2);
  for (const box of await picker.getByRole("checkbox", { name: /^Select question/ }).all()) await box.check();
  await picker.getByRole("button", { name: "Add 2 questions" }).click();
  await page.getByRole("button", { name: "Save list" }).click();
  await expect(page.getByText("Question list saved.")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Exam published.")).toBeVisible();

  // A new learner takes the exam.
  // axe needs a page from an explicit context.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  const studentPassword = "Correct-Horse-42";
  await student.goto(`/register?next=${encodeURIComponent(`/dashboard/exams/${slug}`)}`);
  await student.getByLabel("Full name").fill("E2E Exam Learner");
  await student.getByLabel("Email").fill(`e2e-examinee-${tag}@example.com`);
  await student.getByRole("textbox", { name: "Password", exact: true }).fill(studentPassword);
  await student.getByLabel("Confirm password").fill(studentPassword);
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Create account" }).click();
  await student.waitForURL((url) => url.pathname.startsWith("/dashboard"));
  await student.goto(`/dashboard/exams/${slug}`);
  await expect(student.getByRole("heading", { name: title })).toBeVisible();

  await student.getByRole("button", { name: "Start exam" }).click();
  await student.getByRole("dialog").getByRole("button", { name: "Start" }).click();
  await expect(student).toHaveURL(/\/exam\/\d+$/);
  const attemptId = student.url().split("/").pop();

  // The attempt payload never carries the answer key.
  const payload = await (await student.request.get(`/api/v1/attempts/${attemptId}/`)).text();
  expect(payload).not.toContain("is_correct");
  expect(payload).not.toContain("answer_key");

  // Shuffling is off by default, so the order matches the bank. Answer the first correctly, the second wrongly.
  await expect(student.getByText("Question 1 of 2")).toBeVisible();
  const firstSave = student.waitForResponse((r) => r.url().includes("/answers/") && r.request().method() === "PUT");
  await student.getByRole("radio", { name: /Option B/ }).check();
  expect((await firstSave).status()).toBe(200);
  await expect(student.getByText("All answers saved")).toBeVisible();

  // A reload resumes the attempt with the saved answer.
  await student.reload();
  await expect(student.getByText("Question 2 of 2")).toBeVisible();
  // On small screens the question list sits behind a toggle.
  const listToggle = student.getByRole("button", { name: "Questions", exact: true });
  if (await listToggle.isVisible()) await listToggle.click();
  await student.getByRole("button", { name: "Question 1, answered" }).click();
  await expect(student.getByRole("radio", { name: /Option B/ })).toBeChecked();
  // The player with an answered question and a selected option meets WCAG A/AA.
  expect(await axeViolations(student)).toEqual([]);

  await student.getByRole("button", { name: "Next", exact: true }).click();
  const secondSave = student.waitForResponse((r) => r.url().includes("/answers/") && r.request().method() === "PUT");
  await student.getByRole("radio", { name: /Option B/ }).check();
  expect((await secondSave).status()).toBe(200);
  await student.getByRole("button", { name: "Review and submit" }).click();
  await student.getByRole("dialog").getByRole("button", { name: "Submit now" }).click();

  await expect(student).toHaveURL(new RegExp(`/dashboard/exams/results/${attemptId}$`));
  await expect(student.getByText("Your score")).toBeVisible();
  await expect(student.getByRole("region", { name: "Score" })).toContainText("1 / 2");

  // Answers cannot change after submission.
  const late = await student.request.put(`/api/v1/attempts/${attemptId}/answers/1/`, {
    headers: { "X-CSRFToken": await csrf(student.request) },
    data: { selected: [], flagged: false },
  });
  expect([404, 409]).toContain(late.status());

  // The dashboard renders with a graded attempt (its history chart once crashed the page).
  const pageErrors: string[] = [];
  student.on("pageerror", (e) => pageErrors.push(e.message));
  await student.goto("/dashboard");
  await expect(student.getByRole("heading", { level: 1 })).toContainText("Hello");
  await student.goto("/dashboard/exams");
  await expect(student.getByRole("heading", { name: "Exams", level: 1 })).toBeVisible();
  expect(pageErrors).toEqual([]);

  // Another user cannot read this attempt.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto("/login");
  const anon = await strangerPage.request.get(`/api/v1/attempts/${attemptId}/result/`);
  expect([401, 403]).toContain(anon.status());
  const coordinatorView = await page.request.get(`/api/v1/attempts/${attemptId}/`);
  expect(coordinatorView.status()).toBe(404);
  await stranger.close();
  await studentContext.close();
});
