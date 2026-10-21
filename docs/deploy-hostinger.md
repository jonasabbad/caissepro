# Deploying CaissePro on Hostinger (Node.js web app)

Target: **https://caissepro.electro36.ma**. It is a subdomain of its own, so it never touches the electro36.ma website.

## What the app needs

| | |
|---|---|
| Runtime | Node.js 22 (20 also works); one process serves the web app, the API and `/uploads/` |
| Build | `npm run build` at the repository root: Vite builds `web/dist`; the server runs `prisma generate`, `tsc`, then copies its catalogues to `server/dist/data` |
| Start | `npm start` (root) → `server/start.mjs`. It updates the database schema (`prisma db push`, which refuses data-losing changes), then starts the server on `PORT` |
| Database | SQLite file. **It must live outside the deployed folder**: each deploy replaces the site's files |
| Uploads | Product / device images and documents, **also outside the deployed folder** (`UPLOAD_DIR`) |

## Environment variables (hPanel → the Node.js app → Environment variables)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `file:/home/<hosting user>/caissepro-data/caissepro.db` (absolute path, outside `public_html` / the app folder) |
| `UPLOAD_DIR` | `/home/<hosting user>/caissepro-data/uploads` |
| `JWT_SECRET` | random, 32+ characters (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `JWT_REFRESH_SECRET` | another random value, 32+ characters |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), `BUSINESS_NAME`, optional `ADMIN_FIRST_NAME` | First start only: with an empty database, they create the business and its admin account. Remove them afterwards; they are ignored once any account exists |

`PORT` is set by Hostinger. The server refuses to start in production without real JWT secrets. The demo account (`admin@caissepro.local`) is never created in production: it comes only from the development seed.

## Steps

1. hPanel → Websites: add **caissepro.electro36.ma** as a Node.js web app, or as a subdomain of electro36.ma, and enable SSL.
2. Set the environment variables above.
3. Deploy the repository archive (without `node_modules`, `dist`, `.env`, `*.db`, `uploads`), Node 22:
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
