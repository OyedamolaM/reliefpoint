import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useDeliveryDraft } from "@/hooks/use-delivery-draft";
import {
  COOKIE_PREFERENCES_KEY,
  DELIVERY_STORAGE_KEY,
  clearOtherDelivery,
  saveCookiePreferences,
} from "@/lib/cookie-preferences";
const customer = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.com`,
  phone: "08012345678",
});
function Harness({ user = null }: { user?: ReturnType<typeof customer> | null }) {
  const draft = useDeliveryDraft({ user, loading: false });
  return (
    <>
      <input
        aria-label="Name"
        value={draft.contact.name}
        onChange={(e) => draft.setContact((c) => ({ ...c, name: e.target.value }))}
      />
      <input aria-label="Email" value={draft.contact.email} readOnly />
      <input
        aria-label="Address"
        value={draft.contact.address}
        onChange={(e) => draft.setContact((c) => ({ ...c, address: e.target.value }))}
      />
      <input
        aria-label="State"
        value={draft.state}
        onChange={(e) => draft.setState(e.target.value)}
      />
      <input aria-label="Area" value={draft.area} onChange={(e) => draft.setArea(e.target.value)} />
    </>
  );
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe("private local delivery drafts", () => {
  it("requires optional storage, restores delivery fields across reloads and excludes checkout secrets", () => {
    const first = render(<Harness />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Amina Test" } });
    expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
    act(() => {
      saveCookiePreferences(true);
    });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "12 Oregun Road" } });
    fireEvent.change(screen.getByLabelText("Area"), { target: { value: "Ikeja" } });
    const saved = JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY)!);
    expect(saved.contact).toMatchObject({ name: "Amina Test", address: "12 Oregun Road" });
    expect(Object.keys(saved).sort()).toEqual([
      "area",
      "contact",
      "expires",
      "owner",
      "state",
      "version",
      "zone",
    ]);
    expect(saved.expires).toBeGreaterThan(Date.now() + 6 * 86400000);
    first.unmount();
    render(<Harness />);
    expect(screen.getByLabelText("Name")).toHaveValue("Amina Test");
    expect(screen.getByLabelText("Address")).toHaveValue("12 Oregun Road");
    expect(screen.getByLabelText("Area")).toHaveValue("Ikeja");
    act(() => {
      saveCookiePreferences(false);
    });
    expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText("Address")).toHaveValue("12 Oregun Road");
  });
  it("does not restore expired, malformed or another customer's information", () => {
    saveCookiePreferences(true);
    for (const raw of [
      "invalid",
      JSON.stringify({
        version: 1,
        owner: "guest",
        expires: Date.now() - 1,
        contact: { name: "Old guest", email: "", phone: "", address: "Private address", note: "" },
        state: "Rivers",
        area: "Area",
        zone: "",
      }),
      JSON.stringify({
        version: 1,
        owner: "other-user",
        expires: Date.now() + 10000,
        contact: { name: "Other user", email: "", phone: "", address: "Private address", note: "" },
        state: "Rivers",
        area: "Area",
        zone: "",
      }),
    ]) {
      localStorage.setItem(DELIVERY_STORAGE_KEY, raw);
      const view = render(<Harness />);
      expect(screen.getByLabelText("Address")).toHaveValue("");
      expect(screen.getByLabelText("State")).toHaveValue("Lagos");
      expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
      view.unmount();
    }
  });
  it("clears private drafts when switching customers or signing out", () => {
    saveCookiePreferences(true);
    const view = render(<Harness user={customer("amina")} />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Private A address" } });
    view.rerender(<Harness user={customer("bola")} />);
    expect(screen.getByLabelText("Address")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("bola@example.com");
    expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Private B address" } });
    view.unmount();
    clearOtherDelivery("guest");
    expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
  });
  it("requests fresh permission when an older choice did not cover delivery storage", () => {
    localStorage.setItem(
      COOKIE_PREFERENCES_KEY,
      JSON.stringify({ version: 1, rememberBasket: true, expires: Date.now() + 10000 }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "New address" } });
    expect(localStorage.getItem(DELIVERY_STORAGE_KEY)).toBeNull();
  });
});
