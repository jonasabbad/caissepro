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

Both ways run in **CaissePro Scanner** (`/scanner`), which can be installed on the phone's home screen (see below). No app store is needed.

| | How | What a scan does |
|---|---|---|
| **Authorized phone** (several phones, no sign-in) | **Once per phone:** on a computer, use **Phone** (header) → *Add a phone*, then scan the QR code with the phone. After that, the phone opens straight into scanning every time. | The phone shows the code, name, brand / model (devices), selling price and stock. The code also goes to the computer the phone sends to, which handles it on its open page: POS adds it to the cart, Products opens it, the product form fills the barcode, Add a device fills the IMEI / box code, other pages open "Scan to identify". The phone says *Sent to "Caisse 1"*, or *Not sent: "Caisse 1" is not connected*. |
| **Signed in on the phone** | Open `/scanner` (on a phone, menu → **Scan Product**) and sign in once. | Same result card, with *Add to cart* (opens the POS with the item), *Open*, *Sell* and *Create a product*. |

### Several phones, several computers

- **Computers.** Every computer with CaissePro open (1024 px or wider) registers as a receiving computer.
  - The browser keeps its id, so all tabs and restarts count as the same computer.
  - Its default name is like "Windows · Sara" (duplicates get " 2"). You can rename it under Phone → *This computer*.
  - With several CaissePro tabs open, only the tab used last handles a scan, so an item is never added twice.
- **Phones.** Each phone is authorized once and keeps its own key. On the phone, *Send scans to* picks one of the business's computers, or *No computer (look up only)*.
  - By default a phone sends to the computer whose QR code authorized it.
  - Two phones work independently, each with its own computer (tested).
- **Managing phones.** Phone → *Phone scanners*, or **Settings → Phone scanners**, lists the authorized phones with:
  - last seen time, scan count and who authorized each one;
  - **Rename**;
  - **Sends to**: change which computer it uses;
  - **Revoke**: access ends at once.
  - Managers see every phone of the business. Other users see the phones they authorized.

### Security

- **Pairing.** A QR code holds a one-time code: 256 random bits, valid **10 minutes**, usable **once** (enforced atomically, so even two phones scanning the same QR code at once get only one key). It sits in the link's `#fragment`, which browsers never send to the server, and the scanner removes it from the address bar.
- **Device key.** Using the QR code gives the phone its own random 256-bit key, which it keeps in localStorage. The server stores only its SHA-256.
- **What the key allows:**
  - looking codes up (name, category, barcode/SKU, selling price, stock; device brand/model/storage/colour/IMEI);
  - choosing one of this business's computers;
  - sending codes there;
  - forgetting itself.
- **What it doesn't allow.** It is not a sign-in: every other API refuses it (tested). It never sees cost prices, customers, sales or settings. A phone cannot target another business's computer (tested).
- **When the key stops working.** The phone shows why, and what to do:

| Reason | Shown on the phone |
|---|---|
| Revoked on a computer, or *Forget this phone* | "This phone's access was revoked" + how to authorize it again |
| Not used for 180 days (the expiry moves forward with each use) | "Authorization expired…" |
| The user who authorized it was deactivated | "The account that authorized this phone is deactivated" + ask a manager |
| Key unknown (e.g. database reset) | "CaissePro no longer recognizes this phone" |
| QR code already used / older than 10 minutes / invalid | the matching message + show a new QR code |

  If CaissePro is also signed in on that phone, the scanner carries on with that account and says so.
- **No connection.** The phone keeps its key, shows "CaissePro cannot be reached" with **Retry**, and reconnects by itself when the network comes back or the app comes back to the screen.
- **No late surprises.** A scan reaches a computer only if that computer is connected at that moment; nothing is queued. Delivered events expire after a minute.
- **Limits.** 60 scans per minute per phone.

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

## CaissePro Scanner app (home screen)

- **Permanent address:** `https://<CaissePro address>/scanner`, e.g. `https://192.168.1.13:5173/scanner` with `npm run dev:phone`. To keep the address fixed, reserve the computer's IP in the Wi-Fi router (DHCP reservation), or use a domain name in production.
- **What opens it:** the app opens on that page from its home-screen icon. The manifest's `start_url` is `/scanner?source=home-screen` and its scope is `/scanner`, so the rest of CaissePro is not taken over by the app.
- **What it uses:** an authorized phone reconnects with its own key and sends to its computer. Otherwise it uses the phone's own CaissePro sign-in, and without either it shows *Sign in* or how to authorize the phone.
- **Camera on launch:** once the phone has allowed the camera, the app opens the camera as soon as it starts.

| File | Role |
|---|---|
| `web/public/scanner.webmanifest` | Name and short name "CaissePro Scanner", `display: standalone`, portrait, brand blue, icons 192 / 512 / maskable 512 |
| `web/public/scanner-apple-touch-icon.png` + meta tags | iPhone home-screen icon and title |
| `web/public/scanner-sw.js` | Service worker, scope `/scanner` only. Pages always come from the network, so prices and stock are never stale. Without a connection it shows `scanner-offline.html`. |
| `web/scripts/scanner-icons.mjs` | Redraws the icons |

The manifest and iPhone tags are only added while `/scanner` is open. Installing from another CaissePro page therefore does not create a scanner app.

**Installing.**
- *Android (Chrome):* open the scanner page, then tap the **Install the app** banner (or ⋮ → *Install app* / *Add to Home screen*).
- *iPhone (Safari):* tap Share → **Add to Home Screen**; the page shows this hint.
- **A certificate the phone trusts is needed for a real installed app on Android.** Chrome only installs it as an app, with its service worker, on a trusted HTTPS certificate. With the self-signed certificate of `npm run dev:phone`, Android adds a plain home-screen shortcut that opens in Chrome. iPhone adds it to the home screen either way.
- Use [mkcert](https://github.com/FiloSottile/mkcert) (and install its root certificate on the phone), or a domain with a public certificate (e.g. Let's Encrypt) in production.

## Desktop

On a computer, the sidebar no longer shows *Scan Product* and the top bar has no *Scan* button. Both stay on phones and tablets. These keep working:
- the camera buttons in POS, Products, the product form and Add a device;
- USB / Bluetooth scanners;
- the **Phone** button (pairing).

A paired phone's scan on a page without its own scan handling still opens the "Scan to identify" result.
