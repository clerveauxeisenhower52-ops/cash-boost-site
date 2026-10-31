// ---------------- Portefeuille ----------------
let walletRows=[],walletFilter='all',walletQuery='',walletShown=20;
let walletOp='MonCash',walletBal=0,walletHidden=false,walletDepBusy=false,walletNeedAmt=0,walletRealtimeChannel=null;
try{ walletHidden=localStorage.getItem('cashboost_wallet_hidden')==='1'; }catch(_){}
const WALLET_TX_LABELS={deposit:'Dépôt',purchase:'Achat',transfer_in:'Transfert reçu',transfer_out:'Transfert envoyé',refund:'Remboursement',adjustment:'Ajustement'};
function walletRenderBalance(){
  const txt=walletHidden?'••••• HTG':fmt(walletBal)+' HTG';
  const el=$('walletBalance'); if(el) el.textContent=txt;
  const h=$('hdrWalletAmt'); if(h) h.textContent=txt;
  const hb=$('homeBal'); if(hb) hb.textContent=txt;
}
