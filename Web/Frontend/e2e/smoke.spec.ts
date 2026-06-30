import { test, expect } from "@playwright/test";

// Backend-free smoke test: proves the SPA boots, routes, and runs client-side
// validation. No API is called until the form passes validation, so these are
// deterministic without a running backend.
test.describe("login page", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("shows client-side validation errors on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Login" }).click();
    // validate() runs before any fetch — these come from the client, not the server.
    await expect(page.getByText("Email required")).toBeVisible();
    await expect(page.getByText("Password required")).toBeVisible();
  });

  test("can navigate to the register page", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Register", { exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
  });
});
