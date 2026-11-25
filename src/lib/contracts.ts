import { z } from "zod";

export const roles = ["owner", "admin", "pharmacist", "fulfillment", "support", "editor"] as const;
export type StaffRole = (typeof roles)[number];
export const slugify = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const articleBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(10000) }),
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(200) }),
  z.object({ type: z.literal("image"), src: z.string().url(), alt: z.string().min(1).max(250) }),
]);
export const instagramLink = z
  .string()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
        /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Enter an Instagram post or reel link.");
export const postSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(180),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(200),
  summary: z.string().trim().min(10).max(400),
  category: z.string().trim().min(2).max(80),
  cover: z.string().url(),
  cover_alt: z.string().trim().min(3).max(250),
  blocks: z.array(articleBlock).min(1).max(100),
  instagram: instagramLink.default(""),
  status: z.enum(["draft", "published", "archived"]),
  reviewer_id: z.string().uuid().nullable().default(null),
});
export type BlogPost = z.infer<typeof postSchema> & {
  id: string;
  author_name: string;
  reviewer_name?: string | null;
  published_at: string | null;
  updated_at: string;
};
export const productSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const input = value as Record<string, unknown>;
    const name = typeof input["name"] === "string" ? input["name"].trim() : "";
    return {
      ...input,
      slug: input["slug"] === undefined || input["slug"] === "" ? slugify(name) : input["slug"],
      image_alt:
        input["image_alt"] === undefined || input["image_alt"] === ""
          ? `${name} product photo`
          : input["image_alt"],
    };
  },
  z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(180),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      detail: z.string().max(2000).default(""),
      category: z.string().min(2).max(80),
      brand: z.string().max(80).default(""),
      price_kobo: z.number().int().min(100).max(100000000),
      discount_price_kobo: z.number().int().min(100).max(100000000).nullable().default(null),
      cost_price_kobo: z.number().int().min(0).max(100000000).nullable().default(null),
      image: z.string().url(),
      image_alt: z.string().min(3).max(250),
      directions: z.string().max(4000).default(""),
      storage: z.string().max(2000).default(""),
      prescription: z.boolean().default(false),
      deal: z.boolean().default(false),
      active: z.boolean().default(false),
    })
    .refine(
      (product) =>
        product.discount_price_kobo === null || product.discount_price_kobo < product.price_kobo,
      {
        path: ["discount_price_kobo"],
        message: "Discount price must be lower than the regular price.",
      },
    ),
);
export const checkoutSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().email().max(180),
    phone: z
      .string()
      .regex(/^\+?[0-9 ()-]{10,24}$/, "Enter a valid phone number.")
      .refine((value) => {
        const count = value.replace(/\D/g, "").length;
        return count >= 10 && count <= 15;
      }, "Enter a valid phone number."),
    address: z.string().trim().min(5).max(500),
    note: z.string().max(1000).default(""),
  }),
  zone_id: z.string().uuid(),
  channel: z.enum(["card", "bank_transfer", "ussd"]).default("card"),
  request_id: z.string().uuid(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type Quote = {
  subtotal: number;
  delivery: number;
  processing: number;
  total: number;
  prescription: boolean;
  eta: string;
};
export type PublicSettings = {
  address?: string;
  opening_hours?: string;
  pcn_logo?: string;
  privacy_text?: string;
  refund_text?: string;
  shipping_text?: string;
};
export type ShippingZone = {
  id: string;
  state: string;
  lga: string;
  area: string;
  fee_kobo: number;
  free_over_kobo: number | null;
  estimate: string;
  active: boolean;
};

// Paystack domestic fee schedule: configured once on the server and snapshotted per order.
export function grossUp(base: number, rate = 150, fixed = 10000, threshold = 250000, cap = 200000) {
  if (
    ![base, rate, fixed, threshold, cap].every(Number.isSafeInteger) ||
    base < 0 ||
    rate < 0 ||
    rate >= 10000 ||
    fixed < 0 ||
    cap < 0
  )
    throw new Error("Invalid fee configuration");
  const fee = (gross: number) =>
    Math.min(cap, Math.ceil((gross * rate) / 10000) + (gross >= threshold ? fixed : 0));
  // Search each side separately: net proceeds drop when the fixed fee starts.
  const search = (start: number, end: number) => {
    let low = start,
      high = end;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (mid - fee(mid) >= base) high = mid;
      else low = mid + 1;
    }
    return low;
  };
  if (base < threshold) {
    const before = search(base, Math.min(base + cap, threshold - 1));
    if (before - fee(before) >= base) return { total: before, processing: before - base };
  }
  const total = search(Math.max(base, threshold), base + cap);
  return { total, processing: total - base };
}
