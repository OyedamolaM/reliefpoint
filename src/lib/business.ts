import type { PublicSettings } from "./contracts";
// Operational policy drafts. The owner must approve the configured versions before live checkout.
export const policyDefaults: PublicSettings = {
  privacy_text: `Relief Point Pharmacy handles customer information to provide pharmacy support, process purchases and arrange delivery.

When you use the relevant services, we collect your name, email, phone number, delivery address, account information, order history and prescriptions you choose to upload. Prescription information is restricted to authorised pharmacy staff. Please avoid sharing medical information through the general contact form.

Supabase supports account authentication, database and file storage. Paystack processes payments; we do not store your card number, PIN or bank password. Brevo sends account and transaction emails. Delivery providers receive the contact and address information needed to deliver your order.

Essential cookies keep you signed in and protect checkout. Your browser may also store your basket and wishlist. Signing out clears private account data from the interface. Instagram links open Instagram only when you choose to follow them.

We restrict access to customer records and retain information according to applicable obligations and our approved retention schedule. Prescription files are kept separately from public product photos. You can request access, correction or deletion, subject to identity checks and applicable recordkeeping requirements.

For privacy requests, contact support@reliefpointpharmacy.com or +234 706 784 1607.`,
  refund_text: `If an item is incorrect, damaged, defective or unsuitable for supply after pharmacist review, contact support@reliefpointpharmacy.com or +234 706 784 1607 with your order reference. Keep the product and packaging available for assessment.

Prescription orders require pharmacist approval before dispatch. If a prescription cannot be approved or an item cannot be supplied, our team will contact you about the available resolution. Substitutions require your consent.

Medicine returns require pharmacist assessment because storage and product integrity affect safety. Please contact us before returning a medicine. This does not remove any rights you have regarding defective or incorrectly supplied goods.

Approved refunds are processed through the original payment channel. We provide a breakdown of the products, delivery and processing fees included in your refund. Any processing-fee treatment must follow the terms approved and shown before your purchase. Your bank or payment provider determines when processed funds appear in your account.

If a payment appears pending, check its status or contact us before paying again.`,
  shipping_text: `Delivery availability, fees and estimated delivery times depend on your location. Select the delivery area that matches your address during checkout to see the applicable terms before payment.

Provide your full name, reachable phone number, email and complete street address. If your location is not listed, contact our team before purchasing. Any free-delivery threshold is shown in the applicable delivery zone.

Orders are prepared after payment confirmation. Prescription medicines also require pharmacist approval. Delivery estimates are not emergency-service guarantees. Our team will contact you if prescription review, stock availability or delivery conditions affect your order.

You can view delivery updates in your account or request a secure guest-tracking link using your checkout email and order reference. Contact support@reliefpointpharmacy.com or +234 706 784 1607 to report delivery issues or request an address change before dispatch.`,
};
