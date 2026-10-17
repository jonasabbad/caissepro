# Accounting rules

How revenue and profit are computed across the POS, repairs, inventory, cash drawer, dashboard and reports.
The code lives in `server/src/lib/profit.ts`; every screen and report uses those functions, so the numbers agree.

## Sales (POS)

| Figure | Definition |
|---|---|
| Sales revenue | Sum of sales, credit sales, trade-ins and fully paid reservations in the period (cancelled sales excluded). |
| Refunds | Sum of returns in the period. |
| Net sales | Sales revenue − refunds. |
| Sales gross profit | Margin of the sales (price − cost) plus the margin effect of returns (the retained part of a refund counts, the margin of what came back is removed). |
| Cost of goods sold | Net sales − sales gross profit. |

A device's cost is its purchase price (plus, for repairs recorded before 2026-10-17 only, the cost of repairs done on it
while in stock — see below).

## Repairs

| Figure | Definition |
|---|---|
| Repair revenue | The price charged to the customer (`fixedPrice`). |
| Parts | Parts bought for the job + parts taken from stock (product cost price × quantity). Taking a part from stock decreases the stock and writes an inventory movement of type `repair`. |
| Technician / external | Labour costs, optionally linked to a technician (repairer). |
| Other direct costs | Anything else spent on the job. |
| **Repair profit** | **Revenue − Parts − Technician/External − Other** |
| Repair gross profit | Revenue − Parts |

**When a repair counts.** A repair becomes realized income only when it is **completed or delivered AND fully paid**.
That moment is stored as `realizedAt` and is the date used by every report. Consequences:

- Unpaid or partly paid repairs are never counted, even when finished. The repairs report lists them as
  *pending revenue* (price) and *collected, not realized* (deposits taken).
- Cancelled repairs are never counted. A repair that has taken money cannot be cancelled or deleted, and
  cancelling returns its stock parts to inventory.
- Lowering the price below what was already collected is refused; raising it reopens the balance, so a repair
  that is no longer fully paid stops counting.

**Repair payments** are recorded on the repair (deposit or balance, cash / card / transfer / cheque; non-cash needs
a reference). They are never POS sales, so repair revenue cannot be counted twice. Cash payments go into the drawer
as `sale` movements ("Paiement réparation - REP-…").

**Repair costs are not business expenses.** The *Repair cost* field of the New Repair form and every cost line of a
repair (purchased part, part from stock, technician, other) belong to that repair: they are deducted from its price to
give its profit (example: price 500 − parts 150 − other 0 = profit 350). They never create an entry on the Expenses
page and are never added to *Direct expenses*, so they cannot be deducted twice.

**Cash.** A repair cost does not touch the cash drawer, unless a bought part or a technician cost is explicitly marked
*paid from the drawer*: it is then taken out once (`cash_out`), and removing that cost puts the money back. A part taken
from stock only decreases the stock (it was paid when the stock was purchased). Unpaid repair revenue is never cash:
only recorded payments move the drawer.

**Repairs linked to a device in stock** keep their costs in the repair's profit as well; the device's cost is not raised,
so selling the device does not count those costs again. Legacy: repairs recorded before 2026-10-17 on a stock device
had their costs added to the device's cost instead (`costsCapitalized`). A one-time data migration flags those repairs
so their history is unchanged: they stay out of repair costs and repair profit, and the device's cost keeps them.

## Whole business (dashboard "Gains réels", profit reports)

| Figure | Definition |
|---|---|
| Revenue | Net sales + realized repair revenue |
| Cost of goods | Cost of goods sold (products and devices sold) |
| Repair costs | Parts + technician/external + other direct costs of the realized repairs |
| **Gross profit** | Revenue − cost of goods − repair costs = sales gross profit + repair profit |
| Direct expenses | Business expenses only (Expenses page, by expense date) |
| **Net profit** | Gross profit − direct expenses |
| Margin | Net profit ÷ revenue |

The dashboard's sales KPI ("Ventes du jour") stays sales only. Repair revenue and profit have their own figures and
are included in the profit KPI, the profit/trend chart, the store breakdown, the sales report's profit block and the
repairs report. Every period selector (today, week, month, custom range) uses these definitions.

## What is not modelled

- Depreciation, accruals and stock write-downs: net profit is cash-basis for expenses (by expense date) and
  realization-basis for repairs, not a full accrual accounting.
- TVA is excluded from the profit figures only to the extent it is excluded from the prices entered.

## Business expenses (Expenses page)

- Categories: rent, salaries, utilities, telecom, transport, supplies, advertising, premises upkeep, fees, taxes, other.
- Counted in **direct expenses** on the date of the expense (not the date it was entered). Deleted expenses are kept
  (soft delete) but excluded everywhere.
- **Not** for stock purchases (supplier orders: their cost is counted when the goods are sold) or repair costs (entered
  on the repair): counting them here too would deduct them twice. The form says so.
- Cash expenses take the money out of the store's cash drawer (cash out, "Dépense - …"). Changing the amount or the
  payment method, or deleting, records the reversal (cash in, "Annulation dépense - …"). Card and bank transfer do
  not touch the drawer. Manual drawer withdrawals are movements of cash, not expenses.
- Duplicates: each form submission carries an idempotency key (a resent form creates one expense), and an expense with
  the same day, amount and description needs an explicit confirmation.
- Managers only: cashiers and viewers cannot see or change expenses.
