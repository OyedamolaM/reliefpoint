import { useRef, useState } from "react";
import { Download, Printer, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { receiptSchema, receiptDate, paymentMethodLabel } from "@/lib/receipt";
import { formatNaira } from "@/lib/commerce";
import { ClientError, notifyError } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";

export function OrderReceipt({
  document,
  id,
  token,
  admin = false,
}: {
  document: unknown;
  id: string;
  token?: string;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const paper = useRef<HTMLDivElement>(null);
  const parsed = receiptSchema.safeParse(document);
  if (!parsed.success) return null;
  const receipt = parsed.data;
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/${admin ? "admin/" : ""}receipts/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
        {
          credentials: "same-origin",
          signal: AbortSignal.timeout(25000),
        },
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new ClientError(
          payload.error?.message ?? "We couldn’t download your receipt. Please try again.",
          payload.error?.code ?? "RECEIPT_UNAVAILABLE",
          response.status,
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `ReliefPoint-${receipt.reference}.pdf`;
      window.document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };
  const print = () => {
    if (!paper.current) return;
    const frame = window.document.createElement("iframe");
    frame.title = "Print payment receipt";
    frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10000px;border:0";
    window.document.body.append(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      toast.error("Please download the PDF to print your receipt.");
      return;
    }
    doc.open();
    doc.write(
      "<!doctype html><html><head><title>ReliefPoint receipt</title><style>body{font:14px Arial,sans-serif;color:#10235f;margin:32px}img{width:44px;height:44px}h2{font-size:26px;color:#173FC5}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{text-align:left;padding:10px 4px;border-bottom:1px solid #ddd}dl>div{display:flex;justify-content:space-between;padding:8px 0}dd{font-weight:bold}p{line-height:1.6;overflow-wrap:anywhere}@page{margin:15mm}</style></head><body>" +
        paper.current.outerHTML +
        "</body></html>",
    );
    doc.close();
    const cleanup = () => frame.remove();
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        toast.error("Please download the PDF to print your receipt.");
        cleanup();
      }
    }, 300);
    setTimeout(cleanup, 120000);
  };
  return (
    <section id="receipt" className="rounded-2xl border border-brand/15 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ReceiptText className="size-6 text-brand" />
          <div>
            <h2 className="font-bold">Payment receipt</h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">{receipt.number}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>
            View receipt
          </Button>
          <Button onClick={() => void download()} disabled={busy}>
            <Download className="size-4" />
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Payment receipt</DialogTitle>
          <DialogDescription>
            Original payment record. Refunds are shown separately on your order.
          </DialogDescription>
          <div ref={paper} className="space-y-4 rounded-xl border p-4 sm:p-6">
            <img
              src="/reliefpoint-email-logo.png"
              alt="ReliefPoint Pharmacy"
              width="44"
              height="44"
            />
            <h2 className="text-2xl font-bold">{receipt.business.name}</h2>
            {receipt.test_mode && <p className="font-bold">TEST PAYMENT — no live payment</p>}
            <p className="break-all">
              Receipt: {receipt.number}
              <br />
              Order: {receipt.reference}
              <br />
              Paid: {receiptDate(receipt.paid_at)} WAT
              <br />
              Payment method: {paymentMethodLabel(receipt.method)}
            </p>
            <p className="break-words">
              <strong>Billed to</strong>
              <br />
              {receipt.customer.name}
              <br />
              {receipt.customer.email}
              <br />
              {receipt.customer.phone}
              <br />
              {receipt.customer.address}
            </p>
            <table className="w-full table-fixed break-words text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Item</th>
                  <th className="px-2">Qty</th>
                  <th className="px-2">Unit price</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, index) => (
                  <tr key={index} className="border-b align-top">
                    <td className="break-words py-3">{item.name}</td>
                    <td className="px-2 py-3">{item.quantity}</td>
                    <td className="px-2 py-3">{formatNaira(item.price_kobo / 100)}</td>
                    <td className="py-3 text-right">
                      {formatNaira((item.price_kobo * item.quantity) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl>
              {[
                ["Subtotal", receipt.subtotal],
                ["Delivery", receipt.delivery],
                ["Processing fee", receipt.processing],
                ["Total paid", receipt.total],
              ].map(([label, amount]) => (
                <div className="flex justify-between gap-3 py-2" key={label}>
                  <dt>{label}</dt>
                  <dd className="font-bold">{formatNaira(Number(amount) / 100)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Payment confirmation does not replace pharmacist approval or confirm delivery. Refunds
              are recorded separately.
            </p>
            <p className="text-sm">
              {receipt.business.address && (
                <>
                  {receipt.business.address}
                  <br />
                </>
              )}
              {receipt.business.email}
              <br />
              {receipt.business.phone}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={print}>
              <Printer className="size-4" />
              Print / Save as PDF
            </Button>
            <Button disabled={busy} onClick={() => void download()}>
              <Download className="size-4" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
