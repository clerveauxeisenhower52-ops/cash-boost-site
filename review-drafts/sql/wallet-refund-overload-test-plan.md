# Test plan — wallet refund overload unification and verify-receipt safety

**Status:** applied to production on 2026-10-28/29. Merged to `main` via PR #28.
**CI:** GitHub Actions run https://github.com/clerveauxeisenhower52-ops/cash-boost-site/actions/runs/40802733781 passed on commit `d1162e7973628de2506aa4798197a6374aedb931`.
**Rollback:** `review-drafts/sql/wallet-refund-text-rollback.sql` restores the previous `wallet_refund_order(text)` definition.

## Production status

- Supabase project: `ljddntmrcarbwfiqvyor`.
- `verify-receipt` Edge Function: active at version 93 with `verify_jwt=false`. The deployed code already contains the corrected send-result handling (same as `review-drafts/verify-receipt/index.ts`): `skipped` and ambiguous send errors keep the order pending for manual reconciliation, return `ok:false`, and no longer use the `envoi USDT échoué` phrase that triggers automatic refunds.
- SQL migration `wallet_refund_order_text_delegates_to_uuid` applied: the `wallet_refund_order(text)` overload now validates the order ID and delegates the credit to `wallet_refund_order(uuid)`. Triggers `orders_auto_refund_trg` and `orders_refund_wallet_trg` unchanged. `anon` and `authenticated` still cannot execute the function.

## Verification performed

- Read-only check of existing data: 2 refunds, each matching a rejected `Solde` order, same user, same amount as the purchase debit; no rejected `Solde` order without a refund; no negative wallet balance.
- Post-migration read-only check: text overload delegates to the UUID overload, privileges unchanged, both triggers present, refund count unchanged.
- CI on a disposable PostgreSQL database: valid refund, duplicate refund, malformed ID, non-`Solde` order, trigger single-credit, and 8 concurrent refund attempts (exactly one credit and one refund row). Static checks of the `verify-receipt` transfer-state handling passed.

## Limits

- The CI fixture models the schema; it is not the live database.
- No real wallet refund was used as a test. Monitor the next rejected `Solde` orders: each must receive exactly one refund.

## Safety invariant

No ambiguous blockchain send result should be represented as successful, retried automatically, or automatically refunded until the transaction status has been reconciled. A `skipped` result is not proof of a successful transfer.
