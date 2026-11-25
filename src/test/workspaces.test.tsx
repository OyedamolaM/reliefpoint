import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
import { render } from "./render";
const state = vi.hoisted(() => ({
  user: {
    id: "user",
    name: "Amina Bello",
    email: "amina@example.com",
    phone: "08012345678",
    roles: ["admin"],
    aal: "aal2",
    recovery: false,
  },
  calls: [] as string[],
}));
vi.mock("@/components/auth-provider", () => ({
  useAccount: () => ({
    user: state.user,
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
}));
vi.mock("@/components/commerce-provider", () => ({
  useCommerce: () => ({ wishlist: [], openWishlist: vi.fn(), openCart: vi.fn(), count: 0, settings: {} }),
}));
vi.mock("@/lib/api", () => ({
  notifyError: vi.fn(),
  send: vi.fn(async (path: string) =>
    path === "auth/mfa-factors" ? { factors: [{ id: "factor-1", name: "ReliefPoint" }] } : {},
  ),
  api: async (path: string) => {
    state.calls.push(path);
    if (path === "admin/summary")
      return { paid_kobo: 240000, confirmed_orders: 1, pending_payments: 1, prescription_queue: 0 };
    return { rows: [], more: false };
  },
}));
import { AdminPage } from "@/components/admin-page";
import { AccountPage, SecurityPanel } from "@/components/account-page";
afterEach(cleanup);
beforeEach(() => {
  state.calls = [];
  state.user.aal = "aal2";
});
describe("pharmacy workspaces", () => {
  it("shows only the code challenge for enrolled staff signing in", async () => {
    state.user.aal = "aal1";
    render(<AdminPage />);
    expect(await screen.findByLabelText("Authenticator code")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
  it("shows verified status and keeps password changes collapsed in settings", () => {
    render(<SecurityPanel />);
    expect(screen.getByText("Authenticator verified")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).not.toBeVisible();
    fireEvent.click(screen.getByText("Change password"));
    expect(screen.getByLabelText("Current password")).toBeVisible();
  });
  it("groups administration and keeps stock history and payments out of the main menu", async () => {
    render(<AdminPage />);
    const nav = screen.getByRole("navigation", { name: "Administration" });
    expect(within(nav).getAllByRole("button")).toHaveLength(7);
    expect(within(nav).queryByText(/stock history|expiry|payments/i)).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "Pending payments" }));
    await waitFor(() =>
      expect(
        state.calls.some((p) => p.includes("admin/orders?") && p.includes("view=pending")),
      ).toBe(true),
    );
    expect(await screen.findByText("No pending payments")).toBeInTheDocument();
  });
  it("opens catalog forms in a modal without exposing expiry fields", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
    const modal = screen.getByRole("dialog", { name: "Add record" });
    expect(within(modal).getByLabelText("Product name")).toBeInTheDocument();
    expect(within(modal).queryByLabelText("Expiry date")).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows a customer profile and edits it in a modal", () => {
    render(<AccountPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Account" })).getByRole("button", {
        name: "My profile",
      }),
    );
    expect(screen.getByText("08012345678")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit profile" })[0]!);
    expect(screen.getByRole("dialog", { name: "Edit your profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Amina Bello");
  });
});
