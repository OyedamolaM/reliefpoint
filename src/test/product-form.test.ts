import { describe, expect, it } from "vitest";
import { productSchema } from "@/lib/contracts";

const essentials = {
  name: "Vitamin C 1000 mg",
  category: "Vitamins",
  price_kobo: 650000,
  image: "https://example.supabase.co/storage/v1/object/public/pharmacy-media/vitamin.webp",
};
describe("simplified product details", () => {
  it("accepts essentials and generates optional fields without inventing medicine instructions", () => {
    const result = productSchema.parse(essentials);
    expect(result.slug).toBe("vitamin-c-1000-mg");
    expect(result.image_alt).toBe("Vitamin C 1000 mg product photo");
    expect(result.directions).toBe("");
    expect(result.storage).toBe("");
    expect(result.active).toBe(false);
  });
  it("accepts blank optional inputs and preserves an existing page name and prescription flag", () => {
    const result = productSchema.parse({
      ...essentials,
      slug: "vitamin-c-pack",
      image_alt: "",
      brand: "",
      detail: "",
      directions: "",
      storage: "",
      prescription: true,
    });
    expect(result.slug).toBe("vitamin-c-pack");
    expect(result.prescription).toBe(true);
    expect(result.image_alt).toBe("Vitamin C 1000 mg product photo");
  });
  it("still rejects missing essentials and invalid prices", () => {
    expect(productSchema.safeParse({ ...essentials, price_kobo: 0 }).success).toBe(false);
    expect(productSchema.safeParse({ ...essentials, image: "" }).success).toBe(false);
    expect(productSchema.safeParse({ ...essentials, category: "" }).success).toBe(false);
  });
  it("accepts optional cost and discounts, including zero cost, and rejects invalid discounts", () => {
    expect(productSchema.parse(essentials)).toMatchObject({
      discount_price_kobo: null,
      cost_price_kobo: null,
    });
    expect(
      productSchema.parse({ ...essentials, discount_price_kobo: 600000, cost_price_kobo: 0 })
        .cost_price_kobo,
    ).toBe(0);
    for (const discount_price_kobo of [0, -100, 650000, 700000, 199.5])
      expect(productSchema.safeParse({ ...essentials, discount_price_kobo }).success).toBe(false);
    expect(productSchema.safeParse({ ...essentials, cost_price_kobo: -1 }).success).toBe(false);
  });
});
