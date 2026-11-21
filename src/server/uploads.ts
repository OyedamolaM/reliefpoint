import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { AppError, checkDb, requireDb } from "./errors";
import { z } from "zod";
import { ownedOrder } from "./payments";
import { audit, rate, requireStaff, type Context } from "./session";

export function detectFile(bytes: Uint8Array) {
  if (Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  return null;
}
export async function uploadTicket(ctx: Context, body: unknown) {
  const input = z
    .object({
      kind: z.enum(["media", "prescription"]),
      size: z.number().int().positive().max(10485760),
      mime: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      order_id: z.string().uuid().optional(),
    })
    .parse(body);
  const staff =
    input.kind === "media"
      ? await requireStaff(ctx, ["owner", "admin", "editor", "pharmacist"])
      : null;
  await rate(ctx, "upload-ticket", staff ? 60 : 5, 600, staff?.id ?? ctx.guestHash);
  await rate(ctx, "upload-ip", staff ? 120 : 30, 600);
  if (
    (input.kind === "media" && input.mime === "application/pdf") ||
    (input.kind === "prescription" && input.size > 5242880)
  )
    throw new AppError("FILE_INVALID", "Choose a supported file within the upload limit.");
  if (input.kind === "prescription") await ownedOrder(ctx, input.order_id ?? "");
  const path = randomUUID();
  const ticket = requireDb(
    await ctx.db
      .from("upload_tickets")
      .insert({ path, owner_key: staff?.id ?? ctx.guestHash, ...input })
      .select("id")
      .single(),
  );
  const signed = requireDb(
    await ctx.db.storage.from("upload-quarantine").createSignedUploadUrl(path, { upsert: false }),
  );
  return { id: ticket.id, url: signed.signedUrl };
}
export async function finalizeUpload(ctx: Context, body: unknown) {
  const { id } = z.object({ id: z.string().uuid() }).parse(body);
  const ticket = checkDb(
    await ctx.db
      .from("upload_tickets")
      .select("*")
      .eq("id", id)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  );
  if (!ticket)
    throw new AppError("UPLOAD_EXPIRED", "This upload has expired. Please select your file again.");
  const staff =
    ticket.kind === "media"
      ? await requireStaff(ctx, ["owner", "admin", "editor", "pharmacist"])
      : null;
  if (ticket.owner_key !== (staff?.id ?? ctx.guestHash))
    throw new AppError("FORBIDDEN", "This upload isn’t available.", 403);
  const claimed = checkDb(
    await ctx.db
      .from("upload_tickets")
      .update({ used: true })
      .eq("id", id)
      .eq("used", false)
      .select("id")
      .maybeSingle(),
  );
  if (!claimed)
    throw new AppError(
      "UPLOAD_EXPIRED",
      "This upload was already processed. Please refresh the order.",
    );
  const blob = requireDb(await ctx.db.storage.from("upload-quarantine").download(ticket.path));
  if (blob.size !== ticket.size)
    throw new AppError(
      "FILE_INVALID",
      "This upload was incomplete. Please select your file again.",
    );
  const form = new FormData();
  form.set("file", new File([blob], "upload", { type: ticket.mime }));
  if (ticket.order_id) form.set("order_id", ticket.order_id);
  try {
    return await upload(
      {
        ...ctx,
        request: new Request(ctx.request.url, {
          method: "POST",
          body: form,
          headers: ctx.request.headers.has("x-order-token")
            ? { "x-order-token": ctx.request.headers.get("x-order-token")! }
            : {},
        }),
      },
      ticket.kind,
    );
  } finally {
    await ctx.db.storage.from("upload-quarantine").remove([ticket.path]);
  }
}
async function upload(ctx: Context, kind: string) {
  const staff =
    kind === "media" ? await requireStaff(ctx, ["owner", "admin", "editor", "pharmacist"]) : null;
  await rate(ctx, "upload", staff ? 60 : 5, 600, staff?.id ?? ctx.guestHash);
  const form = await ctx.request.formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > (kind === "media" ? 10 : 5) * 1024 * 1024
  )
    throw new AppError("FILE_SIZE", `Choose a file up to ${kind === "media" ? 10 : 5} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectFile(bytes);
  if (!mime || (kind === "media" && mime === "application/pdf"))
    throw new AppError(
      "FILE_TYPE",
      kind === "media" ? "Choose a JPEG or PNG photo." : "Choose a PDF, JPEG or PNG prescription.",
    );
  const db = ctx.db;
  if (kind === "prescription") {
    const order = await ownedOrder(ctx, String(form.get("order_id")));
    if (
      !order.needs_prescription ||
      ["dispatched", "delivered", "cancelled"].includes(order.fulfillment_status)
    )
      throw new AppError("UPLOAD_UNAVAILABLE", "This order cannot receive a prescription now.");
    const path = `${order.id}/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : "png"}`;
    checkDb(
      await db.storage
        .from("prescriptions")
        .upload(path, bytes, { contentType: mime, upsert: false }),
    );
    const record = await db.rpc("attach_prescription", {
      p_order: order.id,
      p_path: path,
      p_mime: mime,
    });
    if (record.error) {
      await db.storage.from("prescriptions").remove([path]);
      checkDb(record);
    }
    return { id: record.data, message: "Your prescription was uploaded securely." };
  }
  const key = `${staff!.id}/${randomUUID()}`;
  const images: Record<string, string> = {};
  for (const [label, width] of [
    ["small", 320],
    ["medium", 800],
    ["large", 1400],
  ] as const) {
    let image: Buffer;
    try {
      image = await sharp(bytes, { limitInputPixels: 24000000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new AppError(
        "PHOTO_INVALID",
        "We couldn’t read that photo. Please choose another JPEG or PNG.",
      );
    }
    const path = `${key}-${label}.webp`;
    checkDb(
      await db.storage.from("pharmacy-media").upload(path, image, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      }),
    );
    images[label] = db.storage.from("pharmacy-media").getPublicUrl(path).data.publicUrl;
  }
  await audit(ctx, staff!.id, "upload", "media", key);
  return { images };
}
export function assertMedia(url: string) {
  const parsed = new URL(url);
  const base = new URL(process.env["SUPABASE_URL"]!);
  if (
    parsed.origin !== base.origin ||
    !parsed.pathname.startsWith("/storage/v1/object/public/pharmacy-media/") ||
    !parsed.pathname.endsWith(".webp")
  )
    throw new AppError("PHOTO_REQUIRED", "Upload a photo from your device before saving.");
}
