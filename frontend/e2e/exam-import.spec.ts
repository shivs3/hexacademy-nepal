import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * A coordinator loads a whole model test into a new exam from one CSV: the
 * questions land in the bank and in the exam, and the exam can be published.
 * Same account and roles as exams.spec.ts.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;

test.skip(!email || !password, "E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD are not set");

async function csrf(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/v1/auth/csrf/");
  return ((await res.json()) as { csrf_token: string }).csrf_token;
}

test("a CSV import fills a new exam and its questions join the bank", async ({ page }) => {
  test.setTimeout(90_000);
  const tag = `e2e${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  await page.goto("/login?next=/admin/assessments/exams");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/assessments/exams");

  const subject = await page.request.post("/api/v1/admin/assessments/subjects/", {
    headers: { "X-CSRFToken": await csrf(page.request) },
    data: { name: `Demo subject ${tag}`, slug: `demo-${tag}` },
  });
  expect(subject.status(), await subject.text()).toBe(201);

  await page.getByRole("button", { name: "New exam" }).first().click();
  await page.getByLabel("Title").fill(`E2E model test ${tag}`);
  await page.getByLabel("Address").fill(`e2e-model-${tag}`);
  await page.getByLabel("Duration (minutes)").fill("20");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/assessments\/exams\/\d+$/);
  await page.locator("#exam-instructions").click();
  await page.keyboard.type("Model test imported by an end-to-end test.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.getByRole("tab", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Import CSV" }).first().click();
  const dialog = page.getByRole("dialog");
  const csv = [
    "subject,kind,question,option_a,option_b,option_c,correct,explanation,marks,negative_marks",
    `demo-${tag},single,"${tag} Evaluate \\(\\int_0^1 2x\\,dx\\)",0,1,2,B,Area of a triangle,2,0.5`,
    `demo-${tag},true_false,${tag} 7 is prime,,,,true,,2,0.5`,
  ].join("\n");
  await dialog.getByLabel("File").setInputFiles({ name: "model-test.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await dialog.getByRole("button", { name: "Check file" }).click();
  await expect(dialog.getByText("2 of 2 rows are ready to import.")).toBeVisible();
  await dialog.getByRole("button", { name: "Import 2 questions" }).click();
  await expect(dialog.getByText("2 questions saved to the bank and added to the exam.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("2 questions · 4 marks in total")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();

  // The questions are in the bank too, ready to use elsewhere.
  const bank = await page.request.get(`/api/v1/admin/assessments/questions/?search=${tag}`);
  const listed = (await bank.json()) as { results: { status: string }[] };
  expect(listed.results.map((q) => q.status)).toEqual(["active", "active"]);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Exam published.")).toBeVisible();
});
