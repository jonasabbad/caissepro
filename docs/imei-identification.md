# IMEI → device identification

Add a device → Phone starts with the IMEI. When the IMEI is valid (15 digits, Luhn check digit), the app looks up the
**TAC** — the first 8 digits, which identify a manufacturer and model (never an individual phone) — and fills in the
brand and model it can identify. Everything stays editable.

## Rules

- Only the 8-digit TAC is looked up, on CaissePro's own server (`GET /phone-seller/sold-units/tac/:tac`). The full IMEI
  is never sent to any outside service and never appears on public pages (the repair tracking page shows only the
  repair's own device description).
- Empty brand / model are filled in. If the user already chose a different brand or model, the form shows the
  identified device and asks: "Use …" or "Keep what I entered". Nothing is overwritten silently.
- Only what the source contains is used: brand, model, model number and type. Storage, colour, condition and prices are
  never guessed (a TAC does not determine them); the catalogue's options for the identified model are offered.
- Not identified or lookup failing → a message, and the form stays usable for manual entry.

## Sources (in order)

1. **The business's own devices** ("Source: your devices already saved with this code"). Every phone saved with a
   valid IMEI — by hand, from a purchase order or as a trade-in — records TAC → brand / model; editing the device updates
   it. Private to the business, free, and it grows with use: a model entered by hand once is recognised the next time.
2. **Reference TAC data** imported from a file, shown with its source. Nothing is fetched at request time.

   ```
   npm run tac:import -w server -- <file.csv> "<source and licence>"
   ```

   CSV with a header: a `tac` column, a brand column (`brand`, `manufacturer`, `vendor` or `name1`) and a model column
   (`model`, `marketing_name`, `model_name`, `name2` or `name`). Importing the same source again replaces its rows.

## Choosing reference data (checked 2026-10-18)

| Source | Access / cost | Licence | Coverage |
|---|---|---|---|
| GSMA IMEI / Device Database (official TAC allocations) | Partners and subscribers only, by agreement; no public price | GSMA terms | Authoritative, all allocated TACs |
| 51Degrees TAC lookup (CSV file or cloud) | Paid licence / resource key; no public price | Commercial | Vendor-maintained; not independently verified here |
| Other IMEI-check APIs (marketplaces) | Per-call subscriptions | Each provider's terms | Unknown; most require sending the full IMEI |
| Osmocom TAC database | Free, downloadable | CC BY-SA 3.0 (attribution, share-alike) | Community-maintained, incomplete for recent models |

No free source identifies every iPhone and Samsung, and Apple / Samsung use many TACs per model (regions, versions).
For complete coverage, a licensed GSMA or vendor export can be imported with the command above; until then the
business's own records fill in models it has already handled.
