import { expect, test, type Page } from "@playwright/test";

/**
 * Editor offers a certificate for a course -> a learner completes it -> the
 * server issues the certificate -> anyone can verify it -> revocation shows.
 * Needs the content-editor and instructor accounts from learning.spec.ts.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;
const instructor = process.env.E2E_INSTRUCTOR_EMAIL;

test.skip(!email || !password || !instructor, "E2E_EDITOR_EMAIL, E2E_EDITOR_PASSWORD and E2E_INSTRUCTOR_EMAIL are not set");

async function signIn(page: Page, user: string, pass: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((u) => u.pathname === next);
}

test("a learner who completes a course receives a verifiable certificate", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const slug = `e2e-cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E certificate course ${slug}`;

  // The content editor publishes a free one-lesson course.
  await signIn(page, email!, password!, "/admin/catalog");
  await page.getByRole("button", { name: "New course" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/catalog\/courses\/\d+$/);
  const courseUrl = page.url();
  await page.getByLabel("Subtitle").fill("Demo course with a certificate, created by an end-to-end test.");
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

  // A template and a rule: complete every lesson.
  await page.goto("/admin/certificates/templates");
  await page.getByRole("button", { name: "New template" }).click();
  const templateName = `E2E template ${slug}`;
  await page.getByRole("dialog").getByLabel("Template name").fill(templateName);
  await page.getByRole("dialog").getByLabel("Signatory name").fill("Demo Signatory");
  await page.getByRole("dialog").getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Template saved.")).toBeVisible();

  await page.getByRole("link", { name: "Course rules" }).click();
  await page.getByRole("button", { name: "Add course" }).click();
  const ruleDialog = page.getByRole("dialog");
  await ruleDialog.getByRole("combobox", { name: /^Course/ }).selectOption({ label: title });
  await ruleDialog.getByRole("combobox", { name: /^Template/ }).selectOption({ label: templateName });
  await ruleDialog.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Rule saved.")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("Issuing");
  // Wide admin tables scroll inside their card; the page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  // A learner enrolls and completes the lesson; the server issues the certificate.
  const student = await browser.newPage();
  const studentEmail = `e2e-cert-learner-${Date.now()}@example.com`;
  const studentPassword = "Correct-Horse-42";
  await student.goto(`/register?next=${encodeURIComponent(`/courses/${slug}`)}`);
  await student.getByLabel("Full name").fill("E2E Certificate Learner");
  await student.getByLabel("Email").fill(studentEmail);
  await student.getByRole("textbox", { name: "Password", exact: true }).fill(studentPassword);
  await student.getByLabel("Confirm password").fill(studentPassword);
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student).toHaveURL(/\/(dashboard|courses)/);
  await student.goto(`/courses/${slug}`);
  await student.getByRole("button", { name: "Enroll for free" }).click();
  await expect(student).toHaveURL(new RegExp(`/learn/${slug}`));

  await student.goto("/dashboard/certificates");
  await expect(student.getByText("1 of 2 requirements met")).toBeVisible();

  await student.goto(`/learn/${slug}/${lessonId}`);
  await student.getByRole("button", { name: "Mark complete" }).click();
  await expect(student.getByRole("button", { name: /Completed/ })).toBeVisible();

  await student.goto("/dashboard/certificates");
  const card = student.getByRole("listitem").filter({ hasText: title });
  await expect(card.getByText("Valid")).toBeVisible();
  const number = (await card.getByText(/^HXN-\d{4}-[0-9A-Z]{8}$/).textContent())!.trim();
  const pdf = await student.request.get(`/api/v1/me/certificates/${number}/pdf/`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await student.close();

  // Anyone can verify it; nobody else can download it.
  const visitor = await browser.newContext();
  const anon = await visitor.newPage();
  await anon.goto("/certificates/verify");
  await anon.getByLabel("Certificate number").fill(number.toLowerCase());
  await anon.getByRole("button", { name: "Verify" }).click();
  await expect(anon).toHaveURL(new RegExp(`/certificates/verify/${number}$`));
  await expect(anon.getByText("Valid certificate")).toBeVisible();
  await expect(anon.getByText("E2E Certificate Learner")).toBeVisible();
  expect([401, 403, 404]).toContain((await visitor.request.get(`/api/v1/me/certificates/${number}/pdf/`)).status());

  // The editor revokes it; verification reflects that.
  await page.goto("/admin/certificates");
  await page.getByLabel("Search certificates").fill(number);
  await page.getByRole("button", { name: `Actions for ${number}` }).click();
  await page.getByRole("menuitem", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByLabel(/^Reason/).fill("Issued by an end-to-end test.");
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText(/Certificate revoked/)).toBeVisible();

  await anon.reload();
  await expect(anon.getByText("This certificate has been revoked")).toBeVisible();
  await visitor.close();
});
