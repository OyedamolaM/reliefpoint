import { ReceiptDocument } from "./receipt-document";
import { useRef, useState } from "react";
import { Download, Printer, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { receiptSchema } from "@/lib/receipt";
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
      "<!doctype html><html><head><title>ReliefPoint receipt</title><style>body{margin:0;background:white}@page{margin:15mm}</style></head><body>" +
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Payment receipt</DialogTitle>
          <DialogDescription>
            Original payment record. Refunds are shown separately on your order.
          </DialogDescription>
          <div ref={paper}>
            <ReceiptDocument receipt={receipt} />
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
