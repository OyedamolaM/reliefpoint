import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./render";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
import { DELIVERY_STORAGE_KEY, saveCookiePreferences } from "@/lib/cookie-preferences";
import type { Product } from "@/lib/commerce";
const product: Product = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test Vitamin",
  detail: "Pack",
  category: "OTC",
  price: 1000,
  image: "photo.webp",
  live: true,
  inStock: true,
  prescription: false,
  deal: false,
};
const zone = "00000000-0000-4000-8000-000000000002";
function Harness() {
  const shop = useCommerce();
  return <button onClick={() => shop.add(product)}>Add product</button>;
}
beforeEach(() => {
  localStorage.clear();
  saveCookiePreferences(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("completed checkout navigation", () => {
  it("preserves details between tabs, refreshes changed totals and protects an initiated payment", async () => {
    const quotes: any[] = [];
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes("zones"))
        return Response.json({
          zones: [{ id: zone, state: "Lagos", lga: "Ikeja", area: "Oregun", active: true }],
        });
      const body = JSON.parse(String(options?.body || "{}"));
      const quote = {
        subtotal: (body.items?.[0]?.quantity || 1) * 100000,
        delivery: 200000,
        processing: 0,
        total: (body.items?.[0]?.quantity || 1) * 100000 + 200000,
        prescription: false,
        eta: "Next day",
      };
      if (path.includes("checkout/quote")) {
        quotes.push(body);
        return Response.json({ quote });
      }
      if (path.includes("checkout/start"))
        return Response.json({
          order: {
            id: "00000000-0000-4000-8000-000000000003",
            reference: "RP-existing-checkout",
            needs_prescription: false,
          },
          quote,
        });
      if (path.includes("payments/initialize"))
        return Response.json(
          {
            error: {
              code: "PAYMENT_PENDING",
              message: "We're checking your payment. Please don't pay again.",
            },
          },
          { status: 503 },
        );
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <CommerceProvider backendEnabled initialCatalog={[product]}>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Add product"));
    expect(screen.getByRole("button", { name: "3. Payment" })).toBeDisabled();
    fireEvent.click(screen.getByText("Proceed to checkout"));
    for (const [label, value] of [
      ["Full name", "Amina Test"],
      ["Email", "amina@example.com"],
      ["Nigerian phone number", "08012345678"],
      ["Street address", "12 Oregun Road"],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    await screen.findByRole("option", { name: "Ikeja — Oregun" });
    fireEvent.change(screen.getByLabelText("Delivery area"), { target: { value: zone } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await screen.findByRole("button", { name: "Pay ₦3,000" });
    await waitFor(() => expect(screen.getByRole("button", { name: "1. Cart" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "3. Payment" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.click(screen.getByRole("button", { name: "1. Cart" }));
    fireEvent.click(screen.getByRole("button", { name: "3. Payment" }));
    expect(screen.getByRole("button", { name: "Pay ₦3,000" })).toBeEnabled();
    expect(quotes).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "1. Cart" }));
    fireEvent.click(screen.getByLabelText("Increase Test Vitamin"));
    expect(screen.getByRole("button", { name: "3. Payment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "2. Delivery" }));
    expect(screen.getByLabelText("Email")).toHaveValue("amina@example.com");
    expect(screen.getByLabelText("Delivery area")).toHaveValue(zone);
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    const pay = await screen.findByRole("button", { name: "Pay ₦4,000" });
    expect(quotes[1].items[0].quantity).toBe(2);
    fireEvent.click(pay);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("We're checking your payment"),
    );
    expect(screen.getByRole("button", { name: "1. Cart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2. Delivery" })).toBeDisabled();
    const draft = JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY)!);
    expect(draft.contact.email).toBe("amina@example.com");
    expect(JSON.stringify(draft)).not.toContain("RP-existing-checkout");
  });
});
