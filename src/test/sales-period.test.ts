import { describe, it, expect } from "vitest";
import { salesPeriod } from "@/lib/sales-period";
describe("sales periods in Nigeria time", () => {
  it("uses the Nigeria calendar month at UTC month boundaries", () => {
    expect(salesPeriod(new URLSearchParams(), new Date("2026-10-31T23:30:00Z"))).toEqual({
      from: "2026-10-31T23:00:00.000Z",
      to: "2026-11-30T23:00:00.000Z",
    });
  });
  it("uses Monday through Sunday, including weeks spanning years", () => {
    expect(salesPeriod(new URLSearchParams("period=week&week=2027-01-01"))).toEqual({
      from: "2026-12-27T23:00:00.000Z",
      to: "2027-01-03T23:00:00.000Z",
    });
  });
  it("includes the entire last custom day and leap days", () => {
    expect(salesPeriod(new URLSearchParams("period=custom&from=2028-02-29&to=2028-02-29"))).toEqual(
      {
        from: "2028-02-28T23:00:00.000Z",
        to: "2028-02-29T23:00:00.000Z",
      },
    );
    expect(salesPeriod(new URLSearchParams("period=all"))).toEqual({ from: null, to: null });
  });
  it.each([
    "period=custom",
    "period=bad",
    "period=month&month=2026-13",
    "period=week&week=2026-02-30",
    "period=custom&from=2026-11-02&to=2026-11-01",
  ])("rejects invalid ranges: %s", (query) => {
    expect(() => salesPeriod(new URLSearchParams(query))).toThrow("Choose a valid sales period");
  });
});
