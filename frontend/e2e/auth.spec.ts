import { expect, test } from "@playwright/test";

const password = "Correct-Horse-42";

test("register, edit profile, sign out and sign back in", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Student");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome, E2E/ })).toBeVisible();
  await expect(page.getByText("Verify your email address")).toBeVisible();

  await page.goto("/dashboard/profile");
  await page.getByLabel("City").fill("Lalitpur");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  // Students cannot reach the staff area.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);

  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click(); // mobile: sign out lives in the drawer
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile/);
  await expect(page.getByLabel("City")).toHaveValue("Lalitpur");
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
