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
