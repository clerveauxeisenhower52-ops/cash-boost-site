# Test plan — wallet refund overload unification

**Status:** static review and logic-only simulation; PostgreSQL execution has not occurred.
**Target:** `review-drafts/sql/wallet-refund-overload-unification.sql`
**Production safety:** no deployment, no wallet balance changes, no refunds, no USDT transfer.

## Environment status

- A Supabase development branch named `wallet-refund-test` was requested after the user approved the quoted $0.01344/hour cost.
- Supabase rejected branch creation because branching is supported only on the Pro plan or above.
- No branch was created and no Supabase SQL was executed.
- The migration is still a review draft. Do not apply it to production.

## Static checks completed

- [x] Migration draft preserves `wallet_refund_order(text) RETURNS jsonb`.
- [x] It retains the `SECURITY DEFINER` declaration and fixes `search_path` to `public`.
- [x] Malformed text IDs return `invalid_order_id` rather than reaching the UUID overload.
- [x] Missing orders and non-`Solde` payment methods are rejected.
- [x] The wrapper checks for a purchase associated with the order before delegating.
- [x] The wrapper checks existing refunds using both `order_id` and `reference`.
- [x] New refund work delegates to `wallet_refund_order(uuid)`, preserving the canonical locking/idempotency implementation.
- [x] The wallet balance field was checked against the live schema read-only and corrected to `wallets.balance_htg`.
- [x] The draft does not call any blockchain RPC, wallet-send function, or external network.
- [x] No production SQL was applied.

## Logic-only simulated cases

These are branch-logic simulations, **not PostgreSQL integration tests**.

| Case | Expected result | Static assessment |
|---|---|---|
| Text ID is malformed | `ok=false, status=invalid_order_id` | Pass: guarded UUID cast |
| UUID parses but order does not exist | `ok=false, status=order_not_found` | Pass: order lookup is checked |
| Order payment method is not `Solde` | `ok=false, status=not_wallet_payment` | Pass: payment method is checked |
| No purchase debit exists | `ok=false, status=no_purchase` | Pass: no refund delegated |
| Purchase debit amount is zero or positive | `ok=false, status=no_purchase` | Pass: debit must be negative |
| Refund already exists by order ID or canonical reference | `ok=true, status=already_refunded` | Pass: early idempotency branch |
| Valid wallet-funded order with a purchase debit and no refund | Calls UUID overload; returns `refunded` only if UUID function returns true | Pass by control-flow inspection; database behavior untested |
| UUID implementation returns false | `ok=false, status=refund_not_applied` | Pass: false result handled |
| Two refund attempts race | Must allow at most one persisted refund | Not verified; requires concurrent DB test |

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

The wrapper's pre-check is not a substitute for the UUID function's transactional safeguards. The concurrency and trigger cases above must pass before production approval. Since Supabase branch creation is unavailable on the current plan, use a local PostgreSQL test database or upgrade/enable a plan that supports branching. No production changes should be made to work around this restriction.
