import { describe, expect, it, vi } from "vitest";
import { importProductBatches } from "@/lib/product-import";
describe("product import batching", () => {
  it("imports more than 100 products with global row numbers and per-row errors", async () => {
    const send = vi.fn(async (records: unknown[]) => ({
      outcomes: records.map((_, index) => ({
        row: index + 1,
        ...(index === 2 ? { error: "Invalid price" } : {}),
      })),
    }));
    const progress = vi.fn();
    const result = await importProductBatches(
      Array.from({ length: 125 }, (_, index) => ({ name: `Product ${index}` })),
      send,
      progress,
    );
    expect(send.mock.calls.map(([records]) => records.length)).toEqual([20, 20, 20, 20, 20, 20, 5]);
    expect(result).toHaveLength(125);
    expect(result[22]).toEqual({ row: 23, error: "Invalid price" });
    expect(progress).toHaveBeenLastCalledWith(result, 125);
  });
  it("stops on an uncertain batch without automatically repeating it", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        outcomes: Array.from({ length: 20 }, (_, index) => ({ row: index + 1 })),
      })
      .mockRejectedValueOnce(new Error("Timeout"));
    const progress = vi.fn();
    await expect(importProductBatches(Array(65).fill({}), send, progress)).rejects.toThrow(
      "20 of 65",
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.at(-1)?.[0]).toHaveLength(20);
  });
});
