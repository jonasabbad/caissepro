# Barcode scanning

## Reference project

The reference project is [Dinesh-Sowndar/flutter_billing_app](https://github.com/Dinesh-Sowndar/flutter_billing_app).

- **Stack:** Flutter/Dart, using `mobile_scanner` (camera), Hive (local storage) and flutter_bloc.
- **How it scans:** it takes one scan, ignores duplicates, vibrates, looks the product up by barcode and adds it to the cart (qty +1). An unknown code shows an error. It does not check stock.
- **License:** the repository has **no LICENSE file**, so all rights are reserved and its code cannot be copied.
- **What CaissePro reuses:** only the idea of the workflow. The rest is a new web implementation:
  - camera decoding uses the browser's native `BarcodeDetector` when it exists;
  - otherwise it uses `@zxing/browser` 0.1.5 and `@zxing/library` 0.21.3, both **MIT**. They are loaded only when the camera opens.

## Where you can scan

| Screen | Camera button | USB / Bluetooth scanner | Result |
|---|---|---|---|
| POS | Next to the search box | Already supported (keystroke bursts) | The same lookup as typing. A product adds 1 to its cart line. A device (IMEI / ref) adds its unique item. Return mode is excluded. |
| Products | Next to the search box | Already supported | A known barcode opens the product. An unknown one shows the "create it" banner. |
| Product form | Next to the Barcode field | Type or scan into the field | A barcode that already belongs to another product shows a warning with "Open that product". The server also refuses duplicates. |
| Add a device | In the IMEI card, plus a "Box barcode" field | Type or scan into the fields | 15 digits go to the IMEI field and run the IMEI/TAC identification. Anything else is treated as the box barcode. |
| Header: "Scan to identify" (every page) | Yes | Can type or scan in the camera dialog | Shows what CaissePro knows about the code, then the next step: add to cart, sell, open, add a device, or create a product. |

### Camera errors

- **Not a secure page** (not https and not localhost): the camera is unavailable.
- **Permission refused:** a message and a Retry button are shown.
- **No camera / camera failed to start:** a message is shown.

In every case, the manual field in the same dialog keeps working, for a hand-held scanner or for typing.

## What a scan looks up (all local, in this business's own data)

The server route `GET /api/v1/scan/:code` checks these in order:

1. **Products:** barcode or SKU. Shows the price and stock stored in CaissePro.
2. **Devices:** IMEI, serial number or reference. Shows the device's state (in stock / reserved / sold) and its stored sale price.
3. **Learned box barcodes** (`ModelBarcode`, private to each business). When a device is saved with a box EAN, that EAN is linked to its brand, model, storage and colour. Scanning the same EAN later fills those fields when adding another device.
   - It identifies a **model, not a particular phone**, so it never carries a price.
   - If you have already typed a different model, it is only replaced on confirmation.
4. **A valid IMEI that is not in stock:** identification only, from the local Osmocom TAC table (see `imei-identification.md`).

A retail EAN is never treated as an IMEI. IMEI identification needs 15 digits with a valid Luhn check, and it stays a separate step.

Prices always come from CaissePro. A scan never creates or changes a price, and never moves stock: stock changes only when a sale is completed, as before.

## What would need an external source

- **Product names or prices from a retail EAN that CaissePro has never seen.** No external EAN database is used.
  - UPCitemdb's commercial terms could not be checked, and open data sets (e.g. Open Food Facts) do not cover electronics.
  - An unknown code therefore offers to create the product or add the device by hand. After that, it is recognised on every later scan.
- **Exact phone model / storage / colour from an IMEI.** TAC identifies the model only. Storage and colour come from the box barcode once it has been learned, or are entered by hand.

## Phone as a scanner

There are two ways to use a phone. Neither needs an app; both run in the phone's browser.

| | How | What a scan does |
|---|---|---|
| **Paired with a computer** | On the computer, use the header button **Phone** (phone icon) → *Show the QR code* → scan the QR code with the phone. The phone does not sign in. | The phone shows the code, name, brand / model (devices), selling price and stock. The code is also sent to the computer's open page, as if it had been scanned there: POS adds it to the cart, Products opens it, the product form fills the barcode, Add a device fills IMEI / box code, other pages open "Scan to identify". An unknown code shows "Code not known" on the phone and a *Create a product* link on the POS (it opens in a new tab, so the sale in progress stays). *Send to the computer* can be turned off to look up only. |
| **Signed in on the phone** | Menu → **Scan Product** (`/app/scan`). | Same result card, with *Add to cart* (opens the POS with the item), *Open*, *Sell* (devices) and *Create a product* (unknown code). |

Scanning is tap-to-scan: tap **Scan**, read one code, the camera stops, and the result shows. Then tap **Scan next**. This avoids adding the same item twice while it is still in front of the camera. A Bluetooth scanner or typing works in the field under the result.

### Security

- **What the phone holds.** The QR code carries a random 256-bit token in the link's `#fragment`, which browsers never send to servers or put in logs. The phone keeps it in the tab's sessionStorage, and the address bar is cleaned. The server stores only its SHA-256 hash.
- **What the token allows:** `GET /scanner/phone/session`, `POST /scanner/phone/scan` (max 60/min) and `POST /scanner/phone/disconnect`, nothing else. It is not a sign-in: every other API refuses it (tested).
- **What the phone sees.** Product name, category, barcode/SKU, selling price, stock, and device brand/model/storage/colour/IMEI. It never sees cost prices, customers, sales, or settings.
- **When the link ends.**
  - It expires after 12 hours.
  - **Disconnect** on either side revokes it.
  - **New QR code** revokes the previous link of that screen. Other screens keep their own pairing.
  - The link also stops if the user who created it is deactivated.
- **No credentials in the page.** No database access, credentials or admin pages are reachable from the scanner page.

### HTTPS on the shop network

Phone browsers only open the camera on **https** (or on `localhost`, which a phone cannot use to reach the computer). If the link is http, the pairing window warns about it, and the phone can still type codes.

- **Development / shop computer:** stop `npm run dev` and start:
  ```
  npm run dev:phone
  ```
  Vite then listens on the network over HTTPS with a self-signed certificate. On the computer open `https://localhost:5173` (accept the warning once). The QR code then points to `https://<this computer's Wi-Fi address>:5173/scanner`. The phone shows a certificate warning once: choose *Advanced → Continue*. The API stays on `localhost:3001` behind Vite's proxy and is not exposed on the network.
- **Trusted certificate (no warnings):** make one with [mkcert](https://github.com/FiloSottile/mkcert) for the computer's address, e.g. `mkcert 192.168.1.13 localhost`, and install the mkcert root CA on the phone. Then start with:
  ```
  SSL_CERT_FILE=… SSL_KEY_FILE=… npm run dev:phone
  ```
- **Production** (`npm start`, the API serving `web/dist`): set `HTTPS_CERT_FILE` and `HTTPS_KEY_FILE` in `server/.env`, or put CaissePro behind an HTTPS reverse proxy.

The phone and the computer must be on the same Wi-Fi. When the computer has several network addresses (e.g. WSL / Docker adapters), the pairing window lets you pick one, and 192.168.x.x comes first.
