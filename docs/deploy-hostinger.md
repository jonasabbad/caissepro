# Deploying CaissePro on Hostinger (Node.js web app)

Target: **https://caissepro.electro36.ma**. It is a subdomain of its own, so it never touches the electro36.ma website.

## What the app needs

| | |
|---|---|
| Runtime | Node.js 22 (20 also works); one process serves the web app, the API and `/uploads/` |
| Build | `npm run build` at the repository root: Vite builds `web/dist`; the server runs `prisma generate`, `tsc`, then copies its catalogues to `server/dist/data` |
| Start | `npm start` (root) → `server/start.mjs`. It updates the database schema (`prisma db push`, which refuses data-losing changes), then starts the server on `PORT` |
| Database | MariaDB on Hostinger (hPanel → Databases). The app reaches it at **127.0.0.1:3306** (not `localhost`, which can resolve to IPv6). At each start, `prisma migrate deploy` applies the migrations not applied yet; it never resets data. On a new database it also loads the reference phone models (TAC) |
| Uploads | Product / device images and documents, **outside the deployed folder** (`UPLOAD_DIR`): each deploy replaces the site's files |

## Environment variables (hPanel → the Node.js app → Environment variables)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://<db user>:<password>@127.0.0.1:3306/<db name>`, e.g. `mysql://u251095411_caissepro:<password>@127.0.0.1:3306/u251095411_caisseproDATA`. URL-encode special characters in the password (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`) |
| `UPLOAD_DIR` | `/home/<hosting user>/caissepro-data/uploads` |
| `JWT_SECRET` | random, 32+ characters (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `JWT_REFRESH_SECRET` | another random value, 32+ characters |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), `BUSINESS_NAME`, optional `ADMIN_FIRST_NAME` | First start only: with an empty database, they create the business and its admin account. Remove them afterwards; they are ignored once any account exists |

`PORT` is set by Hostinger. The server refuses to start in production without real JWT secrets. The demo account (`admin@caissepro.local`) is never created in production: it comes only from the development seed.

## Steps

1. hPanel → Websites: add **caissepro.electro36.ma** as a Node.js web app, or as a subdomain of electro36.ma, and enable SSL.
2. Set the environment variables above.
3. Deploy the repository archive (without `node_modules`, `dist`, `.env`, `uploads`), Node 22:
   - build command `npm run build`;
   - start command `npm start` (entry file `server/start.mjs`).
4. Open the site and sign in with `ADMIN_EMAIL`. Then remove `ADMIN_PASSWORD` from the variables.
5. Optional: import the Osmocom TAC database for IMEI identification. It is not part of the deploy; see `imei-identification.md`.

## Phones

The site has a real certificate, so phones get camera access and CaissePro Scanner installs as a full app on Android and iPhone. The scanner's permanent address is `https://caissepro.electro36.ma/scanner`.

## Checked locally (production build)

- **Fresh database:** `node start.mjs` with `NODE_ENV=production`, a database and uploads folder outside the project, and random secrets. The schema was created, the first account was created from `ADMIN_*`, and the server listened on `PORT`.
- **Pages:** `/`, `/scanner`, the manifest, the API health check, sign-in, categories and catalogues all respond.
- **Accounts:** the demo account is refused. A second start does not create another account.
- **Secrets:** a short `JWT_SECRET` stops the start.

## Variables are applied at build time

Hostinger writes the environment variables into the app when it builds. After changing a variable in hPanel, start a new build (Redeploy). Otherwise the running app keeps the old values.

## Moving existing SQLite data

An old SQLite `.db` file can be copied into an **empty** MariaDB database (migrations applied first) with `npm run db:copy-sqlite -w server -- <file.db>`, from a computer that can reach the database. The SQLite file is only read. The copy refuses a database that already holds rows, runs in one transaction, and compares the row counts of every table.
