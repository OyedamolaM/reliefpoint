import { test, expect } from "@playwright/test";

test("mobile navigation opens styled account forms and closes on navigation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Store navigation" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: /Sign in \/ Register/ }).click();
  await expect(menu).toBeHidden();
  const account = page.getByRole("dialog", { name: "Your account", exact: true });
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "Switch to create account" }).click();
  await expect(account.getByLabel("Full name", { exact: true })).toBeVisible();
  await account.getByLabel("Password", { exact: true }).fill("testpassword123");
  await account.getByLabel("Confirm password", { exact: true }).fill("testpassword123");
  await account.getByRole("button", { name: "Switch to sign in" }).click();
  await expect(account.getByLabel("Full name", { exact: true })).toHaveCount(0);
  await account.getByRole("button", { name: "Forgot password?" }).click();
  await expect(account.getByRole("button", { name: "Send reset link" })).toBeVisible();
  await page.screenshot({ path: `test-results/account-modal-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.screenshot({ path: `test-results/mobile-menu-${info.project.name}.png` });
  await menu.getByRole("link", { name: "Health Tips", exact: true }).click();
  await expect(page).toHaveURL(/\/health-tips/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
