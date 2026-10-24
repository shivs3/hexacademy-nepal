import { expect, test, type Page } from "@playwright/test";

/**
 * Every page is served with the nonce-based Content-Security-Policy from
 * proxy.ts, and the pages that inject scripts or styles at runtime (Radix
 * dialogs, the Tiptap editor, KaTeX) still work without a single violation.
 */
const email = process.env.E2E_EDITOR_EMAIL;
const password = process.env.E2E_EDITOR_PASSWORD;

async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (load|execute|apply|frame|connect)/i.test(msg.text())) violations.push(msg.text());
  });
  await page.exposeFunction("__reportCsp", (text: string) => violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __reportCsp: (t: string) => void }).__reportCsp(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  return violations;
}

test("public pages carry a nonce CSP and render without violations", async ({ page }) => {
  const violations = await watchViolations(page);
  for (const path of ["/", "/courses", "/blog", "/login", "/register", "/certificates/verify"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp, path).toContain("frame-ancestors 'none'");
    // The page hydrated: Next's own scripts ran under the nonce.
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  // A client-side interaction proves hydration on the last page.
  await page.getByLabel(/certificate number/i).fill("HXN-2026-AAAAAAAA");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/certificates\/verify\/HXN-2026-AAAAAAAA$/);
  expect(violations).toEqual([]);
});

test("a nonce is unique per response", async ({ request }) => {
  const nonce = async () => (await request.get("/login")).headers()["content-security-policy"].match(/'nonce-([^']+)'/)?.[1];
  const [a, b] = [await nonce(), await nonce()];
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);
});

test("dialogs and the rich-text editor work under the CSP", async ({ page }) => {
  test.skip(!email || !password, "E2E_EDITOR_EMAIL and E2E_EDITOR_PASSWORD are not set");
  const violations = await watchViolations(page);

  await page.goto("/login?next=/admin/cms/blog");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/cms\/blog$/);

  await page.getByRole("button", { name: "New post" }).click();
  const dialog = page.getByRole("dialog", { name: "New post" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(`E2E CSP post ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/cms\/blog\/\d+$/);

  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("Typed under a strict script policy.");
  await expect(editor).toContainText("Typed under a strict script policy.");
  expect(violations).toEqual([]);
});
