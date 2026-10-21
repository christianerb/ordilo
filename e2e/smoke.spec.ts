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
  await expect(page.getByRole("button", { name: /Loslegen/i })).toBeVisible();
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
  await expect(page.getByTestId("landing-cta-hero")).toBeVisible();
  await expect(page.getByTestId("landing-cta-hero")).toHaveAttribute(
    "href",
    /apps\.apple\.com\/de\/app\/.*6805133943/,
  );
  // Browser users retain a separate route into the web app.
  await page
    .getByRole("link", { name: "Im Browser starten", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
});

test("legal pages render their content", async ({ page }) => {
  await page.goto("/impressum");
  await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible();

  await page.goto("/datenschutz");
  await expect(
    page.getByRole("heading", { name: "Datenschutzerklärung" }),
  ).toBeVisible();
});

test("public guides expose crawlable content and canonical metadata without login", async ({
  page,
  request,
}) => {
  await page.goto("/ratgeber");
  await page
    .getByRole("link", {
      name: "Papierkram organisieren: eine Ablage für die Familie",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/ratgeber\/papierkram-organisieren-familie$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://ordilo.de/ratgeber/papierkram-organisieren-familie",
  );
  await expect(
    page.getByRole("heading", { name: "Quellen und Einordnung" }),
  ).toBeVisible();
  const response = await request.get("/ratgeber/unbekannter-artikel");
  expect(response.status()).toBe(404);
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(
    "https://ordilo.de/ratgeber/papierkram-organisieren-familie",
  );
});

test("long German guide headings and filenames fit narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const slug of [
    "familienorganisation-was-tun-wenn",
    "ordnerstruktur-private-dokumente",
  ]) {
    await page.goto(`/ratgeber/${slug}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content, slug).toBeLessThanOrEqual(widths.viewport);
  }
});
