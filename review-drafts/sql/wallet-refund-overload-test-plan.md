# Test plan — wallet refund overload unification

**Status:** simulated/static review only. No Supabase SQL was executed.
**Target:** `review-drafts/sql/wallet-refund-overload-unification.sql`
**Production safety:** no deployment, no wallet balance changes, no refunds, no USDT transfer.

## Static checks completed

- [x] Migration draft preserves `wallet_refund_order(text) RETURNS jsonb`.
- [x] It retains the `SECURITY DEFINER` declaration and fixes `search_path` to `public`.
- [x] Malformed text IDs return `invalid_order_id` rather than reaching the UUID overload.
- [x] Missing orders and non-`Solde` payment methods are rejected.
- [x] The wrapper checks for a purchase associated with the order before delegating.
- [x] The wrapper checks existing refunds using both `order_id` and `reference`.
- [x] New refund work delegates to `wallet_refund_order(uuid)`, preserving the canonical locking/idempotency implementation.
- [x] The draft does not call any blockchain RPC, wallet-send function, or external network.
- [x] No production SQL was applied.

## Simulated cases and expected outcomes

| Case | Expected result | Why |
|---|---|---|
| Text ID is malformed | `ok=false, status=invalid_order_id` | UUID cast is guarded |
| UUID parses but order does not exist | `ok=false, status=order_not_found` | Order lookup must succeed |
| Order payment method is not `Solde` | `ok=false, status=not_wallet_payment` | Only wallet-funded orders qualify |
| No purchase debit exists | `ok=false, status=no_purchase` | No credit is created without a debit |
| Purchase debit amount is zero or positive | `ok=false, status=no_purchase` | Debit must be negative |
| Refund already exists by order ID or canonical reference | `ok=true, status=already_refunded` | Duplicate credit must not be issued |
| Valid wallet-funded order with a purchase debit and no refund | UUID implementation is called once; expected `status=refunded` if it returns true | Canonical refund function applies safeguards |
| UUID implementation returns false | `ok=false, status=refund_not_applied` | Wrapper does not claim success |
| Two refund attempts race | At most one refund should persist; unique indexes and UUID function's locking/checks are relied upon | Must be verified in a disposable database |

## Required staging tests before approval

These cases are **not** proven by static simulation and must be run against a disposable Supabase development branch or local Postgres database:

1. Compile the migration against the actual schema.
2. Valid refund on a synthetic wallet-funded order.
3. Duplicate call for the same order.
4. Concurrent calls for the same order.
5. Existing refund identified by `reference` but missing/mismatched `order_id`.
6. Missing wallet row and missing purchase debit.
7. Non-`Solde` order and malformed/nonexistent UUID.
8. Trigger path: transition to `rejetée` invokes both BEFORE and AFTER triggers without double credit.
9. Confirm all unique constraints and expected error handling.
10. Confirm no transfer function or blockchain RPC is invoked.

## Important review caveat

The wrapper does a pre-check before calling the UUID function; this is not a substitute for the UUID function's transactional safeguards. The concurrency and trigger cases above must pass on staging before production approval. Also verify column names/types and function definitions against the current schema immediately before any migration.
