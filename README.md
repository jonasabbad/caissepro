# CaissePro

Point-of-sale and store management for phone shops: sales, phones tracked by IMEI, accessories stock, repairs, customers, suppliers and reports. Available in French, English and Arabic (right-to-left).

## Features

- **POS** with cart, discounts, packs, credit sales, returns, trade-ins and receipts. Supports barcode scanners: camera, USB/Bluetooth, or a phone.
- **Phones and devices** tracked one by one (IMEI, serial number, condition, purchase and sale price).
  - A valid IMEI is identified from its TAC (brand and model).
  - Box barcodes learned from previous devices fill in the model.
- **Accessories and products:**
  - stock, stock movements and categories;
  - barcode labels and phone stickers.
- **Repairs:**
  - tickets with a public tracking page;
  - repair costs and profit.
- **Customers, debts, suppliers, supplier orders and supplier invoices,** with account statements.
- **Cash drawer, expenses, invoices and reports.** Revenue and profit follow one set of rules (see [docs/accounting.md](docs/accounting.md)).
- **CaissePro Scanner** (`/scanner`), a phone app that installs on the home screen.
  - Each phone is authorized once with a QR code, then reconnects by itself.
  - Each phone sends its scans to the computer it chooses.
- **Multi-user and multi-store,** with roles admin / manager / cashier and a locked "seller mode".

## Stack

| | |
|---|---|
| `web/` | Vue 3, Vite, Tailwind CSS, vue-i18n, Pinia, TanStack Vue Query |
| `server/` | Node.js, Fastify 5, Prisma with SQLite, Zod, Vitest |

The two parts are npm workspaces of one repository. In production the server also serves the built web app.

## Requirements

- Node.js 20.12 or later (22 recommended)
- npm

## Getting started

```bash
npm install
cp server/.env.example server/.env   # then set JWT_SECRET and JWT_REFRESH_SECRET
npm run setup                         # creates the database and a demo account
npm run dev                           # web on http://localhost:5173, API on http://localhost:3001
```

`npm run setup` creates a development database with a demo account: `admin@caissepro.local` / `demo1234`. Use this account only on your own computer.

### Using a phone as a scanner on the local network

Phone cameras need HTTPS. Start the app in phone mode, which serves Vite over HTTPS on your network:

```bash
npm run dev:phone
```

Then open the **Phone** button in the top bar and scan the QR code with the phone. See [docs/scanning.md](docs/scanning.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web and API in watch mode |
| `npm run dev:phone` | Same, with the web app served over HTTPS on the local network |
| `npm test` | Server tests (Vitest, on a separate test database) |
| `npm run build` | Builds the web app and the server |
| `npm start` | Production start: updates the database schema, then starts the server |
| `npm run db:reset` | **Deletes the development database** and recreates it with the demo data |
| `npm run tac:import -w server -- <file>` | Imports a TAC database for IMEI identification ([docs/imei-identification.md](docs/imei-identification.md)) |
| `npm run i18n:check -w web` | Checks that French, English and Arabic have the same keys |

## Configuration

Settings come from environment variables. Locally they can be in `server/.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db`. In production, use an absolute path outside the app folder |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Random values. In production the server refuses to start unless each is at least 32 characters |
| `PORT` / `API_PORT` | Server port (`PORT` is set by hosting providers; default 3001) |
| `UPLOAD_DIR` | Folder for uploaded images and documents (default `server/uploads`) |
| `NODE_ENV` | `production` on a server |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BUSINESS_NAME` | First production start only: create the business and its admin account when the database is empty |
| `HTTPS_CERT_FILE`, `HTTPS_KEY_FILE` | Optional: serve HTTPS directly from the server |

## Deployment

See [docs/deploy-hostinger.md](docs/deploy-hostinger.md) (Node.js hosting, with the database and uploads kept outside the deployed folder).

## Data and security

- **Kept out of Git** (`.gitignore`): databases (`*.db`), `.env` files, keys, uploads, logs and build output. Back up the database file and the uploads folder yourself.
- **Passwords** are hashed with bcrypt.
- **Sessions** use 8-hour JWT access tokens and refresh tokens that rotate on each use.
- **Phone scanners** use their own keys, stored only as hashes. These keys can only look products up and send codes to a computer of the same business.

## Documentation

| | |
|---|---|
| [docs/accounting.md](docs/accounting.md) | How revenue and profit are computed |
| [docs/scanning.md](docs/scanning.md) | Barcode scanning, phone scanners, CaissePro Scanner app |
| [docs/imei-identification.md](docs/imei-identification.md) | IMEI and TAC identification |
| [docs/theme.md](docs/theme.md) | Colours and typography |
| [docs/arabic-glossary.md](docs/arabic-glossary.md) | Arabic terminology used in the interface |
| [docs/deploy-hostinger.md](docs/deploy-hostinger.md) | Production deployment |
| [docs/test-results.md](docs/test-results.md) | Manual test reports |
