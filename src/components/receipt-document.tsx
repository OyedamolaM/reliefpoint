import { formatNaira } from "@/lib/commerce";
import { paymentMethodLabel, receiptDate, type Receipt } from "@/lib/receipt";

// This sheet carries its styles into the isolated print document as well.
export function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  return (
    <article className="receipt-sheet" aria-label="Payment receipt document">
      <style>{receiptStyles}</style>
      <header className="receipt-heading">
        <div className="receipt-brand">
          <img src="/reliefpoint-email-logo.png" alt="" width="44" height="44" />
          <h2>{receipt.business.name}</h2>
        </div>
        <div className="receipt-heading-label">
          <p>Payment receipt</p>
          <span className={receipt.test_mode ? "receipt-test" : "receipt-paid"}>
            {receipt.test_mode ? "Test payment" : "Paid"}
          </span>
        </div>
      </header>
      {receipt.test_mode && (
        <p className="receipt-test-notice">Test receipt — no live payment was received.</p>
      )}
      <div className="receipt-parties">
        <section>
          <h3>Receipt details</h3>
          <dl className="receipt-metadata">
            <div>
              <dt>Receipt no.</dt>
              <dd>{receipt.number}</dd>
            </div>
            <div>
              <dt>Order no.</dt>
              <dd>{receipt.reference}</dd>
            </div>
            <div>
              <dt>Date paid</dt>
              <dd>{receiptDate(receipt.paid_at)} WAT</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Billed to</h3>
          <p className="receipt-customer-name">{receipt.customer.name}</p>
          {[receipt.customer.email, receipt.customer.phone, receipt.customer.address]
            .filter(Boolean)
            .map((value, index) => (
              <p className="receipt-contact" key={index}>
                {value}
              </p>
            ))}
        </section>
      </div>
      <table className="receipt-items">
        <caption className="sr-only">Purchased items</caption>
        <colgroup>
          <col className="receipt-col-item" />
          <col className="receipt-col-qty" />
          <col className="receipt-col-price" />
          <col className="receipt-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="receipt-unit">
              Qty
            </th>
            <th scope="col" className="receipt-unit receipt-numeric">
              Unit price
            </th>
            <th scope="col" className="receipt-numeric">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item, index) => (
            <tr key={index}>
              <td>
                <span className="receipt-item-name">{item.name}</span>
                <span className="receipt-mobile-unit">
                  {item.quantity} × {formatNaira(item.price_kobo / 100)}
                </span>
              </td>
              <td className="receipt-unit">{item.quantity}</td>
              <td className="receipt-unit receipt-numeric">{formatNaira(item.price_kobo / 100)}</td>
              <td className="receipt-numeric">
                {formatNaira((item.price_kobo * item.quantity) / 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-summary">
        <section className="receipt-payment">
          <h3>Payment method</h3>
          <p>{paymentMethodLabel(receipt.method)}</p>
          {receipt.payments && receipt.payments.length > 1 && (
            <dl>
              {receipt.payments.map((part, index) => (
                <div key={index}>
                  <dt>{paymentMethodLabel(part.method)}</dt>
                  <dd>{formatNaira(part.amount / 100)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <dl className="receipt-totals">
          {[
            ["Subtotal", receipt.subtotal],
            ["Delivery", receipt.delivery],
            ["Processing fee", receipt.processing],
            ["Total paid", receipt.total],
          ].map(([label, amount]) => (
            <div key={label} className={label === "Total paid" ? "receipt-grand-total" : ""}>
              <dt>{label}</dt>
              <dd>{formatNaira(Number(amount) / 100)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <footer className="receipt-footer">
        <p className="receipt-thanks">Thank you for choosing ReliefPoint.</p>
        {receipt.business.address && <p>{receipt.business.address}</p>}
        <p>
          {receipt.business.email}
          <br />
          {receipt.business.phone}
        </p>
        <p className="receipt-note">
          Payment confirmation does not replace pharmacist approval or confirm delivery. Refunds are
          recorded separately.
        </p>
      </footer>
    </article>
  );
}

const receiptStyles = `
.receipt-sheet{background:#fff;color:#24334b;font:13px/1.5 Arial,sans-serif;padding:28px;border:1px solid #e2e8f0;border-radius:12px;overflow-wrap:anywhere}
.receipt-sheet *{box-sizing:border-box}.receipt-sheet h2,.receipt-sheet h3,.receipt-sheet p,.receipt-sheet dl,.receipt-sheet dd{margin:0}
.receipt-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:2px solid #173fc5}
.receipt-brand{display:flex;align-items:center;gap:12px;min-width:0}.receipt-brand img{width:44px;height:44px;object-fit:contain;flex-shrink:0}.receipt-brand h2{font-size:17px;font-weight:700;line-height:1.3;max-width:210px;color:#14285e}
.receipt-heading-label{text-align:right;flex-shrink:0}.receipt-heading-label>p{font-size:12px;font-weight:700;color:#64748b}.receipt-paid,.receipt-test{display:inline-block;margin-top:6px;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;background:#eaf7ef;color:#206341}.receipt-test{background:#fff2d6;color:#875211}.receipt-test-notice{padding:10px 0;color:#875211}
.receipt-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px 0}.receipt-sheet h3{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:10px}.receipt-metadata>div{display:grid;grid-template-columns:84px 1fr;gap:8px;margin-bottom:6px}.receipt-metadata dt{color:#64748b}.receipt-metadata dd{font-weight:600}.receipt-customer-name{font-weight:700;margin-bottom:4px!important}.receipt-contact{font-size:12px;color:#526179;margin-top:3px!important}
.receipt-items{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}.receipt-col-item{width:43%}.receipt-col-qty{width:9%}.receipt-col-price{width:23%}.receipt-col-amount{width:25%}.receipt-items th{background:#f1f5fb;color:#526179;font-size:10px;font-weight:700;padding:11px 8px;text-align:left}.receipt-items td{border-bottom:1px solid #e2e8f0;padding:14px 8px;vertical-align:top}.receipt-items .receipt-numeric{text-align:right;font-variant-numeric:tabular-nums}.receipt-item-name{font-weight:600}.receipt-mobile-unit{display:none}.receipt-items caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.receipt-summary{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px 0}.receipt-payment{font-size:12px}.receipt-payment dl{margin-top:10px}.receipt-payment dl>div{display:flex;justify-content:space-between;gap:12px;margin-top:5px}.receipt-totals>div{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-variant-numeric:tabular-nums}.receipt-totals dd{text-align:right;font-weight:600}.receipt-grand-total{border-top:2px solid #173fc5;margin-top:8px;padding-top:12px!important;font-size:16px;font-weight:700;color:#14285e}
.receipt-footer{border-top:1px solid #e2e8f0;padding-top:20px;font-size:11px;color:#64748b}.receipt-footer>p{margin-top:7px}.receipt-thanks{font-weight:700;color:#24334b;font-size:12px}.receipt-note{font-size:10px;line-height:1.6;margin-top:14px!important}
@media screen and (max-width:520px){.receipt-sheet{padding:18px 14px}.receipt-heading{gap:12px;padding-bottom:18px}.receipt-brand{gap:8px}.receipt-brand h2{font-size:14px}.receipt-brand img{width:34px;height:34px}.receipt-heading-label>p{font-size:10px}.receipt-parties{grid-template-columns:1fr;gap:20px;padding:20px 0}.receipt-summary{grid-template-columns:1fr;gap:20px}.receipt-totals{order:-1}.receipt-items,.receipt-items thead,.receipt-items tbody{display:block}.receipt-items colgroup{display:none}.receipt-items tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(100px,38%)}.receipt-items th,.receipt-items td{display:block}.receipt-items .receipt-numeric{white-space:nowrap;font-size:11px}.receipt-items .receipt-unit{display:none}.receipt-col-item{width:62%}.receipt-col-qty,.receipt-col-price{width:0}.receipt-col-amount{width:38%}.receipt-mobile-unit{display:block;font-size:11px;color:#64748b;margin-top:5px}.receipt-items td{padding:12px 6px}.receipt-items th{padding:10px 6px}}
@media print{.receipt-sheet{border:0;border-radius:0;padding:0;font-size:11px}.receipt-heading,.receipt-parties,.receipt-summary,.receipt-footer{break-inside:avoid}.receipt-items tr{break-inside:avoid}.receipt-items thead{display:table-header-group}.receipt-sheet{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
