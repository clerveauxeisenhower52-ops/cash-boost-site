/* Cash Boost Smart Assistant — isolated client widget. No payment or wallet actions. */
(function () {
  'use strict';
  if (document.getElementById('cb-smart-assistant')) return;

  // Nom affiché de l'assistant (à changer ici si besoin)
  const NAME = 'Boost';

  const I18N = {
    fr: {
      sub: 'Aide pour les services, dépôts et commandes',
      welcome: 'Salut ! Je suis ' + NAME + ', l’assistant Cash Boost. Je peux t’aider à comprendre les services, les dépôts, les paiements et le suivi des commandes. Je ne peux pas effectuer de paiement ni modifier ton portefeuille. Pour un dossier personnel, le support WhatsApp est là.',
      quick: { deposit: 'Faire un dépôt', track: 'Suivre ma commande', services: 'Services disponibles', referral: 'Parrainage', support: 'Contacter le support' },
      questions: {
        deposit: 'Comment ajouter des fonds à mon portefeuille avec MonCash ou NatCash ?',
        track: 'Comment suivre ma commande ?',
        services: 'Quels services sont disponibles et quels sont les montants minimum ?',
        referral: 'Comment fonctionne le programme de parrainage ?'
      },
      supportMsg: 'Pour un problème sur une commande, un dépôt ou ton compte, écris au support. Prépare le numéro de commande (#XXXXXX dans « Commandes »), le montant et l’heure. Ne partage jamais ton mot de passe.',
      placeholder: 'Écris ta question…',
      inputLabel: 'Ta question',
      send: 'Envoyer',
      note: 'Ne partage jamais ton mot de passe, code PIN ou clé privée.',
      waiting: 'Je cherche une réponse…',
      login: 'Connecte-toi à ton compte Cash Boost pour utiliser cet assistant. Tu peux aussi contacter le support via WhatsApp.',
      error: 'Je ne peux pas répondre pour le moment. Réessaie plus tard ou contacte le support WhatsApp. Ne partage aucun mot de passe ni code secret.',
      wa: '💬 Support WhatsApp',
      close: 'Fermer',
      open: 'Ouvrir l’aide Cash Boost',
      langBtn: 'Kreyòl',
      langLabel: 'Passer en créole haïtien'
    },
    ht: {
      sub: 'Èd pou sèvis, depo ak kòmand',
      welcome: 'Bonjou ! Mwen se ' + NAME + ', asistan Cash Boost la. Mwen ka ede w konprann sèvis yo, depo yo, peman yo ak swivi kòmand yo. Mwen pa ka fè peman ni chanje pòtfèy ou. Pou yon dosye pèsonèl, sipò WhatsApp la la pou ou.',
      quick: { deposit: 'Fè yon depo', track: 'Swiv kòmand mwen', services: 'Sèvis ki disponib', referral: 'Parenaj', support: 'Kontakte sipò a' },
      questions: {
        deposit: 'Kijan pou m ajoute lajan nan pòtfèy mwen ak MonCash oswa NatCash ?',
        track: 'Kijan pou m swiv kòmand mwen ?',
        services: 'Ki sèvis ki disponib e ki minimòm yo ye ?',
        referral: 'Kijan pwogram parenaj la fonksyone ?'
      },
      supportMsg: 'Si w gen yon pwoblèm ak yon kòmand, yon depo oswa kont ou, ekri sipò a. Prepare nimewo kòmand lan (#XXXXXX nan « Commandes »), montan an ak lè a. Pa janm pataje modpas ou.',
      placeholder: 'Ekri kesyon ou…',
      inputLabel: 'Kesyon ou',
      send: 'Voye',
      note: 'Pa janm pataje modpas, kòd PIN oswa kle prive ou.',
      waiting: 'M ap chèche yon repons…',
      login: 'Konekte ak kont Cash Boost ou pou itilize asistan sa a. Ou ka kontakte sipò a sou WhatsApp tou.',
      error: 'Mwen pa ka reponn kounye a. Eseye ankò pita oswa kontakte sipò WhatsApp la. Pa pataje okenn modpas ni kòd sekrè.',
      wa: '💬 Sipò WhatsApp',
      close: 'Fèmen',
      open: 'Louvri èd Cash Boost',
      langBtn: 'Français',
      langLabel: 'Passer en français'
    }
  };

  let lang = 'fr';
  try {
    const saved = localStorage.getItem('cb_as_lang');
    if (saved === 'fr' || saved === 'ht') lang = saved;
    else if (/^(ht|hat)/i.test(navigator.language || '')) lang = 'ht';
  } catch (_) {}
  const T = () => I18N[lang];

  const style = document.createElement('style');
  style.textContent = `
    #cb-smart-assistant{position:fixed;right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:9998;font-family:inherit;color:#f8fafc}
    #cb-smart-assistant *{box-sizing:border-box}
    #cb-assistant-launch{display:grid;place-items:center;width:48px;height:48px;padding:0;border:2px solid #22d3ee;border-radius:50%;background:#0b1220;color:#22d3ee;font-weight:900;box-shadow:0 8px 28px #0891b266;cursor:pointer;transition:transform .25s ease,opacity .25s ease}
    #cb-assistant-launch.cb-away{transform:translateX(90px);opacity:0;pointer-events:none}
    .cb-as-avatar{display:grid;place-items:center;overflow:hidden;border-radius:50%;background:#0b1220;border:2px solid #22d3ee;color:#22d3ee;font-weight:900;font-size:13px}
    .cb-as-avatar img{width:62%;height:62%;object-fit:contain;display:block}
    #cb-assistant-launch .cb-as-avatar{width:100%;height:100%;border:0}
    #cb-assistant-panel{display:none;position:fixed;right:12px;bottom:calc(144px + env(safe-area-inset-bottom,0px));width:min(390px,calc(100vw - 24px));height:min(590px,calc(100dvh - 190px));background:#11121a;border:1px solid #343541;border-radius:22px;overflow:hidden;box-shadow:0 20px 70px #0009;flex-direction:column}
    #cb-assistant-panel.open{display:flex}
    .cb-as-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#171923;border-bottom:1px solid #30313d}
    .cb-as-head .cb-as-avatar{width:42px;height:42px;flex:none}
    .cb-as-title{font-weight:800;color:#f8fafc}.cb-as-sub{font-size:12px;color:#a5a7b5;margin-top:2px}
    .cb-as-lang{flex:none;height:36px;padding:0 12px;border:1px solid #3b3d49;border-radius:999px;background:transparent;color:#bae6fd;font-size:12px;font-weight:700;cursor:pointer}
    .cb-as-close{flex:none;border:1px solid #3b3d49;background:transparent;color:#e5e7eb;border-radius:10px;width:36px;height:36px;font-size:22px;cursor:pointer}
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
    @media(max-width:480px){#cb-smart-assistant{right:12px}#cb-assistant-panel{right:8px;bottom:calc(138px + env(safe-area-inset-bottom,0px));height:min(570px,calc(100dvh - 160px));width:calc(100vw - 16px)}}
    @media(prefers-reduced-motion:no-preference){#cb-assistant-launch:active{transform:scale(.95)}}
  `;
  document.head.appendChild(style);

  const AVATAR = '<span class="cb-as-avatar" aria-hidden="true"><img src="logo-mark.svg" alt=""></span>';

  const root = document.createElement('div');
  root.id = 'cb-smart-assistant';
  root.innerHTML = `
    <section id="cb-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="cb-as-title">
      <header class="cb-as-head">${AVATAR}<div style="flex:1;min-width:0"><div class="cb-as-title" id="cb-as-title">${NAME}</div><div class="cb-as-sub" id="cb-as-sub"></div></div><button type="button" class="cb-as-lang" id="cb-as-lang"></button><button type="button" class="cb-as-close" id="cb-as-close">×</button></header>
      <div id="cb-assistant-messages" aria-live="polite"><div class="cb-as-msg bot" id="cb-as-welcome"></div></div>
      <div class="cb-as-quick" id="cb-as-quick"><button type="button" data-k="deposit"></button><button type="button" data-k="track"></button><button type="button" data-k="services"></button><button type="button" data-k="referral"></button><button type="button" data-k="support"></button></div>
      <form class="cb-as-form" id="cb-as-form"><input id="cb-assistant-input" maxlength="1000" autocomplete="off"><button id="cb-assistant-send" type="submit"></button></form>
      <div class="cb-as-note" id="cb-as-note"></div>
    </section>
    <button type="button" id="cb-assistant-launch" aria-expanded="false" aria-controls="cb-assistant-panel">${AVATAR}</button>`;
  document.body.appendChild(root);

  // Si le logo ne charge pas, on affiche « CB » à la place
  root.querySelectorAll('.cb-as-avatar img').forEach(img => {
    img.addEventListener('error', () => { img.replaceWith(document.createTextNode('CB')); });
  });

  const panel = root.querySelector('#cb-assistant-panel');
  const launch = root.querySelector('#cb-assistant-launch');
  const close = root.querySelector('#cb-as-close');
  const langBtn = root.querySelector('#cb-as-lang');
  const form = root.querySelector('#cb-as-form');
  const input = root.querySelector('#cb-assistant-input');
  const send = root.querySelector('#cb-assistant-send');
  const messagesEl = root.querySelector('#cb-assistant-messages');
  const quick = root.querySelector('#cb-as-quick');
  const welcome = root.querySelector('#cb-as-welcome');
  const history = [];
  let busy = false;
  let started = false;
  let serverSupportUrl = '';

  function applyLang() {
    const t = T();
    document.getElementById('cb-as-sub').textContent = t.sub;
    if (!started) welcome.textContent = t.welcome;
    quick.querySelectorAll('button').forEach(b => { b.textContent = t.quick[b.dataset.k]; });
    input.placeholder = t.placeholder;
    input.setAttribute('aria-label', t.inputLabel);
    if (!busy) send.textContent = t.send;
    document.getElementById('cb-as-note').textContent = t.note;
    close.setAttribute('aria-label', t.close);
    launch.setAttribute('aria-label', t.open);
    langBtn.textContent = t.langBtn;
    langBtn.setAttribute('aria-label', t.langLabel);
  }
  applyLang();

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
    a.textContent = T().wa;
    messagesEl.appendChild(a);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function toggle(open) {
    panel.classList.toggle('open', open);
    launch.setAttribute('aria-expanded', String(open));
    if (open) { launch.classList.remove('cb-away'); input.focus(); }
  }
  // Le bouton rond se cache pendant le défilement et revient quand on s'arrête
  let idleTimer;
  function slideAway() {
    if (panel.classList.contains('open')) return;
    launch.classList.add('cb-away');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => launch.classList.remove('cb-away'), 700);
  }
  window.addEventListener('scroll', slideAway, { passive: true, capture: true });
  window.addEventListener('touchmove', slideAway, { passive: true });
  launch.addEventListener('click', () => toggle(!panel.classList.contains('open')));
  close.addEventListener('click', () => toggle(false));
  langBtn.addEventListener('click', () => {
    lang = lang === 'fr' ? 'ht' : 'fr';
    try { localStorage.setItem('cb_as_lang', lang); } catch (_) {}
    applyLang();
  });
  quick.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || busy) return;
    const key = b.dataset.k;
    if (key === 'support') {
      started = true;
      quick.style.display = 'none';
      addMessage(T().quick.support, 'user');
      addMessage(T().supportMsg, 'bot');
      addSupportLink();
      return;
    }
    input.value = T().questions[key] || b.textContent;
    form.requestSubmit();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    if (message.length > 1000) return;
    started = true;
    addMessage(message, 'user');
    input.value = '';
    quick.style.display = 'none';
    busy = true;
    send.disabled = true;
    send.textContent = '…';
    const waiting = addMessage(T().waiting, 'bot');
    let showSupport = false;
    try {
      if (typeof sb === 'undefined' || !sb.auth || !sb.functions) throw new Error('assistant_unavailable');
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData?.session?.access_token) {
        waiting.textContent = T().login;
        showSupport = true;
        return;
      }
      history.push({ role: 'user', content: message });
      const { data, error } = await sb.functions.invoke('cash-boost-assistant', {
        body: { messages: history.slice(-8), lang }
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
      showSupport = /support|sipò|sipo|whatsapp/i.test(answer);
    } catch (_) {
      waiting.textContent = T().error;
      showSupport = true;
      if (history[history.length - 1]?.role === 'user') history.pop();
    } finally {
      if (showSupport) addSupportLink();
      busy = false;
      send.disabled = false;
      send.textContent = T().send;
      input.focus();
    }
  });
})();
