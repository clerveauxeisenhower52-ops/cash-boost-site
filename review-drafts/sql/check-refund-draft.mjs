import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("./wallet-refund-overload-unification.sql", import.meta.url),
  "utf8",
);

const checks = [
  ["keeps text overload return type", /wallet_refund_order\(p_order_id text\)\s*\nRETURNS jsonb/i],
  ["uses SECURITY DEFINER", /SECURITY DEFINER/i],
  ["pins search_path", /SET search_path TO public/i],
  ["rejects malformed UUID text", /EXCEPTION WHEN invalid_text_representation/i],
  ["requires an existing order", /FROM public\.orders\s+WHERE id = v_order_id/i],
  ["only refunds Solde orders", /payment_method IS DISTINCT FROM 'Solde'/i],
  ["requires a negative purchase debit", /COALESCE\(v_purchase\.amount_htg, 0\) >= 0/i],
  ["checks existing refunds by order_id and reference", /r\.order_id = v_order_id::text OR r\.reference = 'order:' \|\| v_order_id::text/i],
  ["delegates refund operation to UUID overload", /public\.wallet_refund_order\(v_order_id\)/i],
  ["checks the real wallet balance column", /SELECT w\.balance_htg INTO v_balance/i],
  ["does not include blockchain/network calls", !/fetch\s*\(|https?:\/\/|send-usdt|eth_sendRawTransaction/i],
  ["is clearly marked review-only", /REVIEW DRAFT ONLY/i],
];

let failed = 0;
for (const [label, condition] of checks) {
  try {
    assert.ok(typeof condition === "boolean" ? condition : condition.test(sql), label);
    console.log("PASS", label);
  } catch {
    failed++;
    console.error("FAIL", label);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} static checks passed.`);
if (failed) process.exitCode = 1;
