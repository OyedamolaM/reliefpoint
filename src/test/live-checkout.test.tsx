import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "./render";
import { LiveCheckout } from "@/components/live-checkout";
import type { Product } from "@/lib/commerce";
import { deliveryState, nigerianStates } from "@/lib/nigeria";

const deliveryZone = {
  id: "00000000-0000-4000-8000-000000000002",
  state: "Lagos",
  lga: "Ikeja",
  area: "Oregun",
  fee_kobo: 200000,
  estimate: "Next working day",
  active: true,
};
const basket = [
  {
    product: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Vitamin C",
      category: "Vitamins",
      detail: "Pack",
      price: 1000,
      image: "photo.webp",
      inStock: true,
      prescription: false,
      deal: false,
      live: true,
    },
    quantity: 1,
  },
];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("server-backed checkout", () => {
  it("keeps delivery details visible when checkout is blocked before payment review", async () => {
    const request = vi.fn(async (path: string) =>
      path.includes("zones")
        ? Response.json({ zones: [deliveryZone] })
        : Response.json(
            {
              error: {
                code: "CHECKOUT_UNAVAILABLE",
                message:
                  "Online checkout is temporarily unavailable. Your basket is saved. Please contact our pharmacy team.",
              },
            },
            { status: 503 },
          ),
    );
    vi.stubGlobal("fetch", request);
    render(<LiveCheckout cart={basket} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Lagos" } });
    await screen.findByRole("option", { name: "Ikeja — Oregun" });
    fireEvent.change(screen.getByLabelText("Delivery area"), {
      target: { value: deliveryZone.id },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Continue to payment" }).closest("form")!);
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Full name")).toHaveValue("Amina Test");
    expect(screen.getByLabelText("Delivery area")).toHaveValue(deliveryZone.id);
    expect(screen.queryByRole("button", { name: /^Pay / })).not.toBeInTheDocument();
    expect(request.mock.calls.some(([path]) => path.includes("checkout/start"))).toBe(false);
  });
  it("shows all states with no configured zones and prevents unavailable checkout", async () => {
    const request = vi.fn(async (_path: string) => Response.json({ zones: [] }));
    vi.stubGlobal("fetch", request);
    render(<LiveCheckout cart={basket} onBack={() => {}} />);
    expect(screen.getByLabelText("State / FCT").querySelectorAll("option")).toHaveLength(38);
    expect(nigerianStates).toHaveLength(37);
    await screen.findByText("Online delivery isn’t available yet.", { exact: false });
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Lagos" } });
    expect(screen.getByLabelText("Delivery area")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Continue to payment" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Select an available delivery area");
    expect(request.mock.calls.some((call) => String(call[0]).includes("checkout/quote"))).toBe(
      false,
    );
  });
  it("clears the area on state change and supports existing Abuja zone names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          zones: [
            deliveryZone,
            { ...deliveryZone, id: "abuja-zone", state: "Abuja", lga: "AMAC", area: "Wuse" },
            { ...deliveryZone, id: "hidden-zone", lga: "Not offered", active: false },
          ],
        }),
      ),
    );
    render(<LiveCheckout cart={basket} onBack={() => {}} />);
    expect(screen.getByLabelText("State / FCT")).toHaveValue("Lagos");
    await screen.findByRole("option", { name: "Ikeja — Oregun" });
    fireEvent.change(screen.getByLabelText("Delivery area"), {
      target: { value: deliveryZone.id },
    });
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: "Not offered — Oregun" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Abuja (FCT)" } });
    expect(screen.getByLabelText("Delivery area")).toHaveValue("");
    expect(screen.getByRole("option", { name: "AMAC — Wuse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Ogun" } });
    expect(screen.getByLabelText("Delivery area")).toBeDisabled();
    expect(screen.getByText(/Online delivery isn’t available in Ogun yet/)).toBeInTheDocument();
  });
  it("retries loading delivery areas while preserving contact details and the selected state", async () => {
    let available = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        available
          ? Response.json({ zones: [deliveryZone] })
          : Response.json(
              { error: { code: "DATA_UNAVAILABLE", message: "Try again later." } },
              { status: 503 },
            ),
      ),
    );
    render(<LiveCheckout cart={basket} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Lagos" } });
    await screen.findByText("We couldn’t load delivery areas. Your details are still here.");
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("option", { name: "Ikeja — Oregun" });
    expect(screen.getByLabelText("Full name")).toHaveValue("Amina Test");
    expect(screen.getByLabelText("State / FCT")).toHaveValue("Lagos");
  });
  it.each(["Abuja", "fct", "Abuja (FCT)", "Federal Capital Territory"])(
    "matches FCT aliases for existing addresses: %s",
    (value) => {
      expect(deliveryState(value)).toBe("Abuja (FCT)");
    },
  );
  it("captures guest contact details before quoting and keeps them when payment is unavailable", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const zone = "00000000-0000-4000-8000-000000000002";
    const product: Product = {
      id,
      name: "Product",
      category: "OTC",
      detail: "Pack",
      price: 1000,
      image: "image.webp",
      inStock: true,
      prescription: false,
      deal: false,
      live: true,
    };
    const request = vi.fn().mockImplementation(async (path: string) =>
      path.includes("zones")
        ? Response.json({
            zones: [
              {
                id: zone,
                state: "Lagos",
                lga: "Ikeja",
                area: "",
                fee_kobo: 200000,
                estimate: "Owner estimate",
              },
            ],
          })
        : path.includes("checkout/quote")
          ? Response.json({
              quote: {
                subtotal: 100000,
                delivery: 200000,
                processing: 14721,
                total: 314721,
                prescription: false,
                eta: "Owner estimate",
              },
            })
          : Response.json(
              {
                error: {
                  code: "PAYMENTS_UNAVAILABLE",
                  message: "Online payment isn’t available yet. Please contact our pharmacy team.",
                },
              },
              { status: 503 },
            ),
    );
    vi.stubGlobal("fetch", request);
    render(<LiveCheckout cart={[{ product, quantity: 1 }]} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "amina@example.com" } });
    fireEvent.change(screen.getByLabelText("Nigerian phone number"), {
      target: { value: "08012345678" },
    });
    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "1 Test Street" },
    });
    await screen.findByRole("option", { name: "Lagos" });
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Lagos" } });
    await screen.findByRole("option", { name: "Ikeja" });
    fireEvent.change(screen.getByLabelText("Delivery area"), { target: { value: zone } });
    fireEvent.submit(screen.getByText("Continue to payment").closest("form")!);
    await screen.findByText("Processing fee");
    const quoteCall = request.mock.calls.find((call) => String(call[0]).includes("checkout/quote"));
    expect(JSON.parse(quoteCall![1].body).contact.email).toBe("amina@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^Pay / }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Online payment isn’t available yet"),
    );
    expect(screen.getByText("amina@example.com")).toBeInTheDocument();
    expect(request.mock.calls.some((call) => String(call[0]).includes("payments/initialize"))).toBe(
      false,
    );
  });
});
