# Reliefpoint Lime Pharmacy

Hi I want to build a website like medplus.com.ng, https://medplusnig.com/

Automated payment and delivery

Rewards/loyalty

Products

Services

Chat on whatsap

Lead to social media pages

And other features on their site.

Electric lime green is my brand color

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://reliefpoint-lime-pharmacy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/84450c77-c0ab-5602-b0f8-bdb06602e85f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Frontend storefront

The customer storefront follows the retail structure of medplusnig.com, using
ReliefPoint forest green and electric lime. The existing /, /marketplace and
/care-studio routes remain available. The public design switcher and simulated
points wallet have been removed.

Implemented frontend flows include search suggestions, category and price
filters, sorting, wishlist, quantity controls, persistent basket, Nigerian
delivery estimates, prescription file selection, guest checkout, payment method
selection and checkout summary. Account screens include sign-in, registration,
password visibility, password confirmation, reset and an optional session-only
shopping profile. Online authentication is deliberately unconnected.

No backend, payment gateway or customer database is connected. Checkout does not
charge, create orders or award rewards. It offers an explicit WhatsApp basket
enquiry instead. Prescriptions remain in browser memory; files are not uploaded
or attached to WhatsApp automatically. Contact fields clear when checkout
closes; only catalog IDs, quantities and wishlist IDs are stored locally.
Account passwords are not persisted or submitted. Product visuals are neutral
illustrations until approved packshots are supplied. Prices, products and
delivery fees remain presentation data, not verified live inventory.

Services, location enquiries and order enquiries provide explicit WhatsApp
handoffs without inventing appointments, addresses or tracking events. Account
and payment states explain that their services are not yet connected only where
those services would be needed. No repeated demo banners appear in the shop.

Delivery supports all 36 states and the FCT. Lagos Island zones are NGN 2,500;
other Lagos areas NGN 2,000; other states NGN 4,500. Baskets over NGN 30,000
qualify for free delivery. Estimates are confirmed before fulfillment.

Run checks with bun run build, bun run test and bunx tsc --noEmit. Production
integrations, secure uploads, authoritative pricing, server-verified payments
and durable customer/order records remain future work. Manage schema and
secrets through Lovable.
