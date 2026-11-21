import { fireEvent, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./render";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function Harness() {
  const shop = useCommerce();
  return <button onClick={() => shop.openPanel("account")}>Account</button>;
}
function mount() {
  render(
    <CommerceProvider>
      <Harness />
    </CommerceProvider>,
  );
  fireEvent.click(screen.getByText("Account"));
}
describe("secure account forms", () => {
  it("validates matching passwords before registration", () => {
    mount();
    fireEvent.click(screen.getByText("Register"));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });
    fireEvent.submit(screen.getByText("Create account").closest("form")!);
    expect(screen.getByRole("status")).toHaveTextContent("passwords do not match");
  });
  it("preserves entered details and displays a friendly sign-in failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "SIGN_IN_FAILED", message: "Check your email and password." } },
            { status: 401 },
          ),
        ),
    );
    mount();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: /^Sign in$/ }).closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Check your email and password."),
    );
    expect(screen.getByLabelText("Email address")).toHaveValue("amina@example.com");
    expect(localStorage.getItem("supabase.auth.token")).toBeNull();
  });
  it("uses an account-safe password recovery message", async () => {
    const message = "If an account matches this email, you?ll receive a password reset link.";
    const fetch = vi.fn().mockResolvedValue(Response.json({ message }));
    vi.stubGlobal("fetch", fetch);
    mount();
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.submit(screen.getByText("Send reset link").closest("form")!);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(message));
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/reset",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
