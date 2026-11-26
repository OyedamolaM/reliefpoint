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
      kind: z.enum(["media", "prescription", "payment"]),
      size: z.number().int().positive().max(10485760),
      mime: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      order_id: z.string().uuid().optional(),
    })
    .parse(body);
  const staff =
    input.kind === "media" || input.kind === "payment"
      ? await requireStaff(
          ctx,
          input.kind === "payment"
            ? ["owner", "admin"]
            : ["owner", "admin", "editor", "pharmacist"],
        )
      : null;
  await rate(ctx, "upload-ticket", staff ? 60 : 5, 600, staff?.id ?? ctx.guestHash);
  await rate(ctx, "upload-ip", staff ? 120 : 30, 600);
  if (
    (input.kind !== "prescription" && input.mime === "application/pdf") ||
    (input.kind === "prescription" && input.size > 5242880)
  )
    throw new AppError("FILE_INVALID", "Choose a supported file within the upload limit.");
  if (input.kind === "prescription") await ownedOrder(ctx, input.order_id ?? "");
  if (input.kind === "payment") {
    const order = requireDb(
      await ctx.db
        .from("orders")
        .select("created_by,payment_status")
        .eq("id", z.string().uuid().parse(input.order_id))
        .single(),
    );
    if (!order.created_by || order.payment_status !== "pending")
      throw new AppError(
        "UPLOAD_UNAVAILABLE",
        "Payment photos can be added before confirming this payment.",
      );
  }
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
    ticket.kind === "media" || ticket.kind === "payment"
      ? await requireStaff(
          ctx,
          ticket.kind === "payment"
            ? ["owner", "admin"]
            : ["owner", "admin", "editor", "pharmacist"],
        )
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
    kind === "media" || kind === "payment"
      ? await requireStaff(
          ctx,
          kind === "payment" ? ["owner", "admin"] : ["owner", "admin", "editor", "pharmacist"],
        )
      : null;
  await rate(ctx, "upload", staff ? 60 : 5, 600, staff?.id ?? ctx.guestHash);
  const form = await ctx.request.formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > (kind === "prescription" ? 5 : 10) * 1024 * 1024
  )
    throw new AppError("FILE_SIZE", `Choose a file up to ${kind === "prescription" ? 5 : 10} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectFile(bytes);
  if (!mime || (kind !== "prescription" && mime === "application/pdf"))
    throw new AppError(
      "FILE_TYPE",
      kind !== "prescription"
        ? "Choose a JPEG or PNG photo."
        : "Choose a PDF, JPEG or PNG prescription.",
    );
  const db = ctx.db;
  if (kind === "payment") {
    const orderId = z.string().uuid().parse(form.get("order_id"));
    const order = requireDb(
      await db.from("orders").select("created_by,payment_status").eq("id", orderId).single(),
    );
    if (!order.created_by || order.payment_status !== "pending")
      throw new AppError("UPLOAD_UNAVAILABLE", "This payment can’t receive photos now.");
    const image = await compressPaymentPhoto(bytes);
    const path = `${orderId}/${randomUUID()}.webp`;
    checkDb(
      await db.storage
        .from("payment-evidence")
        .upload(path, image, { contentType: "image/webp", upsert: false }),
    );
    const result = await db
      .from("payment_evidence")
      .insert({ order_id: orderId, actor: staff!.id, path })
      .select("id")
      .single();
    if (result.error) {
      await db.storage.from("payment-evidence").remove([path]);
      checkDb(result);
    }
    await audit(ctx, staff!.id, "payment_photo_uploaded", "orders", orderId);
    return { id: requireDb(result).id };
  }
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
export async function compressPaymentPhoto(bytes: Uint8Array) {
  try {
    const image = await sharp(bytes, { limitInputPixels: 24000000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    if (image.length > 3145728) throw new Error("size");
    return image;
  } catch {
    throw new AppError(
      "PHOTO_INVALID",
      "We couldn’t read that photo. Please choose another JPEG or PNG.",
    );
  }
}
export async function paymentEvidenceLink(ctx: Context, id: string) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  const record = requireDb(
    await ctx.db
      .from("payment_evidence")
      .select("path,order_id")
      .eq("id", z.string().uuid().parse(id))
      .single(),
  );
  const file = requireDb(
    await ctx.db.storage.from("payment-evidence").createSignedUrl(record.path, 60),
  );
  await audit(ctx, actor.id, "payment_photo_viewed", "orders", record.order_id);
  return { url: file.signedUrl };
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
