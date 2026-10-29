-- PUBG Mobile (Auto): configuration appliquée en production le 2026-10-29/30.
-- Coûts et identifiants d'offres vérifiés dans le catalogue FazerCards (catégorie « PUBG Mobile (Auto) »).
update public.pubg_pack_costs c set
  fazer_product = v.product, fazer_offer_id = v.offer, cost_usd = v.cost, updated_at = now()
from (values
  ('pubg-60',   '60 UC',   '60_uc',   0.8798),
  ('pubg-325',  '325 UC',  '325_uc',  4.3900),
  ('pubg-660',  '660 UC',  '660_uc',  8.7900),
  ('pubg-1800', '1800 UC', '1800_uc', 21.9700),
  ('pubg-3850', '3850 UC', '3850_uc', 43.9400),
  ('pubg-8100', '8100 UC', '8100_uc', 87.8700)
) as v(pack, product, offer, cost)
where c.pack_id = v.pack;

-- Reprise automatique chaque minute des commandes PUBG pas encore livrées.
select cron.schedule(
  'pubg-sweep-every-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://ljddntmrcarbwfiqvyor.supabase.co/functions/v1/pubg-topup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select value from public.internal_secrets where name = 'webhook_secret')
    ),
    body := '{"action":"sweep"}'::jsonb
  );
  $job$
);

-- Activation : service et packs 60 / 325 / 660 UC.
-- Les packs 1800 / 3850 / 8100 UC restent inactifs : la recharge automatique du solde FazerCards est plafonnée
-- à 35 $ par recharge et le wallet BSC doit contenir assez d'USDT (voir REFILL_MAX_USD).
update public.services set active = true, visible = true where id = 'PUBG Mobile (Auto)';
update public.pubg_packs set active = true where id in ('pubg-60', 'pubg-325', 'pubg-660');
