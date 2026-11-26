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
  it("shows and hides the password without changing it or submitting", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    mount();
    const password = screen.getByLabelText("Password");
    fireEvent.change(password, { target: { value: "secret12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret12345");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens signup directly and provides policies before requiring agreement", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "Check your email." }));
    vi.stubGlobal("fetch", fetch);
    function Signup() {
      const shop = useCommerce();
      return <button onClick={() => shop.openPanel("signup")}>Sign up directly</button>;
    }
    render(
      <CommerceProvider>
        <Signup />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Sign up directly"));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms and Conditions" })).toHaveAttribute(
      "href",
      "/terms-and-conditions",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "target",
      "_blank",
    );
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Nigerian phone number"), {
      target: { value: "08012345678" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    for (const label of ["Password", "Confirm password"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "secret12345" } });
    const form = screen.getByRole("button", { name: "Create account" }).closest("form")!;
    fireEvent.submit(form);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Agree to Terms/ }));
    fireEvent.submit(form);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({ body: expect.stringContaining('"accepted_terms":true') }),
      ),
    );
  });
  it("validates matching passwords before registration", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Switch to create account" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
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
