import { test, expect } from "@playwright/test";

/**
 * Smoke: the built app boots and serves its public surface.
 *
 * No login — CI has no real Supabase. These tests catch the class of
 * failure unit tests can't: broken middleware, a route that 500s on
 * boot, a missing manifest, a build that renders nothing.
 */

test("unauthenticated visit to a protected route redirects to /login", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders the email form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Loslegen/i }),
  ).toBeVisible();
});

test("PWA manifest is served and names the app", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.short_name).toBe("Ordilo");
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("PWA icons referenced by the manifest actually resolve", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.ok(), `icon ${icon.src}`).toBeTruthy();
  }
});

test("unauthenticated visit to / shows the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByTestId("landing-cta-hero"),
  ).toBeVisible();
  // The CTA leads into the login flow.
  await page.getByTestId("landing-cta-hero").click();
  await expect(page).toHaveURL(/\/login/);
});

test("legal pages render with their placeholder notice", async ({ page }) => {
  for (const path of ["/impressum", "/datenschutz"]) {
    await page.goto(path);
    await expect(
      page.getByTestId("legal-placeholder-notice"),
      `placeholder notice on ${path}`,
    ).toBeVisible();
  }
});
