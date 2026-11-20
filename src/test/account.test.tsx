import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
afterEach(cleanup);
function Harness() {
  const shop = useCommerce();
  return (
    <>
      <button onClick={() => shop.openPanel("account")}>Account</button>
      <p data-testid="profile">{shop.profile?.name ?? "Guest"}</p>
    </>
  );
}
describe("account frontend", () => {
  it("validates registration and does not pretend to create an online account", () => {
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Account"));
    fireEvent.click(screen.getByText("Register"));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });
    fireEvent.click(screen.getByText("Create account"));
    expect(screen.getByRole("status")).toHaveTextContent("passwords do not match");
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByText("Create account"));
    expect(screen.getByRole("status")).toHaveTextContent("account has not been created");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByTestId("profile")).toHaveTextContent("Guest");
  });
  it("supports a session shopping profile without saving a password", () => {
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Account"));
    fireEvent.click(screen.getByText("Use a shopping profile for this visit"));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Test" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.click(screen.getByText("Use shopping profile"));
    expect(screen.getByTestId("profile")).toHaveTextContent("Amina Test");
    expect(screen.getByText(/Guest profile/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear shopping profile"));
    expect(screen.getByTestId("profile")).toHaveTextContent("Guest");
  });
  it("shows an honest password-reset state", () => {
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Account"));
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "amina@example.com" },
    });
    fireEvent.click(screen.getByText("Send reset link"));
    expect(screen.getByRole("status")).toHaveTextContent("No email has been sent");
  });
});
