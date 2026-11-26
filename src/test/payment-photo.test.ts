// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Context } from "@/server/session";
const access = vi.hoisted(() => ({ staff: true }));
vi.mock("@/server/session", async () => {
  const { AppError } = await import("@/server/errors");
  return {
    requireStaff: vi.fn(async () => {
      if (!access.staff) throw new AppError("FORBIDDEN", "Access denied", 403);
      return { id: "staff" };
    }),
    rate: vi.fn(),
    audit: vi.fn(),
  };
});
import { compressPaymentPhoto, paymentEvidenceLink, uploadTicket } from "@/server/uploads";
afterEach(() => {
  access.staff = true;
  vi.clearAllMocks();
});
it("compresses payment photos to WebP, limits dimensions and strips metadata", async () => {
  const original = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "white" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "Private camera name" } } })
    .png()
    .toBuffer();
  const compressed = await compressPaymentPhoto(original);
  const metadata = await sharp(compressed).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 1600, height: 800 });
  expect(metadata.exif).toBeUndefined();
  expect(compressed.length).toBeLessThan(original.length);
  await expect(compressPaymentPhoto(Buffer.from("not an image"))).rejects.toMatchObject({
    code: "PHOTO_INVALID",
  });
});
it("requires financial staff before viewing proof and rejects PDF payment uploads", async () => {
  const from = vi.fn();
  const ctx = { db: { from }, guestHash: "guest" } as unknown as Context;
  access.staff = false;
  await expect(paymentEvidenceLink(ctx, crypto.randomUUID())).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(from).not.toHaveBeenCalled();
  access.staff = true;
  await expect(
    uploadTicket(ctx, {
      kind: "payment",
      size: 100,
      mime: "application/pdf",
      order_id: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "FILE_INVALID" });
  expect(from).not.toHaveBeenCalled();
});
