import { test, expect } from "@playwright/test";
test("all storefront designs load without horizontal overflow", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/marketplace", "/care-studio"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Health Tips", exact: true }).first(),
    ).toHaveAttribute("href", "/health-tips");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  await page.screenshot({ path: `test-results/store-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test("mobile filters stay in a modal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Filter products" });
  await expect(modal).toBeVisible();
  await modal.getByRole("combobox", { name: "Category", exact: true }).selectOption("OTC");
  await modal.getByRole("button", { name: "Apply filters" }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator(".retail-product-grid article")).toHaveCount(2);
});
test("product names have direct detail pages", async ({ page }) => {
  await page.goto("/products/vitamin-c-1000-mg");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vitamin C 1000 mg");
  await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeVisible();
});
test("business policies and Health Tips are reachable", async ({ page }) => {
  for (const [path, title] of [
    ["/about", "About us"],
    ["/contact", "Contact us"],
    ["/privacy-policy", "Privacy policy"],
    ["/refund-policy", "Refund policy"],
    ["/shipping-policy", "Shipping policy"],
    ["/health-tips", "Health Tips"],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
  }
});
test("unconfigured sign-in reports a friendly toast", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Email address").fill("customer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("testpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText(
    "service isn’t available yet",
  );
  await expect(page.getByLabel("Email address")).toHaveValue("customer@example.com");
});
test("administration requires an account and private previews are not indexed", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to ReliefPoint");
  await page.goto("/health-tips/preview/00000000-0000-4000-8000-000000000001");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
});
