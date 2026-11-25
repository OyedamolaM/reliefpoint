// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { grossUp, instagramLink, postSchema } from "@/lib/contracts";
import { validSignature } from "@/server/payments";
import { detectFile } from "@/server/uploads";
import { createHmac } from "node:crypto";
let db: PGlite;
const customer = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  pharmacist = "00000000-0000-4000-8000-000000000003",
  owner = "00000000-0000-4000-8000-000000000004";
let product: string, zone: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 `);
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "-- gen_random_uuid is built into PostgreSQL.",
      ),
    );
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${customer}','one@example.com',now()),('${other}','two@example.com',now()),('${pharmacist}','pharm@example.com',now()),('${owner}','owner@example.com',now());
 insert into staff_roles values('${pharmacist}','pharmacist'),('${owner}','owner');update settings set checkout_enabled=true;`);
  product = (
    await db.query<{ id: string }>(
      `insert into products(name,slug,category,price_kobo,image,image_alt,directions,storage,prescription,active) values('Test Medicine','test-medicine','Prescriptions',240000,'https://example.com/photo.webp','Test pack','As prescribed','Original pack',true,true) returning id`,
    )
  ).rows[0]!.id;
  zone = (
    await db.query<{ id: string }>(
      `insert into shipping_zones(state,lga,area,fee_kobo,estimate)values('Lagos','Ikeja','',0,'Owner configured estimate') returning id`,
    )
  ).rows[0]!.id;
  await db.query(
    `insert into inventory_batches(product_id,lot,expires_on,quantity)values($1,'BATCH-1',current_date+100,10)`,
    [product],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
const input = (request: string, quantity = 1) => ({
  items: [{ id: product, quantity }],
  zone_id: zone,
  request_id: request,
  contact: {
    name: "Customer",
    email: "one@example.com",
    phone: "08012345678",
    address: "Street address",
  },
});
async function begin(request: string, quantity = 1) {
  return (
    await db.query<{ o: any }>(`select begin_checkout($1::jsonb,$2::uuid,'guest-hash',true) o`, [
      JSON.stringify(input(request, quantity)),
      customer,
    ])
  ).rows[0]!.o;
}
describe("database migrations and pharmacy transactions", () => {
  it("keeps remembered MFA server-only and caps grants at 24 hours", async () => {
    await expect(
      db.query(
        `insert into mfa_browser_grants(token_hash,user_id,factor_id,verified_at,expires_at) values($1,$2,$3,now(),now()+interval '25 hours')`,
        ["f".repeat(64), owner, crypto.randomUUID()],
      ),
    ).rejects.toThrow();
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select * from mfa_browser_grants")).rejects.toThrow();
      await expect(
        db.query(
          `insert into mfa_browser_grants(token_hash,user_id,factor_id,verified_at,expires_at) values($1,$2,$3,now(),now()+interval '24 hours')`,
          ["f".repeat(64), owner, crypto.randomUUID()],
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("uses discounted prices for quotes and immutable order items while keeping cost private", async () => {
    await db.exec("begin");
    try {
      await db.query(
        `update products set discount_price_kobo=200000,cost_price_kobo=130000 where id=$1`,
        [product],
      );
      const q = (
        await db.query<{ q: any }>(`select calculate_quote($1,$2) q`, [
          JSON.stringify(input(crypto.randomUUID()).items),
          zone,
        ])
      ).rows[0]!.q;
      expect(q.subtotal).toBe(200000);
      const order = await begin(crypto.randomUUID());
      expect(order.subtotal).toBe(200000);
      await db.query(`update products set discount_price_kobo=190000 where id=$1`, [product]);
      expect(
        (
          await db.query<{ price_kobo: string }>(
            `select price_kobo from order_items where order_id=$1`,
            [order.id],
          )
        ).rows[0]!.price_kobo,
      ).toBe(200000);
      const catalogRow = (
        await db.query<{ price_kobo: string; regular_price_kobo: string }>(
          `select * from catalog where id=$1`,
          [product],
        )
      ).rows[0]!;
      expect(catalogRow).not.toHaveProperty("cost_price_kobo");
      expect(Number(catalogRow.price_kobo)).toBe(190000);
      expect(Number(catalogRow.regular_price_kobo)).toBe(240000);
    } finally {
      await db.exec("rollback");
    }
    await db.exec("set role authenticated");
    try {
      await expect(db.query(`select cost_price_kobo from products`)).rejects.toThrow();
      await expect(db.query(`select admin_sales_summary(null,null)`)).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("filters sales by verified payment time with an inclusive start and exclusive end", async () => {
    await db.exec("begin");
    try {
      for (const [at, status] of [
        ["2050-01-31T22:59:59Z", "paid"],
        ["2050-01-31T23:00:00Z", "paid"],
        ["2050-02-28T22:59:59Z", "paid"],
        ["2050-02-28T23:00:00Z", "paid"],
        ["2050-02-15T12:00:00Z", "review"],
      ]) {
        const order = await begin(crypto.randomUUID());
        await db.query(`update orders set payment_status=$2 where id=$1`, [order.id, status]);
        await db.query(`update payments set verified_at=$2 where order_id=$1`, [order.id, at]);
      }
      const summary = (
        await db.query<{ s: any }>(
          `select admin_sales_summary('2050-01-31T23:00:00Z','2050-02-28T23:00:00Z') s`,
        )
      ).rows[0]!.s;
      expect(summary.confirmed_orders).toBe(2);
      expect(summary.paid_kobo).toBe(grossUp(240000).total * 2);
    } finally {
      await db.exec("rollback");
    }
  });
  it("creates RLS on every operational table and blocks client writes", async () => {
    const tables = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`,
    );
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
    await db.exec(
      `set role authenticated;set request.jwt.claims='{"sub":"${customer}","aal":"aal1"}';`,
    );
    const rows = await db.query<{ id: string }>(`select id from profiles`);
    expect(rows.rows.map((r) => r.id)).toEqual([customer]);
    await expect(
      db.exec(`insert into staff_roles values('${customer}','owner')`),
    ).rejects.toThrow();
    await expect(db.exec(`select begin_checkout('{}',null,null,true)`)).rejects.toThrow();
    await db.exec("reset role");
  });
  it("calculates the correct gross amount below the fixed-fee threshold", async () => {
    const q = (
      await db.query<{ q: any }>(`select calculate_quote($1::jsonb,$2::uuid) q`, [
        JSON.stringify(input(crypto.randomUUID()).items),
        zone,
      ])
    ).rows[0]!.q;
    expect(q.total).toBe(grossUp(240000).total);
    expect(q.total).toBeLessThan(250000);
  });
  it("reserves once for an idempotent checkout and rejects excess stock", async () => {
    const request = crypto.randomUUID();
    const a = await begin(request, 2),
      b = await begin(request, 2);
    expect(a.id).toBe(b.id);
    expect(
      (
        await db.query<{ reserved: number }>(
          `select reserved from inventory_batches where product_id=$1`,
          [product],
        )
      ).rows[0]!.reserved,
    ).toBe(2);
    await expect(begin(crypto.randomUUID(), 99)).rejects.toThrow("STOCK_UNAVAILABLE");
  });
  it("rejects tampered amounts without crediting stock or payment", async () => {
    const o = await begin(crypto.randomUUID());
    const result = (
      await db.query<{ o: any }>(`select settle_payment($1,$2,'NGN','tampered',0,true) o`, [
        o.reference,
        o.total - 1,
      ])
    ).rows[0]!.o;
    expect(result.payment_status).toBe("review");
    expect(result.fulfillment_status).toBe("exception");
  });
  it("settles a payment once and holds a prescription order", async () => {
    const o = await begin(crypto.randomUUID());
    await db.query(`select attach_prescription($1,'private/prescription.pdf','application/pdf')`, [
      o.id,
    ]);
    const settle = () =>
      db.query<{ o: any }>(`select settle_payment($1,$2,'NGN','verified-one',5000,true) o`, [
        o.reference,
        o.total,
      ]);
    const a = (await settle()).rows[0]!.o;
    expect(a.payment_status).toBe("paid");
    expect(a.fulfillment_status).toBe("prescription_review");
    await settle();
    expect(
      (
        await db.query<{ count: number }>(
          `select count(*)::integer count from inventory_movements where reason=$1`,
          ["Payment " + o.reference],
        )
      ).rows[0]!.count,
    ).toBe(1);
    await expect(
      db.query(`select advance_delivery($1,'processing','','','',$2)`, [o.id, owner]),
    ).rejects.toThrow("ORDER_ON_HOLD");
    await db.query(`select review_prescription($1,'approved','Approved',$2)`, [o.id, pharmacist]);
    await db.query(`select advance_delivery($1,'processing','','','',$2)`, [o.id, owner]);
    await db.query(`select advance_delivery($1,'dispatched','On the way','Courier','REF',$2)`, [
      o.id,
      owner,
    ]);
    await expect(
      db.query(`select attach_prescription($1,'late.pdf','application/pdf')`, [o.id]),
    ).rejects.toThrow("PRESCRIPTION_UNAVAILABLE");
  });
  it("releases expired reservations and gates refunds on an approved fee policy", async () => {
    const o = await begin(crypto.randomUUID());
    await db.query(`update orders set reservation_expires=now()-interval '1 minute' where id=$1`, [
      o.id,
    ]);
    await db.exec("select release_expired()");
    expect(
      (
        await db.query<{ released: boolean }>(
          `select reservation_released released from orders where id=$1`,
          [o.id],
        )
      ).rows[0]!.released,
    ).toBe(true);
    await db.query(`select settle_payment($1,$2,'NGN','late-paid',5000,true)`, [
      o.reference,
      o.total,
    ]);
    await expect(
      db.query(`select reserve_refund($1,100,'Test',$2)`, [o.id, owner]),
    ).rejects.toThrow("REFUND_POLICY_REQUIRED");
    await db.exec(`update settings set refund_fee_policy='refund'`);
    const request = crypto.randomUUID();
    const r = (
      await db.query<{ r: any }>(`select reserve_refund($1,$2,'Test',$3,$4) r`, [
        o.id,
        o.total,
        owner,
        request,
      ])
    ).rows[0]!.r;
    const repeat = (
      await db.query<{ r: any }>(`select reserve_refund($1,$2,'Test',$3,$4) r`, [
        o.id,
        o.total,
        owner,
        request,
      ])
    ).rows[0]!.r;
    expect(repeat.id).toBe(r.id);
    await expect(
      db.query(`select reserve_refund($1,100,'Duplicate',$2)`, [o.id, owner]),
    ).rejects.toThrow("REFUND_AMOUNT_INVALID");
    await db.query(`select apply_refund($1,'processed','refund-one')`, [r.id]);
    await db.query(`select apply_refund($1,'processed','refund-one')`, [r.id]);
    expect(
      (
        await db.query<{ status: string }>(`select payment_status status from orders where id=$1`, [
          o.id,
        ])
      ).rows[0]!.status,
    ).toBe("refunded");
  });
  it("requires MFA in RLS staff permissions and shares rate counters", async () => {
    await db.exec(
      `set role authenticated;set request.jwt.claims='{"sub":"${owner}","aal":"aal1"}'`,
    );
    expect(
      (await db.query<{ ok: boolean }>(`select staff_allowed(array['owner']) ok`)).rows[0]!.ok,
    ).toBe(false);
    await db.exec(`set request.jwt.claims='{"sub":"${owner}","aal":"aal2"}'`);
    expect(
      (await db.query<{ ok: boolean }>(`select staff_allowed(array['owner']) ok`)).rows[0]!.ok,
    ).toBe(true);
    await db.exec("reset role");
    await db.exec(`select take_rate('rate-test',1,60)`);
    expect(
      (await db.query<{ ok: boolean }>(`select take_rate('rate-test',1,60) ok`)).rows[0]!.ok,
    ).toBe(false);
  });
  it("blocks unapproved live checkout", async () => {
    await expect(
      db.query(`select begin_checkout($1::jsonb,$2,'hash',false)`, [
        JSON.stringify(input(crypto.randomUUID())),
        customer,
      ]),
    ).rejects.toThrow("CHECKOUT_UNAVAILABLE");
  });
  it("keeps late payments on cancelled orders out of fulfillment", async () => {
    const o = await begin(crypto.randomUUID());
    await db.query(`select cancel_order($1,$2,'Customer requested cancellation')`, [o.id, owner]);
    const result = (
      await db.query<{ o: any }>(
        `select settle_payment($1,$2,'NGN','cancelled-late',5000,true) o`,
        [o.reference, o.total],
      )
    ).rows[0]!.o;
    expect(result.payment_status).toBe("review");
    expect(result.stock_committed).toBe(false);
    expect(result.fulfillment_status).toBe("exception");
  });
  it("prevents editors from claiming a pharmacist review", async () => {
    const post = (
      await db.query<{ id: string }>(
        `insert into blog_posts(title,slug,summary,category,cover,cover_alt,blocks,author_id,author_name,reviewer_id)values('Article','article','Health advice','Health','photo.webp','Photo','[]',$1,'Owner',$2) returning id`,
        [owner, pharmacist],
      )
    ).rows[0]!.id;
    await expect(db.query(`select approve_post_review($1,$2)`, [post, owner])).rejects.toThrow(
      "FORBIDDEN",
    );
    await db.query(`select approve_post_review($1,$2)`, [post, pharmacist]);
    expect(
      (
        await db.query<{ reviewed_at: unknown }>(`select reviewed_at from blog_posts where id=$1`, [
          post,
        ])
      ).rows[0]!.reviewed_at,
    ).toBeTruthy();
  });
});
describe("payment, content and upload boundaries", () => {
  it.each([0, 10000, 239999, 240000, 246249, 249999, 250000, 500000, 20000000])(
    "grosses up %i kobo without undercharging",
    (base) => {
      const q = grossUp(base);
      const fee = Math.min(200000, Math.ceil(q.total * 0.015) + (q.total >= 250000 ? 10000 : 0));
      expect(q.total - fee).toBeGreaterThanOrEqual(base);
      expect(q.total - base).toBeLessThanOrEqual(200000);
    },
  );
  it("verifies webhook HMAC and rejects altered bodies", () => {
    const raw = '{"event":"charge.success"}';
    const signed = createHmac("sha512", "secret").update(raw).digest("hex");
    expect(validSignature(raw, signed, "secret")).toBe(true);
    expect(validSignature(raw + " ", signed, "secret")).toBe(false);
    expect(validSignature(raw, "bad", "secret")).toBe(false);
  });
  it("allows Instagram post/reel links and rejects other destinations", () => {
    expect(instagramLink.safeParse("https://www.instagram.com/reel/Ab_123/").success).toBe(true);
    for (const link of [
      "javascript:alert(1)",
      "https://instagram.com.evil.test/p/abc/",
      "https://instagram.com/accounts/login/",
    ])
      expect(instagramLink.safeParse(link).success).toBe(false);
  });
  it("accepts structured text rather than executable HTML blocks", () => {
    expect(postSchema.safeParse({ blocks: [{ type: "html", html: "<script />" }] }).success).toBe(
      false,
    );
  });
  it("checks file signatures rather than trusting file extensions", () => {
    expect(detectFile(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFile(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});
