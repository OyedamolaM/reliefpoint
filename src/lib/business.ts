import type { PublicSettings } from "./contracts";
// Operational policy drafts. The owner must approve the configured versions before live checkout.
export const policyDefaults: PublicSettings = {
  terms_text: `These terms apply to your use of Relief Point Pharmacy and purchases made through this website.

Provide accurate contact and delivery details and keep your account credentials secure. You may shop as a guest. Account registration requires email verification. Pharmacy staff may contact you about your purchase or prescription.

Prices are displayed in Nigerian naira. Delivery charges and any payment processing fee are shown before you pay. Online payments are confirmed with our payment provider; cash or bank-transfer payments on staff-created orders are confirmed by authorised staff. Do not pay again while a payment is being checked.

Product availability is checked at checkout. Prescription medicines require a valid prescription and pharmacist approval before dispatch. Substitutions require your consent. Website health information does not replace individual advice from a qualified healthcare professional.

Delivery fees and estimated delivery times depend on the area selected. Please read our Shipping Policy, Refund Policy and Privacy Policy before placing a purchase. If an item cannot be supplied or a prescription cannot be approved, our team will explain the available resolution. Refunds follow the applicable policy shown at checkout.

Contact support@reliefpointpharmacy.com or +234 706 784 1607 for account, purchase or policy questions.`,
  privacy_text: `Relief Point Pharmacy handles customer information to provide pharmacy support, process purchases and arrange delivery.

When you use the relevant services, we collect your name, email, phone number, delivery address, account information, order history and prescriptions you choose to upload. Prescription information is restricted to authorised pharmacy staff. Please avoid sharing medical information through the general contact form.

Supabase supports account authentication, database and file storage. Paystack processes payments; we do not store your card number, PIN or bank password. Brevo sends account and transaction emails. Delivery providers receive the contact and address information needed to deliver your order.

Essential cookies keep you signed in and protect checkout. Optional browser storage remembers your basket, wishlist and delivery details only when you allow it in Cookie settings or checkout. Delivery drafts include your name, email, phone, address, delivery area and note, expire after seven days, and are removed on sign-out or account switching. Prescription files, payment details and authentication tokens are never saved in these drafts. Essential only keeps checkout details in memory for the current visit; signed-in account lists are still saved to your account. You can change your choice using Cookie settings in the footer. Declining optional storage removes saved browser lists and delivery drafts without signing you out. The preference lasts 180 days. We do not use advertising or analytics trackers. Signing out clears private account data from the interface. Instagram links open Instagram only when you choose to follow them.

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
