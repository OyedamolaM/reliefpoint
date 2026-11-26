import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./render";
const mocks = vi.hoisted(() => ({ send: vi.fn(), notifyError: vi.fn() }));
vi.mock("@/lib/api", () => ({ ...mocks, api: vi.fn() }));
import { ManualPaymentForm } from "@/components/manual-payment-form";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const mount = () => {
  mocks.send.mockResolvedValue({ status: "paid", message: "Payment recorded." });
  render(<ManualPaymentForm id="order-1" total={250000} onSaved={vi.fn()} />);
};
const submit = () =>
  fireEvent.submit(
    screen.getByRole("button", { name: "Confirm payment received" }).closest("form")!,
  );
it("records cash without asking for or sending a reference", async () => {
  mount();
  expect(screen.queryByLabelText(/Receipt \/ transfer reference/)).not.toBeInTheDocument();
  submit();
  await waitFor(() =>
    expect(mocks.send).toHaveBeenCalledWith(
      "admin/manual-payment",
      expect.objectContaining({ payments: [{ method: "cash", amount: 250000, reference: "" }] }),
    ),
  );
});
it("records cash and transfer allocations together, with optional references", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Amount received 1"), { target: { value: "2000" } });
  fireEvent.click(screen.getByRole("button", { name: "Add payment method" }));
  expect(screen.getByLabelText("Amount received 2")).toHaveValue(500);
  expect(screen.getByLabelText("Receipt / transfer reference 2")).not.toBeRequired();
  submit();
  await waitFor(() =>
    expect(mocks.send).toHaveBeenCalledWith(
      "admin/manual-payment",
      expect.objectContaining({
        payments: [
          { method: "cash", amount: 200000, reference: "" },
          { method: "bank_transfer", amount: 50000, reference: "" },
        ],
      }),
    ),
  );
});
it("rejects an incomplete total and hides stale references when switching back to cash", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Payment method 1"), { target: { value: "card" } });
  fireEvent.change(screen.getByLabelText("Receipt / transfer reference 1"), {
    target: { value: "POS-1" },
  });
  fireEvent.change(screen.getByLabelText("Payment method 1"), { target: { value: "cash" } });
  expect(screen.queryByLabelText(/Receipt \/ transfer reference/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Amount received 1"), { target: { value: "2000" } });
  submit();
  expect(mocks.send).not.toHaveBeenCalled();
});
