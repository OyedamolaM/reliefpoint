import { describe, expect, it } from "vitest";
import {
  deliveryFee,
  filterProducts,
  nigerianStates,
  products,
  restoreCart,
  restoreWishlist,
  totals,
} from "@/lib/commerce";

describe("catalog filtering", () => {
  it("combines case-insensitive search, category, price and availability", () => {
    expect(filterProducts("CERAVE", "Skincare", 17000, true).map((p) => p.id)).toEqual([
      "cleanser",
    ]);
    expect(filterProducts("amartem", "Prescriptions", 5000, true)).toHaveLength(0);
    expect(filterProducts("amartem", "Prescriptions", 5000, false)).toHaveLength(1);
    expect(filterProducts("   ", "All", 100000, false)).toHaveLength(products.length);
  });
});
describe("delivery estimates", () => {
  it("supports all 36 states and the FCT", () => {
    expect(nigerianStates).toHaveLength(37);
    expect(deliveryFee(10000, "Enugu", "Enugu North")).toBe(4500);
    expect(deliveryFee(10000, "Abuja (FCT)", "Bwari")).toBe(4500);
  });
  it("does not quote a fee for an empty or unsupported destination", () => {
    expect(deliveryFee(10000, "", "")).toBeNull();
    expect(deliveryFee(40000, "Unknown", "Somewhere")).toBeNull();
    expect(deliveryFee(40000, "Lagos", " ")).toBeNull();
  });
  it("calculates island, mainland and free delivery thresholds", () => {
    expect(deliveryFee(30000, "Lagos", "Lagos Island")).toBe(2500);
    expect(deliveryFee(10000, "Lagos", "Ikeja")).toBe(2000);
    expect(deliveryFee(30001, "Lagos", "Lagos Island")).toBe(0);
  });
  it("multiplies quantities and adds the delivery estimate without creating rewards", () => {
    const product = products.find((p) => p.id === "vitamin-c")!;
    expect(totals([{ product, quantity: 2 }], "Lagos", "Ikeja")).toEqual({
      subtotal: 17800,
      delivery: 2000,
      total: 19800,
    });
    expect(totals([{ product, quantity: 4 }], "Lagos", "Ikeja")).toEqual({
      subtotal: 35600,
      delivery: 0,
      total: 35600,
    });
  });
});
describe("saved basket and wishlist", () => {
  it("restores catalog references while ignoring persisted prices or private data", () => {
    const cart = restoreCart(
      JSON.stringify([{ id: "vitamin-c", quantity: 2, price: 1, email: "private@example.com" }]),
    );
    expect(cart).toEqual([{ product: products.find((p) => p.id === "vitamin-c"), quantity: 2 }]);
  });
  it("ignores malformed data, duplicates, unavailable products and invalid quantities", () => {
    expect(restoreCart("invalid")).toEqual([]);
    expect(restoreCart("{}")).toEqual([]);
    const cart = restoreCart(
      JSON.stringify([
        { id: "amartem", quantity: 1 },
        { id: "vitamin-c", quantity: 1000 },
        { id: "vitamin-c", quantity: 3 },
        { id: "emzor", quantity: -1 },
        { id: "cerave", quantity: 1.5 },
        null,
      ]),
    );
    expect(cart).toEqual([{ product: products.find((p) => p.id === "vitamin-c"), quantity: 99 }]);
  });
  it("restores only unique, known wishlist products", () => {
    expect(restoreWishlist('["cerave","cerave",null,"unknown"]')).toEqual(["cerave"]);
    expect(restoreWishlist("bad")).toEqual([]);
  });
});
