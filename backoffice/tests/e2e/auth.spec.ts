import { test, expect } from "@playwright/test";

// Critical end-to-end paths that do not require live Google/Supabase data:
//  - unauthenticated users are forced to the login page (middleware guard);
//  - the login page renders the sign-in form;
//  - the PWA manifest and service worker are served.

test("unauthenticated access to a protected page redirects to /login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();
  await expect(page.getByLabel("E-mailadres")).toBeVisible();
  await expect(page.getByLabel("Wachtwoord")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inloggen" }),
  ).toBeVisible();
});

test("PWA manifest is served with the app metadata", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.name).toContain("FIT UP");
  expect(body.display).toBe("standalone");
  expect(body.icons.length).toBeGreaterThan(0);
});

test("service worker script is reachable", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("javascript");
});

test("root redirects toward the dashboard (and then to login when signed out)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(login|dashboard)/);
});
