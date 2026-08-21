(() => {
'use strict';

const BUILD='20260821-income-settlement-reconcile-1';
let base=null;
let settlements=[];
let refreshing=false;
let lastRefreshAt=0;

const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const nowMs=()=>Date.now();

function truth(){return window.AuroraIncomeTruth||null}
function client(){return window.AuroraData2Client||null}
function state(){try{return window.Aurora2?.core?.read?.()||{}}catch(_){return {}}}
function parseAnyDate(v){
  const p=truth()?.parseDate?.(v);
  if(p instanceof Date&&!Number.isNaN(p.getTime()))return p;
  const d=v?new Date(v):null;
  return d&&!Number.isNaN(d.getTime())?d:null;
}
function account(v){return truth()?.accountCode?.(v)||String(v||'').toUpperCase()}
function ticker(v){return truth()?.ticker?.(v)||String(v||'').toUpperCase()}
function settlementAmount(r){
  const choices=[r?.amountGbp,r?.settlementAmountGbp,r?.grossAmountGbp,r?.cashChangeGbp];
  for(const v of choices){const n=num(v);if(n>0)return n}
  return 0;
}
function settlementDate(r){return parseAnyDate(r?.recordedAt||r?.settledAt||r?.receivedAt||r?.date||r?.createdAt)}
function settlementKey(r,i){return String(r?.id||r?.settlementId||r?.reference||`${account(r?.account)}|${ticker(r?.ticker)}|${settlementAmount(r).toFixed(2)}|${r?.recordedAt||i}`)}
function normalizeSettlements(snapshot){
  return arr(snapshot?.ledger).map((r,i)=>({
    raw:r,
    key:settlementKey(r,i),
    account:account(r?.account),
    ticker:ticker(r?.ticker),
    amount:settlementAmount(r),
    date:settlementDate(r),
    cashChange:num(r?.cashChangeGbp),
    type:String(r?.type||r?.action||r?.category||'').toUpperCase(),
    reference:String(r?.reference||'')
  })).filter(r=>['IG','T212'].includes(r.account)&&r.ticker&&r.amount>0&&r.date&&(r.cashChange>0||/DIVIDEND|CASH|REINVEST/.test(`${r.type} ${r.reference}`)));
}
function eventExpectedAmount(s,e){
  const actual=num(e?.actualAmountGbp);if(actual>0)return actual;
  const expected=num(e?.expectedAmountGbp);if(expected>0)return expected;
  const dps=num(e?.dividendPerShareGbp),shares=num(e?.sharesEligible);
  if(dps>0&&shares>0)return dps*shares;
  return Math.max(0,num(base?.eventAmount?.(s,e)));
}
function findSettlement(s,e,used){
  const status=String(e?.status||'FORECAST').toUpperCase();
  if(['PAID','CANCELLED','ARCHIVED'].includes(status))return null;
  const pay=parseAnyDate(e?.payDate);if(!pay)return null;
  const amount=eventExpectedAmount(s,e);if(amount<=0)return null;
  const ac=account(e?.account),tk=ticker(e?.ticker);
  const min=pay.getTime()-7*86400000,max=pay.getTime()+60*86400000;
  const candidates=settlements.filter(r=>!used.has(r.key)&&r.account===ac&&r.ticker===tk&&Math.abs(r.amount-amount)<=0.05&&r.date.getTime()>=min&&r.date.getTime()<=max);
  if(!candidates.length)return null;
  candidates.sort((a,b)=>Math.abs(a.date-pay)-Math.abs(b.date-pay));
  return candidates[0];
}
function reconcileEvents(s,events){
  const used=new Set();
  return arr(events).map(e=>{
    const hit=findSettlement(s,e,used);
    if(!hit)return e;
    used.add(hit.key);
    return {...e,status:'PAID',actualAmountGbp:hit.amount,paymentEvidence:'BROKER_CASH_LEDGER',paymentEvidenceRef:hit.reference||hit.key,paymentRecordedAt:hit.date.toISOString(),reconciledBy:BUILD};
  });
}
function installOverrides(){
  const current=truth();
  if(!current)return false;
  if(current.build===BUILD)return true;
  base=current;
  const reliability=(s,events,m)=>base.reliability(s,reconcileEvents(s,events),m);
  const runway=(s,events,m)=>base.runway(s,reconcileEvents(s,events),m);
  const upcoming=(s,events)=>base.upcoming(s,reconcileEvents(s,events));
  const nextDividend=(s,events)=>base.nextDividend(s,reconcileEvents(s,events));
  const summary=(s,events,history)=>base.summary(s,reconcileEvents(s,events),history);
  const calendarState=e=>base.calendarState(e);
  window.AuroraIncomeTruth=Object.freeze({...base,build:BUILD,reconcileEvents,reliability,runway,upcoming,nextDividend,summary,calendarState});
  return true;
}
async function refreshSettlements(force=false){
  if(refreshing||(!force&&nowMs()-lastRefreshAt<15000))return;
  if(!client()?.post)return;
  refreshing=true;
  try{
    const snapshot=await client().post('brokerCashSnapshot',{});
    settlements=normalizeSettlements(snapshot);
    lastRefreshAt=nowMs();
    installOverrides();
    setTimeout(()=>window.AuroraIncomeRestored?.render?.(),30);
    window.dispatchEvent(new CustomEvent('aurora:income-settlement-reconcile',{detail:{build:BUILD,count:settlements.length,at:new Date().toISOString()}}));
  }catch(_){
    // Payment reconciliation is additive. Calendar truth continues normally if the broker ledger is unavailable.
  }finally{refreshing=false}
}
async function start(){
  let tries=0;
  while((!truth()||!client()?.post)&&tries<200){await new Promise(r=>setTimeout(r,40));tries++}
  if(!truth())return;
  installOverrides();
  await refreshSettlements(true);
  document.addEventListener('click',e=>{
    if(e.target.closest('#recordDividendCash,#refreshBrokerCash'))setTimeout(()=>refreshSettlements(true),1200);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSettlements(true)});
  window.addEventListener('focus',()=>refreshSettlements(true));
  setInterval(()=>{if(document.visibilityState==='visible')refreshSettlements(false)},60000);
}
window.AuroraIncomeSettlementReconcile=Object.freeze({build:BUILD,refresh:()=>refreshSettlements(true),settlementCount:()=>settlements.length,reconcile:events=>reconcileEvents(state(),events)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();