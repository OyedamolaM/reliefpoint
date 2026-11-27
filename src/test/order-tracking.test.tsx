import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "./render";
import { OrderTracking } from "@/components/order-tracking";
import { TrackingEditor, InternalNoteForm } from "@/components/order-tracking-editor";
import { OrderReceipt } from "@/components/order-receipt";

afterEach(cleanup);
it("uses collection stages for pickup without a dispatch stage", () => {
  render(
    <OrderTracking
      order={{
        fulfillment_status: "processing",
        payment_status: "paid",
        needs_prescription: false,
        prescription_status: "not_required",
        zone_snapshot: { fulfillment_method: "pickup", estimate: "Ready today" },
      }}
      events={[]}
    />,
  );
  expect(screen.getByText("Collected")).toBeInTheDocument();
  expect(screen.queryByText("Dispatched")).not.toBeInTheDocument();
  expect(screen.getByText("Estimated collection time:")).toBeInTheDocument();
  cleanup();
  render(<TrackingEditor id="order" status="processing" pickup busy={false} action={vi.fn()} />);
  expect(screen.getByRole("option", { name: "Collected" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Dispatched" })).not.toBeInTheDocument();
});
it("shows prescription holds, real tracking history and the latest delivery estimate", () => {
  render(
    <OrderTracking
      order={{
        fulfillment_status: "prescription_review",
        payment_status: "paid",
        prescription_status: "pending",
        needs_prescription: true,
        zone_snapshot: { estimate: "Two days" },
      }}
      events={[]}
      paidAt="2026-11-26T09:00:00Z"
    />,
  );
  expect(screen.getByText(/awaiting pharmacist approval/)).toBeInTheDocument();
  expect(screen.getByText("Pharmacist review").closest("li")).toHaveAttribute(
    "aria-current",
    "step",
  );
  cleanup();
  render(
    <OrderTracking
      order={{
        fulfillment_status: "dispatched",
        payment_status: "paid",
        prescription_status: "not_required",
        needs_prescription: false,
        zone_snapshot: { estimate: "Two days" },
      }}
      events={[
        {
          status: "dispatched",
          note: "Your parcel is on its way",
          courier: "Courier One",
          tracking_reference: "PKG-10",
          estimated_delivery: "Tomorrow morning",
          created_at: "2026-11-26T10:00:00Z",
        },
      ]}
    />,
  );
  expect(screen.getByText("Your parcel is on its way")).toBeInTheDocument();
  expect(screen.getByText("Tracking reference: PKG-10")).toBeInTheDocument();
  expect(screen.getByText("Tomorrow morning")).toBeInTheDocument();
  expect(screen.getByText("Delivered").closest("li")).toHaveAttribute("aria-current", "step");
});

it("limits delivery stages, retries the same update safely and keeps internal notes separate", async () => {
  const action = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  render(<TrackingEditor id="order-1" status="processing" busy={false} action={action} />);
  expect(screen.queryByRole("option", { name: "Delivered" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Customer update"), { target: { value: "Packed" } });
  fireEvent.change(screen.getByLabelText("Estimated delivery time"), {
    target: { value: "Tomorrow" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save and notify customer" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const first = action.mock.calls[0]![1];
  fireEvent.click(screen.getByRole("button", { name: "Save and notify customer" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1]![1]).toEqual(first);
  expect(first).toMatchObject({
    value: "processing",
    estimated_delivery: "Tomorrow",
    note: "Packed",
  });
  cleanup();
  render(<InternalNoteForm id="order-1" busy={false} action={action} />);
  fireEvent.change(screen.getByLabelText("Internal staff note"), {
    target: { value: "Call courier" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save internal note" }));
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith(
      "internal-note",
      expect.objectContaining({ note: "Call courier" }),
    ),
  );
});

it("shows the original receipt with print and download controls, without rendering customer HTML", () => {
  const receipt = {
    version: 1,
    number: "RCP-RP-123",
    reference: "RP-123",
    paid_at: "2026-11-26T09:00:00Z",
    business: {
      name: "Relief Point Pharmacy",
      address: "",
      email: "support@reliefpointpharmacy.com",
      phone: "+234 706 784 1607",
    },
    customer: {
      name: "<script>bad</script>",
      email: "amina@example.com",
      phone: "08012345678",
      address: "12 Oregun Road",
    },
    items: [{ name: "Vitamin C", quantity: 2, price_kobo: 100000 }],
    subtotal: 200000,
    delivery: 250000,
    processing: 10000,
    total: 460000,
    method: "cash",
    currency: "NGN",
    test_mode: false,
  };
  render(<OrderReceipt id="order-1" document={receipt} />);
  fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("heading", { name: "Payment method" })).toBeInTheDocument();
  expect(dialog.getByText("Cash", { exact: true })).toBeInTheDocument();
  expect(dialog.getByText("Vitamin C")).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "Print / Save as PDF" })).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  expect(screen.getByRole("dialog").querySelector("script")).toBeNull();
});
