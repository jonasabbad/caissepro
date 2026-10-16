# Observed on the live trial account (read-only GETs, 2026-10-16)

## Repairs
- `GET /repairs` returns `{ repairs: [...] }`, each repair with `customer`, `repairer` and `expenses` embedded.
- Number format: `REP-<base36 timestamp>-<4 chars>` (e.g. `REP-MVBELX7N-ZK4D`), same scheme as `TRX-`/`PO-`.
- Status lifecycle seen in the client: `pending → in_progress → completed → delivered`, with `cancelled` from pending/in_progress.
  `completedAt` / `deliveredAt` are stamped on the transitions.
- `totalCost` = sum of the expenses. The "repair cost" typed in the creation form becomes an expense
  `{ description: "Frais de réparation", type: "part" }` created right after the repair (client-side, second request).
- Delivering a repair (fixed price 250 DH) created **no transaction and no cash-drawer movement**: the drawer for that
  day only contains the two 25 DH sales and two supplier payments. Repairs are tracked outside the till.
- `GET /repairers` → `{ repairers: [{ id, name, phone, isActive, ... }] }`.

## Cash drawer — `GET /stores/:storeId/caisse`
```
{ balance: -85,
  dailySummary: { openingBalance: 0, closingBalance: -85, totalIn: 50, totalOut: 135, byType: { sale: 50, cash_out: 135 } },
  movements: [ { type, amount (positive string), balanceAfter, reason, transactionId, transactionNumber, createdBy, creator, createdAt } ],
  meta: { total, page, limit: 50, totalPages } }
```
- A cash sale writes `type: "sale"`, `reason: "Paiement espèces - TRX-…"`, linked `transactionId/transactionNumber`.
- A supplier-order payment in cash writes `type: "cash_out"`, `reason: "Paiement fournisseur - PO-…"`.
- `amount` is always positive; the direction comes from the type. The balance may go negative.
- The `creator` object leaks the full user row including `refreshToken` (same bug as elsewhere; not reproduced).
