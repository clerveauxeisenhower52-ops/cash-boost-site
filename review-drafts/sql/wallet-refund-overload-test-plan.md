# Test plan — wallet refund overload unification and verify-receipt safety

**Status:** GitHub Actions integration suite passed on commit `d1162e7973628de2506aa4798197a6374aedb931`.
**Workflow:** https://github.com/clerveauxeisenhower52-ops/cash-boost-site/actions/runs/40802733781
**Branch:** `review/fix-skipped-usdt-status`
**Production safety:** no deployment, no wallet balance changes, no refunds, no USDT transfer.

## Environment and production status

- Supabase project: `ljddntmrcarbwfiqvyor`.
- The live schema was inspected read-only; `wallets.balance_htg` is the balance column and `wallet_transactions.order_id` is text.
- The live `verify-receipt` Edge Function is active at version 92 with `verify_jwt=false`.
- Read-only inspection of version 92 found a safety issue in the send-result handling: a `skipped` result can fall through to an `ok: true` response, and an ambiguous send error uses the phrase `envoi USDT échoué`, which the live SQL trigger uses to initiate automatic refund handling. This could be unsafe when broadcast status is uncertain.
- A corrected `verify-receipt` draft is on this review branch. It handles `skipped` before success branches, returns `ok:false`, leaves the order pending for manual reconciliation, and avoids the automatic-refund trigger phrase for ambiguous send outcomes.
- The Supabase branch `wallet-refund-test` could not be created because database branching requires Pro or above. No branch was created and no SQL draft was executed against production.
- The SQL wrapper remains a review draft. Do not apply it to production without a separate deployment decision and backup/rollback review.

## Automated CI results

GitHub Actions run `40802733781` completed successfully on commit `d1162e7973628de2506aa4798197a6374aedb931`. All workflow steps passed:

- [x] Create disposable PostgreSQL fixture schema.
- [x] Compile and apply the draft SQL to the disposable database.
- [x] Run SQL integration assertions.
- [x] Run concurrent refund attempts.
- [x] Run static transfer-state safety checks for the `verify-receipt` draft.

The SQL integration test reports: valid refund, duplicate, malformed ID, non-`Solde`, and trigger single-credit checks passed. The concurrency test reports that eight simultaneous refund attempts resulted in exactly one wallet credit and one refund row. The static safety check passed for the `skipped` handling and ambiguous-send wording.

## Remaining validation limits

The CI fixture is disposable and models the relevant schema; it is not the live Supabase database. The successful CI run validates the draft against that fixture, not a live production migration. The `verify-receipt` draft has not been deployed, so production is still running version 92 with the issue described above.

Before production release:
1. Review the exact diff between active version 92 and the draft.
2. Confirm the production environment variables and `send-usdt-bnb` response contract without exposing secret values.
3. Decide explicitly on a controlled deployment window and rollback plan.
4. Deploy the Edge Function only after explicit authorization; verify behavior using non-financial/test-only inputs and logs.
5. Schedule the SQL wrapper migration separately, after confirming the UUID overload and trigger behavior in an isolated Supabase environment. Do not use a real wallet refund as a test.

## Safety invariant

No ambiguous blockchain send result should be represented as successful, retried automatically, or automatically refunded until the transaction status has been reconciled. A `skipped` result is not proof of a successful transfer.
