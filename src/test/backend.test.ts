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
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (file === "202611260008_split_manual_payments.sql") {
      // A deployed database may already lack the old receipt index.
      // Verify that upgrade path, then roll back and test the normal path too.
      await db.exec("begin; drop index public.manual_payment_receipts;");
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
      await db.exec("rollback;");
    }
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "-- gen_random_uuid is built into PostgreSQL.",
      ),
    );
  }
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
  it("prepares paid non-prescription orders automatically and uses short public receipt numbers", async () => {
    await db.exec("begin");
    try {
      await db.query("update products set prescription=false where id=$1", [product]);
      const order = (
        await db.query<{ o: any }>("select create_admin_order($1,$2::jsonb,$3,$4) o", [
          owner,
          JSON.stringify(input(crypto.randomUUID())),
          "a".repeat(64),
          "b".repeat(64),
        ])
      ).rows[0]!.o;
      expect(order.public_reference).toMatch(/^RP-[0-9]{6,}$/);
      const proof = crypto.randomUUID();
      await db.query(
        "insert into payment_evidence(id,order_id,actor,path) values($1,$2,$3,'private/photo.webp')",
        [proof, order.id, owner],
      );
      await db.exec("savepoint wrong_evidence");
      await expect(
        db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
          owner,
          order.id,
          crypto.randomUUID(),
          JSON.stringify([{ method: "card", amount: 240000, evidence_id: crypto.randomUUID() }]),
        ]),
      ).rejects.toThrow("PAYMENT_EVIDENCE_INVALID");
      await db.exec("rollback to savepoint wrong_evidence");
      const paid = (
        await db.query<{ o: any }>("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'') o", [
          owner,
          order.id,
          crypto.randomUUID(),
          JSON.stringify([{ method: "card", amount: 240000, evidence_id: proof }]),
        ])
      ).rows[0]!.o;
      expect(paid).toMatchObject({
        fulfillment_status: "processing",
        payment_status: "paid",
        reference: order.reference,
      });
      const receipt = (
        await db.query<{ document: any }>("select document from receipts where order_id=$1", [
          order.id,
        ])
      ).rows[0]!.document;
      expect(receipt.reference).toBe(order.public_reference);
      expect(receipt.number).toBe(order.public_reference.replace("RP-", "RCP-"));
      expect(JSON.stringify(receipt)).not.toContain(proof);
      expect(
        (await db.query("select admin_order_records('orders',$1) result", [order.public_reference]))
          .rows[0],
      ).toHaveProperty("result");
      await db.exec("savepoint evidence_private;set local role authenticated");
      await expect(db.query("select * from payment_evidence")).rejects.toThrow();
      await db.exec("rollback to savepoint evidence_private");
    } finally {
      await db.exec("rollback");
    }
  });

  it("records split collections atomically, verifies totals and preserves prescription holds and receipt amounts", async () => {
    await db.exec("begin");
    try {
      const create = async () =>
        (
          await db.query<{ o: any }>("select create_admin_order($1,$2::jsonb,$3,$4) o", [
            owner,
            JSON.stringify(input(crypto.randomUUID())),
            "a".repeat(64),
            crypto.randomUUID().replaceAll("-", "").repeat(2),
          ])
        ).rows[0]!.o;
      const o = await create(),
        request = crypto.randomUUID();
      const parts = [
        { method: "cash", amount: 100000, reference: "" },
        { method: "bank_transfer", amount: 140000, reference: "SPLIT-001" },
      ];
      await db.exec("savepoint split_total");
      await expect(
        db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
          owner,
          o.id,
          request,
          JSON.stringify([{ method: "cash", amount: 100 }]),
        ]),
      ).rejects.toThrow("MANUAL_PAYMENT_TOTAL");
      await db.exec("rollback to savepoint split_total");
      expect(
        (await db.query("select id from manual_payments where order_id=$1", [o.id])).rows,
      ).toHaveLength(0);
      const pay = () =>
        db.query<{ o: any }>("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'') o", [
          owner,
          o.id,
          request,
          JSON.stringify(parts),
        ]);
      expect((await pay()).rows[0]!.o).toMatchObject({
        payment_status: "paid",
        payment_method: "mixed",
        fulfillment_status: "prescription_review",
      });
      await pay();
      expect(
        (
          await db.query(
            "select * from manual_payment_parts where payment_id=(select id from manual_payments where order_id=$1)",
            [o.id],
          )
        ).rows,
      ).toHaveLength(2);
      const document = (
        await db.query<{ document: any }>("select document from receipts where order_id=$1", [o.id])
      ).rows[0]!.document;
      expect(document).toMatchObject({
        method: "mixed",
        payments: [
          { method: "cash", amount: 100000 },
          { method: "bank_transfer", amount: 140000 },
        ],
      });
      expect(JSON.stringify(document)).not.toContain("SPLIT-001");
      await db.exec("savepoint split_conflict");
      await expect(
        db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
          owner,
          o.id,
          request,
          JSON.stringify([{ method: "cash", amount: 240000 }]),
        ]),
      ).rejects.toThrow("PAYMENT_RECORD_CONFLICT");
      await db.exec("rollback to savepoint split_conflict");
      const otherOrder = await create();
      await db.exec("savepoint split_duplicate");
      await expect(
        db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
          owner,
          otherOrder.id,
          crypto.randomUUID(),
          JSON.stringify(parts),
        ]),
      ).rejects.toThrow();
      await db.exec("rollback to savepoint split_duplicate");
      expect(
        (await db.query("select id from manual_payments where order_id=$1", [otherOrder.id])).rows,
      ).toHaveLength(0);
      await db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
        owner,
        otherOrder.id,
        crypto.randomUUID(),
        JSON.stringify([
          { method: "card", amount: 100000 },
          { method: "other", amount: 140000 },
        ]),
      ]);
      await db.exec("savepoint split_forbidden");
      await expect(
        db.query("select record_manual_payment_parts($1,$2,$3,$4::jsonb,'')", [
          pharmacist,
          o.id,
          crypto.randomUUID(),
          JSON.stringify(parts),
        ]),
      ).rejects.toThrow("FORBIDDEN");
      await db.exec("rollback to savepoint split_forbidden");
      await db.exec("savepoint split_private; set local role authenticated");
      await expect(db.query("select * from manual_payment_parts")).rejects.toThrow();
      await db.exec("rollback to savepoint split_private");
    } finally {
      await db.exec("rollback");
    }
  });

  it("does not create pickup automatically and enforces free collection and its tracking sequence", async () => {
    expect(
      (await db.query("select id from shipping_zones where fulfillment_method='pickup'")).rows,
    ).toHaveLength(0);
    await db.exec("begin");
    try {
      const pickup = (
        await db.query<{ id: string }>(
          "insert into shipping_zones(state,lga,area,fee_kobo,estimate,fulfillment_method) values('Pickup','Pharmacy','Oregun pharmacy',0,'Ready today','pickup') returning id",
        )
      ).rows[0]!.id;
      await db.exec("savepoint pickup_fee");
      await expect(
        db.query("update shipping_zones set fee_kobo=100 where id=$1", [pickup]),
      ).rejects.toThrow();
      await db.exec("rollback to savepoint pickup_fee");
      await db.query("update products set prescription=false where id=$1", [product]);
      const order = (
        await db.query<{ o: any }>("select begin_checkout($1::jsonb,$2,'hash',true) o", [
          JSON.stringify({ ...input(crypto.randomUUID()), zone_id: pickup }),
          customer,
        ])
      ).rows[0]!.o;
      expect(order.delivery).toBe(0);
      expect(order.zone_snapshot.fulfillment_method).toBe("pickup");
      await db.query("select settle_payment($1,$2,'NGN','pickup-payment',0,true)", [
        order.reference,
        order.total,
      ]);
      await db.query("select update_order_tracking($1,'processing','','','','',$2,$3)", [
        order.id,
        owner,
        crypto.randomUUID(),
      ]);
      await db.exec("savepoint pickup_dispatch");
      await expect(
        db.query("select update_order_tracking($1,'dispatched','','','','',$2,$3)", [
          order.id,
          owner,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow("DELIVERY_SEQUENCE");
      await db.exec("rollback to savepoint pickup_dispatch");
      await db.query("select update_order_tracking($1,'delivered','Collected','','','',$2,$3)", [
        order.id,
        owner,
        crypto.randomUUID(),
      ]);
      expect(
        (await db.query("select fulfillment_status from orders where id=$1", [order.id])).rows[0],
      ).toMatchObject({ fulfillment_status: "delivered" });
    } finally {
      await db.exec("rollback");
    }
  });
  it("copies the signup phone into the private profile without changing email verification", async () => {
    await db.exec("begin");
    try {
      const id = crypto.randomUUID();
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'phone@example.com',$2)",
        [id, JSON.stringify({ name: "New Buyer", phone: "08012345678" })],
      );
      expect(
        (await db.query("select name,phone from profiles where id=$1", [id])).rows[0],
      ).toMatchObject({ name: "New Buyer", phone: "08012345678" });
      expect(
        (await db.query("select email_confirmed_at from auth.users where id=$1", [id])).rows[0],
      ).toMatchObject({ email_confirmed_at: null });
    } finally {
      await db.exec("rollback");
    }
  });
  it("assigns products during category creation and preserves assignments through renaming", async () => {
    await db.exec("begin");
    try {
      const category = (
        await db.query<{ id: string }>(
          "select save_category_products(null,'Care essentials',$1::uuid[],$2) id",
          [[product], owner],
        )
      ).rows[0]!.id;
      expect(
        (await db.query("select category from products where id=$1", [product])).rows[0],
      ).toMatchObject({ category: "Care essentials" });
      await db.query("select save_category_products($1,'Everyday care','{}'::uuid[],$2)", [
        category,
        owner,
      ]);
      expect(
        (await db.query("select category from products where id=$1", [product])).rows[0],
      ).toMatchObject({ category: "Everyday care" });
      await db.exec("savepoint missing_product");
      await expect(
        db.query("select save_category_products(null,'Do not create',$1::uuid[],$2)", [
          [crypto.randomUUID()],
          owner,
        ]),
      ).rejects.toThrow("CATEGORY_PRODUCTS_MISSING");
      await db.exec("rollback to savepoint missing_product");
      expect(
        (await db.query("select id from categories where name='Do not create'")).rows,
      ).toHaveLength(0);
      await db.exec("savepoint forbidden_category");
      await expect(
        db.query("select save_category_products($1,'Blocked',$2::uuid[],$3)", [
          category,
          [product],
          customer,
        ]),
      ).rejects.toThrow("FORBIDDEN");
      await db.exec("rollback to savepoint forbidden_category");
    } finally {
      await db.exec("rollback");
    }
  });
  it("captures immutable verified receipts and queues one email per public tracking update", async () => {
    await db.exec("begin");
    try {
      const o = await begin(crypto.randomUUID());
      expect(
        (await db.query("select * from receipts where order_id=$1", [o.id])).rows,
      ).toHaveLength(0);
      await db.query("select attach_prescription($1,'private/receipt.pdf','application/pdf')", [
        o.id,
      ]);
      await db.query("select settle_payment($1,$2,'NGN','receipt-test',0,true)", [
        o.reference,
        o.total,
      ]);
      const snapshot = (
        await db.query<{ document: any }>("select document from receipts where order_id=$1", [o.id])
      ).rows[0]!.document;
      expect(snapshot).toMatchObject({
        total: o.total,
        currency: "NGN",
        method: "paystack",
        customer: { name: "Customer" },
        items: [{ name: "Test Medicine", quantity: 1, price_kobo: 240000 }],
      });
      expect(
        (await db.query("select kind from notification_outbox where dedupe=$1", ["paid:" + o.id]))
          .rows[0],
      ).toMatchObject({ kind: "receipt" });
      await db.query("select settle_payment($1,$2,'NGN','receipt-test',0,true)", [
        o.reference,
        o.total,
      ]);
      expect(
        (await db.query("select * from receipts where order_id=$1", [o.id])).rows,
      ).toHaveLength(1);
      await db.exec("savepoint receipt_change");
      await expect(
        db.query("update receipts set document='{}' where order_id=$1", [o.id]),
      ).rejects.toThrow("RECEIPT_IMMUTABLE");
      await db.exec("rollback to savepoint receipt_change");
      await db.exec("savepoint held");
      await expect(
        db.query("select update_order_tracking($1,'processing','','','','',$2,$3)", [
          o.id,
          owner,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow("ORDER_ON_HOLD");
      await db.exec("rollback to savepoint held");
      await db.query("select review_prescription($1,'approved','Approved',$2)", [o.id, pharmacist]);
      const request = crypto.randomUUID();
      const update = () =>
        db.query(
          "select update_order_tracking($1,'processing','Packed safely','Courier','REF','Tomorrow',$2,$3)",
          [o.id, owner, request],
        );
      await update();
      await update();
      expect(
        (await db.query("select * from delivery_events where request_id=$1", [request])).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            "select * from notification_outbox where order_id=$1 and kind='delivery'",
            [o.id],
          )
        ).rows,
      ).toHaveLength(1);
      await db.query(
        "select update_order_tracking($1,'processing','Revised delivery time','','','Two days',$2,$3)",
        [o.id, owner, crypto.randomUUID()],
      );
      expect(
        (
          await db.query(
            "select * from notification_outbox where order_id=$1 and kind='delivery'",
            [o.id],
          )
        ).rows,
      ).toHaveLength(2);
      const count = (
        await db.query("select count(*) from notification_outbox where order_id=$1", [o.id])
      ).rows;
      const noteRequest = crypto.randomUUID();
      await db.query("select add_order_staff_note($1,$2,$3,'Internal only')", [
        o.id,
        owner,
        noteRequest,
      ]);
      await db.query("select add_order_staff_note($1,$2,$3,'Internal only')", [
        o.id,
        owner,
        noteRequest,
      ]);
      expect(
        (await db.query("select * from order_staff_notes where order_id=$1", [o.id])).rows,
      ).toHaveLength(1);
      expect(
        (await db.query("select count(*) from notification_outbox where order_id=$1", [o.id])).rows,
      ).toEqual(count);
      await db.query(
        "update orders set contact=jsonb_set(contact,'{name}',$2::jsonb),payment_status='refunded' where id=$1",
        [o.id, JSON.stringify("Changed name")],
      );
      expect(
        (
          await db.query<{ document: any }>("select document from receipts where order_id=$1", [
            o.id,
          ])
        ).rows[0]!.document,
      ).toEqual(snapshot);
      await db.exec("savepoint private_receipt; set local role authenticated");
      await expect(db.query("select * from receipts")).rejects.toThrow(/permission denied/);
      await db.exec("rollback to savepoint private_receipt");
      await db.exec("savepoint private_note; set local role authenticated");
      await expect(db.query("select * from order_staff_notes")).rejects.toThrow(
        /permission denied/,
      );
      await db.exec("rollback to savepoint private_note");
      await db.exec("savepoint wrong_staff");
      await expect(
        db.query("select update_order_tracking($1,'dispatched','','','','',$2,$3)", [
          o.id,
          customer,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow("FORBIDDEN");
      await db.exec("rollback to savepoint wrong_staff");
    } finally {
      await db.exec("rollback");
    }
  });

  it("creates staff purchases without gateway fees or account attachment and records manual payment once", async () => {
    await db.exec("begin");
    try {
      await db.exec("update settings set checkout_enabled=false");
      const request = crypto.randomUUID(),
        receipt = crypto.randomUUID();
      const create = () =>
        db.query<{ o: any }>("select create_admin_order($1,$2::jsonb,$3,$4) o", [
          owner,
          JSON.stringify(input(request)),
          "b".repeat(64),
          "c".repeat(64),
        ]);
      const o = (await create()).rows[0]!.o;
      expect((await create()).rows[0]!.o.id).toBe(o.id);
      expect(o).toMatchObject({
        created_by: owner,
        user_id: null,
        processing: 0,
        payment_method: "manual_pending",
        payment_status: "pending",
        total: 240000,
        test_mode: false,
      });
      expect(
        (await db.query("select 1 from tracking_tokens where order_id=$1", [o.id])).rows,
      ).toHaveLength(1);
      await db.exec("savepoint wrong_amount");
      await expect(
        db.query("select record_manual_payment($1,$2,$3,'cash',100,'RECEIPT-1','')", [
          owner,
          o.id,
          receipt,
        ]),
      ).rejects.toThrow("MANUAL_PAYMENT_TOTAL");
      await db.exec("rollback to savepoint wrong_amount");
      const pay = () =>
        db.query<{ o: any }>(
          "select record_manual_payment($1,$2,$3,'cash',240000,'RECEIPT-1','Received at pharmacy') o",
          [owner, o.id, receipt],
        );
      expect((await pay()).rows[0]!.o).toMatchObject({
        payment_status: "paid",
        payment_method: "cash",
        fulfillment_status: "prescription_review",
        stock_committed: true,
      });
      expect(
        (
          await db.query<{ document: any }>("select document from receipts where order_id=$1", [
            o.id,
          ])
        ).rows[0]!.document,
      ).toMatchObject({ method: "cash", total: 240000 });
      await pay();
      expect(
        (
          await db.query<{ quantity: number }>(
            "select quantity from inventory_batches where product_id=$1",
            [product],
          )
        ).rows[0]!.quantity,
      ).toBe(9);
      expect(
        (await db.query("select 1 from manual_payments where order_id=$1", [o.id])).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            "select 1 from audit_log where resource_id=$1 and action in ('admin_order_created','manual_payment_recorded')",
            [o.id],
          )
        ).rows,
      ).toHaveLength(2);
      await db.exec("savepoint duplicate_payment");
      await expect(
        db.query("select record_manual_payment($1,$2,$3,'cash',240000,'RECEIPT-2','')", [
          owner,
          o.id,
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow("PAYMENT_ALREADY_RECEIVED");
      await db.exec("rollback to savepoint duplicate_payment");
      await db.exec("savepoint offline_refund");
      await expect(
        db.query(
          "insert into refunds(order_id,amount,reason,actor) values($1,100,'Manual return',$2)",
          [o.id, owner],
        ),
      ).rejects.toThrow("MANUAL_REFUND_REQUIRED");
      await db.exec("rollback to savepoint offline_refund");
    } finally {
      await db.exec("rollback");
    }
  });
  it("prevents manual recording on customer checkouts and rejects non-admin staff", async () => {
    await db.exec("begin");
    try {
      const o = await begin(crypto.randomUUID());
      await db.exec("savepoint customer_payment");
      await expect(
        db.query("select record_manual_payment($1,$2,$3,'bank_transfer',$4,'BANK-1','')", [
          owner,
          o.id,
          crypto.randomUUID(),
          o.total,
        ]),
      ).rejects.toThrow("MANUAL_ORDER_REQUIRED");
      await db.exec("rollback to savepoint customer_payment");
      await db.exec("savepoint non_admin");
      await expect(
        db.query("select create_admin_order($1,$2::jsonb,$3,$4)", [
          pharmacist,
          JSON.stringify(input(crypto.randomUUID())),
          "b".repeat(64),
          "c".repeat(64),
        ]),
      ).rejects.toThrow("FORBIDDEN");
      await db.exec("rollback to savepoint non_admin");
    } finally {
      await db.exec("rollback");
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.query("select create_admin_order($1,$2::jsonb,$3,$4)", [
            owner,
            JSON.stringify(input(crypto.randomUUID())),
            "b".repeat(64),
            "c".repeat(64),
          ]),
        ).rejects.toThrow("permission denied");
        await expect(db.query("select * from manual_payments")).rejects.toThrow(
          "permission denied",
        );
      } finally {
        await db.exec("reset role");
      }
    }
  });
  it("restores an owner only with a verified email, active session and unexpired MFA, and audits once", async () => {
    const session = "00000000-0000-4000-8000-000000000090";
    const factor = "00000000-0000-4000-8000-000000000091";
    const token = "a".repeat(64);
    await db.exec("begin");
    try {
      await db.query("insert into app_sessions(id,user_id) values($1,$2)", [session, other]);
      await db.query(
        "insert into mfa_browser_grants values($1,$2,$3,now()-interval '1 minute',now()+interval '1 hour')",
        [token, other, factor],
      );
      const recover = () =>
        db.query("select recover_owner_access($1,$2,$3,$4)", [
          other,
          "two@example.com",
          session,
          token,
        ]);
      for (const change of [
        "update auth.users set email_confirmed_at=null where email='two@example.com'",
        "update app_sessions set revoked=true",
        "update app_sessions set recovery=true",
        "update app_sessions set last_seen=now()-interval '24 hours'",
        "update app_sessions set created_at=now()-interval '7 days'",
        "update mfa_browser_grants set expires_at=now()-interval '1 second'",
        "update profiles set sessions_revoked_at=now()",
      ]) {
        await db.exec("savepoint invalid_recovery");
        await db.exec(change);
        await expect(recover()).rejects.toThrow("OWNER_RECOVERY_REQUIRED");
        await db.exec("rollback to savepoint invalid_recovery");
      }
      await db.exec("savepoint invalid_email");
      await expect(
        db.query("select recover_owner_access($1,'wrong@example.com',$2,$3)", [
          other,
          session,
          token,
        ]),
      ).rejects.toThrow("OWNER_RECOVERY_REQUIRED");
      await db.exec("rollback to savepoint invalid_email");
      await recover();
      await recover();
      expect(
        (
          await db.query(
            "select 1 from audit_log where actor=$1 and action='environment_owner_recovered'",
            [other],
          )
        ).rows,
      ).toHaveLength(1);
      // The recovered role must satisfy database authorization, not just the UI.
      await db.query("select manage_staff_role($1,$2,'admin',false)", [other, customer]);
      expect(
        (await db.query("select 1 from staff_roles where user_id=$1 and role='admin'", [customer]))
          .rows,
      ).toHaveLength(1);
    } finally {
      await db.exec("rollback");
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.query("select recover_owner_access($1,'two@example.com',$2,$3)", [
            other,
            session,
            token,
          ]),
        ).rejects.toThrow("permission denied");
      } finally {
        await db.exec("reset role");
      }
    }
  });
  it("lets administrators grant staff roles while protecting owners and self access", async () => {
    await db.exec("begin");
    try {
      await db.query("select manage_staff_role($1,$2,'admin',false)", [owner, customer]);
      await db.query("select manage_staff_role($1,$2,'pharmacist',false)", [customer, other]);
      expect(
        (
          await db.query("select 1 from staff_roles where user_id=$1 and role='pharmacist'", [
            other,
          ])
        ).rows,
      ).toHaveLength(1);
      for (const [actor, target, role, remove] of [
        [customer, other, "owner", false],
        [customer, owner, "owner", true],
        [customer, customer, "admin", true],
        [other, customer, "admin", false],
      ] as const) {
        await db.exec("savepoint protected_access");
        await expect(
          db.query("select manage_staff_role($1,$2,$3,$4)", [actor, target, role, remove]),
        ).rejects.toThrow();
        await db.exec("rollback to savepoint protected_access");
      }
      expect(
        (
          await db.query("select 1 from audit_log where actor=$1 and action='staff_role_granted'", [
            owner,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await db.exec("rollback");
    }
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select staff_account_by_email('one@example.com')")).rejects.toThrow();
      await expect(
        db.query("select manage_staff_role($1,$2,'admin',false)", [owner, customer]),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("checks admin setup without reading customer records", async () => {
    const result = await db.query<{ name: string; exists: boolean; service_access: boolean }>(
      readFileSync("supabase/operations/verify-admin.sql", "utf8"),
    );
    expect(result.rows).toHaveLength(8);
    expect(result.rows.every((row) => row.exists && row.service_access)).toBe(true);
  });
  it("can safely repeat the release-specific admin repair without deleting records", async () => {
    const before = (
      await db.query<{ count: number }>("select count(*)::integer count from profiles")
    ).rows[0]!.count;
    const repair = readFileSync("supabase/operations/repair-admin-loading.sql", "utf8");
    await db.exec(repair);
    await db.exec(repair);
    expect(
      (await db.query<{ count: number }>("select count(*)::integer count from profiles")).rows[0]!
        .count,
    ).toBe(before);
    const directory = (
      await db.query<{ result: { rows: unknown[] } }>("select admin_customer_directory() result")
    ).rows[0]!.result;
    expect(directory.rows).toHaveLength(before);
  });
  it("searches purchased-item snapshots and customer details with date bounds before pagination", async () => {
    await db.exec("begin");
    try {
      const paid = await begin(crypto.randomUUID());
      const pending = await begin(crypto.randomUUID());
      await db.query(
        `update orders set payment_status='paid',contact=contact||'{"name":"Chisom Buyer","phone":"08098765432"}'::jsonb,created_at='2026-10-31T22:59:00Z' where id=$1`,
        [paid.id],
      );
      await db.query(`update orders set created_at='2026-10-31T23:00:00Z' where id=$1`, [
        pending.id,
      ]);
      await db.query(`update order_items set name='Original Multivitamin Pack' where order_id=$1`, [
        paid.id,
      ]);
      const search = async (
        query: string,
        statuses = ["paid"],
        from: string | null = null,
        to: string | null = null,
      ) =>
        (
          await db.query<{ result: { rows: any[]; more: boolean } }>(
            `select admin_order_records('orders',$1,$2,$3,$4,0) result`,
            [query, statuses, from, to],
          )
        ).rows[0]!.result;
      for (const query of [
        "Multivitamin",
        "Chisom",
        "08098765432",
        "one@example.com",
        paid.reference,
      ]) {
        expect((await search(query)).rows.map((row) => row.id)).toEqual([paid.id]);
      }
      const filtered = await search(
        "",
        ["paid", "pending"],
        "2026-10-30T23:00:00Z",
        "2026-10-31T23:00:00Z",
      );
      expect(filtered.rows.map((row) => row.id)).toEqual([paid.id]);
      expect(filtered.rows[0]).not.toHaveProperty("guest_hash");
      expect((await search("", ["pending"])).rows.map((row) => row.id)).toEqual([pending.id]);
      await db.query(
        `insert into prescriptions(order_id,path,mime,created_at) values($1,'private/test-search.pdf','application/pdf','2026-10-31T22:59:00Z')`,
        [paid.id],
      );
      const prescriptions = (
        await db.query<{ result: { rows: any[] } }>(
          `select admin_order_records('prescriptions','Multivitamin',null,'2026-10-30T23:00:00Z','2026-10-31T23:00:00Z',0) result`,
        )
      ).rows[0]!.result;
      expect(prescriptions.rows).toHaveLength(1);
      expect(prescriptions.rows[0]).not.toHaveProperty("path");
      await db.query(
        `insert into refunds(order_id,amount,reason,actor) values($1,100,'Search fixture',$2)`,
        [paid.id, owner],
      );
      expect(
        (
          await db.query<{ result: { rows: any[] } }>(
            `select admin_order_records('refunds','Chisom') result`,
          )
        ).rows[0]!.result.rows,
      ).toHaveLength(1);
    } finally {
      await db.exec("rollback");
    }
  });

  it("returns paginated customer emails and addresses only through server-only functions", async () => {
    await db.exec("begin");
    try {
      await db.query(`update profiles set name='Buyer One',phone='08012345678' where id=$1`, [
        customer,
      ]);
      await db.query(
        `insert into addresses(user_id,name,phone,address,state,lga) values($1,'Buyer One','08012345678','12 Oregun Road','Lagos','Ikeja')`,
        [customer],
      );
      const result = (
        await db.query<{ result: { rows: any[] } }>(
          `select admin_customer_directory('one@example.com') result`,
        )
      ).rows[0]!.result;
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: customer,
        email: "one@example.com",
        phone: "08012345678",
      });
      expect(result.rows[0].addresses[0].address).toBe("12 Oregun Road");
      expect(result.rows[0]).not.toHaveProperty("sessions_revoked_at");
    } finally {
      await db.exec("rollback");
    }
    await db.exec("set role authenticated");
    try {
      await expect(db.query(`select admin_customer_directory()`)).rejects.toThrow();
      await expect(db.query(`select admin_order_records('orders')`)).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
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
describe("ranked partial catalog search", () => {
  it("matches partial names, categories and ingredients, ranks names first and paginates by twenty", async () => {
    await db.exec(`insert into products(name,slug,category,detail,price_kobo,image,image_alt,directions,storage,active)
      values ('Paracetamol Search','search-name','Pain relief','500mg',100,'photo','Photo','','',true),
             ('Generic Search','search-ingredient','Pain relief','Contains paracetamol',100,'photo','Photo','','',true);
      insert into products(name,slug,category,price_kobo,image,image_alt,directions,storage,active)
      select 'Page item '||n,'search-page-'||n,'Search pages',100,'photo','Photo','','',true from generate_series(1,25) n;`);
    const names = (
      await db.query<{ name: string }>("select name from search_catalog('parace')")
    ).rows.map((row) => row.name);
    expect(names).toEqual(["Paracetamol Search", "Generic Search"]);
    expect((await db.query("select id from search_catalog('pain')")).rows).toHaveLength(2);
    const first = (
      await db.query<{ id: string }>(
        "select id from search_catalog('page', 'All', null, false, false, 'featured', 0)",
      )
    ).rows;
    const next = (
      await db.query<{ id: string }>(
        "select id from search_catalog('page', 'All', null, false, false, 'featured', 1)",
      )
    ).rows;
    expect(first).toHaveLength(21);
    expect(next).toHaveLength(5);
    expect(next.some((row) => first.slice(0, 20).some((item) => item.id === row.id))).toBe(false);
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
