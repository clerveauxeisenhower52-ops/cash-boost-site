/* Cash Boost Smart Assistant — isolated client widget. No payment or wallet actions. */
(function () {
  'use strict';
  if (document.getElementById('cb-smart-assistant')) return;

  const style = document.createElement('style');
  style.textContent = `
    #cb-smart-assistant{position:fixed;right:16px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:9998;font-family:inherit;color:#f8fafc}
    #cb-smart-assistant *{box-sizing:border-box}
    #cb-assistant-launch{border:0;border-radius:999px;padding:13px 17px;background:linear-gradient(110deg,#3b82f6,#22d3ee);color:#07111f;font-weight:800;box-shadow:0 8px 28px #0891b255;cursor:pointer}
    #cb-assistant-panel{display:none;position:fixed;right:12px;bottom:calc(145px + env(safe-area-inset-bottom,0px));width:min(390px,calc(100vw - 24px));height:min(590px,calc(100dvh - 180px));background:#11121a;border:1px solid #343541;border-radius:22px;overflow:hidden;box-shadow:0 20px 70px #0009;flex-direction:column}
    #cb-assistant-panel.open{display:flex}
    .cb-as-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#171923;border-bottom:1px solid #30313d}
    .cb-as-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:linear-gradient(135deg,#3b82f6,#22d3ee);color:#07111f;font-weight:900}
    .cb-as-title{font-weight:800;flex:1;color:#f8fafc}.cb-as-sub{font-size:12px;color:#a5a7b5;margin-top:2px}
    .cb-as-close{border:1px solid #3b3d49;background:transparent;color:#e5e7eb;border-radius:10px;width:36px;height:36px;font-size:22px;cursor:pointer}
    #cb-assistant-messages{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
    .cb-as-msg{max-width:90%;padding:11px 13px;border-radius:15px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;font-size:14px}
    .cb-as-msg.bot{align-self:flex-start;background:#20222d;color:#f3f4f6;border-bottom-left-radius:5px}
    .cb-as-msg.user{align-self:flex-end;background:#2563eb;color:white;border-bottom-right-radius:5px}
    .cb-as-wa{align-self:flex-start;display:inline-block;margin-top:-4px;padding:9px 13px;border-radius:999px;background:#16a34a;color:#fff;font-weight:700;font-size:13px;text-decoration:none}
    .cb-as-quick{display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 10px}
    .cb-as-quick button{border:1px solid #3c4355;border-radius:999px;background:#171923;color:#dbeafe;padding:8px 10px;font-size:12px;cursor:pointer}
    .cb-as-form{display:flex;gap:8px;padding:12px;border-top:1px solid #30313d;background:#171923}
    #cb-assistant-input{min-width:0;flex:1;border:1px solid #3b3d49;border-radius:13px;background:#0d0e14;color:#f8fafc;padding:12px;font:inherit;font-size:14px}
    #cb-assistant-send{border:0;border-radius:13px;background:#22d3ee;color:#06202a;font-weight:800;padding:0 15px;cursor:pointer}
    #cb-assistant-send:disabled{opacity:.5;cursor:wait}
    .cb-as-note{font-size:11px;color:#9ca3af;text-align:center;padding:0 12px 9px;background:#171923}
    @media(max-width:480px){#cb-smart-assistant{right:12px}#cb-assistant-panel{right:8px;bottom:calc(137px + env(safe-area-inset-bottom,0px));height:min(570px,calc(100dvh - 160px));width:calc(100vw - 16px)}}
    @media(prefers-reduced-motion:no-preference){#cb-assistant-launch{transition:transform .15s ease}#cb-assistant-launch:active{transform:scale(.97)}}
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'cb-smart-assistant';
  root.innerHTML = `
    <section id="cb-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="cb-as-title">
      <header class="cb-as-head"><div class="cb-as-mark" aria-hidden="true">CB</div><div style="flex:1"><div class="cb-as-title" id="cb-as-title">Assistant Cash Boost</div><div class="cb-as-sub">Aide pour les services, dépôts et commandes</div></div><button type="button" class="cb-as-close" id="cb-as-close" aria-label="Fermer">×</button></header>
      <div id="cb-assistant-messages" aria-live="polite"><div class="cb-as-msg bot">Salut ! Je peux t’aider à comprendre les services, les dépôts, les paiements et le suivi des commandes. Je ne peux pas effectuer de paiement ni modifier ton portefeuille. Pour un dossier personnel, le support WhatsApp est là.</div></div>
      <div class="cb-as-quick" id="cb-as-quick"><button type="button">Faire un dépôt</button><button type="button">Suivre ma commande</button><button type="button">Services disponibles</button><button type="button">Parrainage</button><button type="button">Contacter le support</button></div>
      <form class="cb-as-form" id="cb-as-form"><input id="cb-assistant-input" maxlength="1000" autocomplete="off" placeholder="Écris ta question…" aria-label="Ta question"><button id="cb-assistant-send" type="submit">Envoyer</button></form>
      <div class="cb-as-note">Ne partage jamais ton mot de passe, code PIN ou clé privée.</div>
    </section>
    <button type="button" id="cb-assistant-launch" aria-expanded="false" aria-controls="cb-assistant-panel">✦ Aide Cash Boost</button>`;
  document.body.appendChild(root);

  const panel = root.querySelector('#cb-assistant-panel');
  const launch = root.querySelector('#cb-assistant-launch');
  const close = root.querySelector('#cb-as-close');
  const form = root.querySelector('#cb-as-form');
  const input = root.querySelector('#cb-assistant-input');
  const send = root.querySelector('#cb-assistant-send');
  const messagesEl = root.querySelector('#cb-assistant-messages');
  const quick = root.querySelector('#cb-as-quick');
  const history = [];
  let busy = false;
  let serverSupportUrl = '';

  const QUESTIONS = {
    'Faire un dépôt': 'Comment ajouter des fonds à mon portefeuille avec MonCash ou NatCash ?',
    'Suivre ma commande': 'Comment suivre ma commande ?',
    'Services disponibles': 'Quels services sont disponibles et quels sont les montants minimum ?',
    'Parrainage': 'Comment fonctionne le programme de parrainage ?'
  };

  function supportUrl() {
    const link = Array.from(document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp.com"]'))
      .map(a => a.href).find(h => /wa\.me\/\d{6,}|whatsapp\.com\/send/.test(h));
    return link || serverSupportUrl || '';
  }
  function addMessage(text, role) {
    const node = document.createElement('div');
    node.className = 'cb-as-msg ' + (role === 'user' ? 'user' : 'bot');
    node.textContent = String(text);
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return node;
  }
  function addSupportLink() {
    const url = supportUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.className = 'cb-as-wa';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '💬 Support WhatsApp';
    messagesEl.appendChild(a);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function toggle(open) {
    panel.classList.toggle('open', open);
    launch.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  }
  launch.addEventListener('click', () => toggle(!panel.classList.contains('open')));
  close.addEventListener('click', () => toggle(false));
  quick.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || busy) return;
    const label = b.textContent.trim();
    if (label === 'Contacter le support') {
      quick.style.display = 'none';
      addMessage(label, 'user');
      addMessage('Pour un problème sur une commande, un dépôt ou ton compte, écris au support. Prépare le numéro de commande (#XXXXXX dans « Commandes »), le montant et l’heure. Ne partage jamais ton mot de passe.', 'bot');
      addSupportLink();
      return;
    }
    input.value = QUESTIONS[label] || label;
    form.requestSubmit();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    if (message.length > 1000) return;
    addMessage(message, 'user');
    input.value = '';
    quick.style.display = 'none';
    busy = true;
    send.disabled = true;
    send.textContent = '…';
    const waiting = addMessage('Je cherche une réponse…', 'bot');
    let showSupport = false;
    try {
      if (typeof sb === 'undefined' || !sb.auth || !sb.functions) throw new Error('assistant_unavailable');
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData?.session?.access_token) {
        waiting.textContent = 'Connecte-toi à ton compte Cash Boost pour utiliser cet assistant. Tu peux aussi contacter le support via WhatsApp.';
        showSupport = true;
        return;
      }
      history.push({ role: 'user', content: message });
      const { data, error } = await sb.functions.invoke('cash-boost-assistant', {
        body: { messages: history.slice(-8) }
      });
      if (error) {
        let body = null;
        try { body = await error.context?.json?.(); } catch (_) {}
        if (body && typeof body.answer === 'string' && body.answer) {
          waiting.textContent = body.answer;
          if (history[history.length - 1]?.role === 'user') history.pop();
          return;
        }
        throw error;
      }
      if (typeof data?.support_url === 'string' && /^https:\/\/wa\.me\/\d+$/.test(data.support_url)) serverSupportUrl = data.support_url;
      const answer = typeof data?.answer === 'string' ? data.answer : '';
      if (!answer) throw new Error('empty_answer');
      waiting.textContent = answer;
      history.push({ role: 'assistant', content: answer });
      while (history.length > 8) history.shift();
      showSupport = /support|whatsapp/i.test(answer);
    } catch (_) {
      waiting.textContent = 'Je ne peux pas répondre pour le moment. Réessaie plus tard ou contacte le support WhatsApp. Ne partage aucun mot de passe ni code secret.';
      showSupport = true;
      if (history[history.length - 1]?.role === 'user') history.pop();
    } finally {
      if (showSupport) addSupportLink();
      busy = false;
      send.disabled = false;
      send.textContent = 'Envoyer';
      input.focus();
    }
  });
})();
