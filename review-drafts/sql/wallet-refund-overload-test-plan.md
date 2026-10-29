# Test plan — wallet refund overload unification

**Status:** local static checks passed; PostgreSQL execution/integration tests have not occurred.
**Target:** `review-drafts/sql/wallet-refund-overload-unification.sql`
**Production safety:** no deployment, no wallet balance changes, no refunds, no USDT transfer.

## Environment status

- A Supabase development branch named `wallet-refund-test` was requested after the user approved the quoted $0.01344/hour cost.
- Supabase rejected branch creation because branching is supported only on the Pro plan or above.
- No branch was created and no Supabase SQL was executed.
- The live function definitions and schema were inspected through read-only queries.
- The migration remains a review draft. Do not apply it to production.

## Automated local static checks

A Node.js script, `check-refund-draft.mjs`, was run against a local copy of the SQL draft. **12/12 static checks passed**:

- [x] Preserves `wallet_refund_order(text) RETURNS jsonb`.
- [x] Retains `SECURITY DEFINER` and pins `search_path` to `public`.
- [x] Handles malformed UUID text.
- [x] Requires an existing order.
- [x] Rejects payment methods other than `Solde`.
- [x] Requires a negative purchase debit.
- [x] Checks existing refunds by `order_id` and canonical `reference`.
- [x] Delegates the actual refund to `wallet_refund_order(uuid)`.
- [x] Reads the actual `wallets.balance_htg` column.
- [x] Contains no blockchain RPC, send function, or network call.
- [x] Is explicitly marked review-only.
- [x] No production SQL was applied.

**Limit:** these are source-pattern/static checks, not a PostgreSQL parser, SQL compilation, or execution test.

## Logic-only simulated cases

| Case | Expected result | Static assessment |
|---|---|---|
| Text ID is malformed | `ok=false, status=invalid_order_id` | Pass: guarded UUID cast |
| UUID parses but order does not exist | `ok=false, status=order_not_found` | Pass: order lookup is checked |
| Order payment method is not `Solde` | `ok=false, status=not_wallet_payment` | Pass: payment method is checked |
| No purchase debit exists | `ok=false, status=no_purchase` | Pass: no refund delegated |
| Purchase debit amount is zero or positive | `ok=false, status=no_purchase` | Pass: debit must be negative |
| Refund already exists by order ID or canonical reference | `ok=true, status=already_refunded` | Pass: early idempotency branch |
| Valid wallet-funded order with a purchase debit and no refund | Calls UUID overload; returns `refunded` only if UUID function returns true | Pass by control-flow inspection; DB behavior untested |
| UUID implementation returns false | `ok=false, status=refund_not_applied` | Pass: false result handled |
| Two refund attempts race | At most one refund should persist | Not verified; requires concurrent DB test |

## Required tests before approval

These still require a disposable PostgreSQL/Supabase environment:

1. Compile the migration against the actual schema.
2. Valid refund on a synthetic wallet-funded order.
3. Duplicate call for the same order.
4. Concurrent calls for the same order.
5. Existing refund identified by `reference` but missing/mismatched `order_id`.
6. Missing wallet row and missing purchase debit.
7. Non-`Solde` order and malformed/nonexistent UUID.
8. Trigger path: transition to `rejetée` invokes both BEFORE and AFTER triggers without double credit.
9. Confirm unique constraints and error handling.
10. Confirm no transfer function or blockchain RPC is invoked.

## Important review caveat

The wrapper's pre-check is not a substitute for the UUID function's transactional safeguards. The UUID implementation locks the wallet and checks existing refunds before crediting; concurrent and trigger cases still need integration tests. Supabase branching is unavailable on the current plan, so the remaining safe options are a local PostgreSQL instance or a plan that supports branching. Do not apply the migration to production as a workaround.
