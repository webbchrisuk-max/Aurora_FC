/* Aurora 2 Rich Notification Centre v1 — one shared, cloud-safe event engine. */
(function(w){
'use strict';
if(w.AuroraNotifications)return;

const VERSION='1.1.0';
const MAX_RECORDS=500;
const FILTERS=['all','action','investments','finance','system','unread'];
const LABELS={income:'Income',investments:'Investments',chairman:"Chairman's Office",finance:'Finance',system:'Aurora System'};
const FILTER_ICONS={all:'grid',action:'alert',investments:'chart',finance:'wallet',system:'cloud',unread:'bell'};
const ICON_PATHS={
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  alert:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  chart:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',wallet:'<path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z"/><path d="M3 7V5a2 2 0 0 1 2-2h12"/><path d="M16 12h6v4h-6a2 2 0 0 1 0-4Z"/>',
  cloud:'<path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.4 8.6 4.8 4.8 0 0 0 7 18Z"/><path d="m9 13 2-2 2 2m2 2-2 2-2-2"/>',
  coins:'<ellipse cx="9" cy="6" rx="5" ry="2.5"/><path d="M4 6v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V6"/><path d="M7 16c.8.6 2.2 1 4 1 2.8 0 5-1.1 5-2.5v-4"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 2h8"/>',
  up:'<path d="m4 16 6-6 4 4 6-7"/><path d="M15 7h5v5"/>',down:'<path d="m4 8 6 6 4-4 6 7"/><path d="M15 17h5v-5"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/><circle cx="12" cy="15" r="2"/>',building:'<path d="m3 10 9-6 9 6M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/>',receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6"/>',transfer:'<path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4 4-4-4 4-4"/>',server:'<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01"/>',error:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>'
};
function svg(name,cls=''){return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]||ICON_PATHS.bell}</svg>`}
let ready=false,centreOpen=false,activeFilter='all',writing=false,evaluateTimer=0;
const pending=[];
const $=(s,root=document)=>root.querySelector(s);
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dateAt(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
function dayDiff(a,b){return Math.round((b-a)/86400000)}
function core(){return w.Aurora2?.core}
function state(){return core()?.read?.()}
function notificationState(s=state()){return {version:1,records:[],marketState:{},healthState:{},updatedAt:null,...obj(s?.notifications),records:arr(s?.notifications?.records),marketState:obj(s?.notifications?.marketState),healthState:obj(s?.notifications?.healthState)}}
function save(mutator){
  if(writing||!core()?.update)return null;
  writing=true;
  try{return core().update(s=>({...s,notifications:{...notificationState(s),...mutator(notificationState(s)),version:1,updatedAt:now()}}))}
  finally{writing=false}
}
function normalise(input){
  const category=['income','investments','chairman','finance','system'].includes(input.category)?input.category:'system';
  const priority=['critical','important','positive','info','premium','date'].includes(input.priority)?input.priority:'info';
  const key=String(input.key||'').trim().slice(0,220);
  if(!key)throw new Error('Aurora notification event key is required.');
  return {
    id:key,key,category,priority,
    eventType:String(input.eventType||category).slice(0,32),
    label:String(input.label||LABELS[category]||'Aurora').slice(0,50),
    title:String(input.title||'Aurora update').slice(0,100),
    detail:String(input.detail||'').slice(0,240),
    metadata:String(input.metadata||'').slice(0,100),
    actionLabel:String(input.actionLabel||'Open').slice(0,32),
    actionUrl:safeUrl(input.actionUrl||''),
    createdAt:input.createdAt||now(),readAt:null,archivedAt:null,
    pinned:Boolean(input.pinned),toast:input.toast!==false,
    source:String(input.source||'AURORA2').slice(0,40)
  };
}
function safeUrl(value){
  const url=String(value||'');
  return /^[a-z0-9._-]+\.html(?:[?#].*)?$/i.test(url)?url:'';
}
function emit(input){
  if(!ready){pending.push(input);return null}
  const record=normalise(input),ns=notificationState();
  if(ns.records.some(x=>x?.key===record.key))return null;
  save(n=>({records:[record,...n.records].slice(0,MAX_RECORDS)}));
  render();
  if(record.toast&&['critical','important','positive','premium','date'].includes(record.priority))showToast(record);
  return record;
}
function mutateRecord(key,patch){
  const stamp=now();
  save(n=>({records:n.records.map(r=>r.key===key?{...r,...patch(stamp)}:r)}));render();
}
function markRead(key){mutateRecord(key,t=>({readAt:t}))}
function markAllRead(){save(n=>({records:n.records.map(r=>r.readAt?r:{...r,readAt:now()})}));render()}
function dismiss(key){mutateRecord(key,t=>({archivedAt:t,readAt:t,pinned:false}))}
function openAction(record){
  if(!record)return;
  markRead(record.key);
  if(record.actionUrl)location.assign(record.actionUrl);
}
function status(){const n=notificationState();return {version:VERSION,total:n.records.length,unread:n.records.filter(x=>!x.readAt&&!x.archivedAt).length,active:n.records.filter(x=>!x.archivedAt).length,archived:n.records.filter(x=>x.archivedAt).length,centreOpen,filter:activeFilter}}

function relative(iso){
  const ms=Date.now()-new Date(iso).getTime();if(!Number.isFinite(ms)||ms<0)return 'just now';
  const min=Math.floor(ms/60000);if(min<1)return 'just now';if(min<60)return `${min}m ago`;
  const hr=Math.floor(min/60);if(hr<24)return `${hr}h ago`;const day=Math.floor(hr/24);return day===1?'yesterday':`${day}d ago`;
}
function matches(r){
  if(activeFilter==='unread')return !r.readAt;
  if(activeFilter==='action')return r.pinned||['critical','premium'].includes(r.priority);
  if(activeFilter==='investments')return ['investments','income','chairman'].includes(r.category);
  return activeFilter==='all'||r.category===activeFilter;
}
function visual(r){const key=String(r.key||''),type=String(r.eventType||'');if(key.startsWith('DIVIDEND:'))return ['dividend','coins'];if(key.startsWith('EXDIV:'))return ['exdiv','calendar'];if(key.startsWith('MARKET:'))return [key.includes(':DOWN:')?(Number(key.split(':').pop())>=7?'fall-major':'fall'):'rise',key.includes(':DOWN:')?'down':'up'];if(key.startsWith('PRICE_TARGET:'))return ['target','target'];if(key.startsWith('CHAIRMAN_OFFER:'))return ['chairman','building'];if(key.startsWith('PAYDAY:'))return ['payday','wallet'];if(key.startsWith('BILL:'))return [key.includes(':OVERDUE:')?'overdue':'bill',key.includes(':OVERDUE:')?'alert':'receipt'];if(key.startsWith('CLOUD:'))return [r.priority==='critical'?'critical':'cloud','cloud'];if(key.startsWith('DATA2:'))return [r.priority==='critical'?'backend':'positive','server'];if(type==='transfer')return ['transfer','transfer'];if(type==='milestone')return ['milestone','trophy'];if(type==='critical')return ['critical','error'];return [r.priority||'info',r.category==='finance'?'wallet':r.category==='investments'?'chart':'bell']}
function card(r){const [tone,icon]=visual(r);return `<article class="an-card an-tone-${tone} ${r.readAt?'is-read':'is-unread'} ${r.pinned?'is-pinned':''}" data-key="${esc(r.key)}" ${r.actionUrl?'tabindex="0" role="link"':''}>
  <div class="an-icon">${svg(icon)}</div><div class="an-card-body"><div class="an-eyebrow"><span>${esc(r.label)}</span>${!r.readAt?'<i aria-label="Unread"></i>':''}</div>
  <strong class="an-title">${esc(r.title)}</strong><p>${esc(r.detail)}</p><div class="an-meta">${r.metadata?`<span>${esc(r.metadata)}</span>`:''}<time datetime="${esc(r.createdAt)}">${esc(relative(r.createdAt))}</time>${r.pinned&&!r.metadata?'<span>REVIEW REQUIRED</span>':''}</div>
  <div class="an-actions">${r.actionUrl?`<button type="button" data-an-action>${esc(r.actionLabel)}</button>`:''}${!r.readAt?'<button type="button" class="an-secondary" data-an-read>Mark read</button>':''}<button type="button" class="an-dismiss" data-an-dismiss aria-label="Dismiss notification" title="Dismiss">${svg('error')}</button></div></div></article>`}
function groupName(iso){const d=new Date(iso),today=new Date();today.setHours(0,0,0,0);const then=new Date(d);then.setHours(0,0,0,0);const days=Math.round((today-then)/86400000);return days<=0?'Today':days===1?'Yesterday':days<=6?'Earlier This Week':'Older'}
function groupedCards(rows){let last='';return rows.map(r=>{const group=groupName(r.createdAt),heading=group!==last?`<h3 class="an-group">${group}</h3>`:'';last=group;return heading+card(r)}).join('')}
function render(){
  if(!ready)return;const ns=notificationState(),active=ns.records.filter(r=>!r.archivedAt),unread=active.filter(r=>!r.readAt).length;
  const urgent=active.some(r=>!r.readAt&&(r.pinned||r.priority==='critical'));const badge=$('#auroraNotificationBadge');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.hidden=!unread;badge.classList.toggle('is-critical',urgent)}
  const list=$('#auroraNotificationList');if(list){const rows=active.filter(matches).sort((a,b)=>(Number(Boolean(b.pinned||b.priority==='critical'))-Number(Boolean(a.pinned||a.priority==='critical')))||(new Date(b.createdAt)-new Date(a.createdAt)));list.innerHTML=groupedCards(rows)||`<div class="an-empty">${svg('bell')}<strong>All clear</strong><p>No notifications match this view.</p></div>`}
  const count=$('#auroraNotificationCount');if(count)count.textContent=`${unread} UNREAD • ${active.length} ACTIVE`;
  document.querySelectorAll('[data-an-filter]').forEach(b=>b.classList.toggle('is-active',b.dataset.anFilter===activeFilter));
}
function showToast(r){
  const host=$('#auroraNotificationToasts');if(!host||document.visibilityState==='hidden')return;
  const [tone,icon]=visual(r),el=document.createElement('article');el.className=`an-toast an-tone-${tone}`;el.innerHTML=`<div class="an-icon">${svg(icon)}</div><div><small>${esc(r.label)}</small><strong>${esc(r.title)}</strong><p>${esc(r.detail)}</p></div><button aria-label="Close">×</button>`;
  el.addEventListener('click',e=>{if(e.target.closest('button')){el.remove();return}openAction(r)});host.prepend(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300)},6500);
}

function buildUi(){
  if($('#auroraNotificationCentre'))return;
  const context=$('.aurora-shell-context')||$('.shell-context');
  const bell=document.createElement('button');bell.type='button';bell.id='auroraNotificationBell';bell.className='shell-control an-bell';bell.title='Notification Centre';bell.setAttribute('aria-label','Open Notification Centre');bell.innerHTML=`<span>${svg('bell')}</span><b id="auroraNotificationBadge" hidden>0</b>`;
  if(context)context.insertBefore(bell,context.querySelector('.aurora-shell-live')||null);else document.body.appendChild(bell);
  document.body.insertAdjacentHTML('beforeend',`<div class="an-shade" id="auroraNotificationShade"></div><aside class="an-centre" id="auroraNotificationCentre" aria-label="Notification Centre" aria-hidden="true"><header><div><small>AURORA 2 • LIVE INTELLIGENCE</small><h2>Notification Centre</h2><span id="auroraNotificationCount">0 UNREAD</span></div><button type="button" data-an-close aria-label="Close">×</button></header><nav aria-label="Notification filters">${[['all','All'],['action','Action Required'],['investments','Investments'],['finance','Finance'],['system','System'],['unread','Unread']].map(([k,v])=>`<button type="button" data-an-filter="${k}">${svg(FILTER_ICONS[k])}<span>${v}</span></button>`).join('')}</nav><div class="an-toolbar"><span>LIVE INTELLIGENCE • ONLY MEANINGFUL EVENTS</span><button type="button" data-an-all-read>Mark all read</button></div><div class="an-list" id="auroraNotificationList"></div></aside><div class="an-toasts" id="auroraNotificationToasts" aria-live="polite"></div>`);
  bell.addEventListener('click',toggleCentre);$('#auroraNotificationShade').addEventListener('click',closeCentre);
  $('#auroraNotificationCentre').addEventListener('click',e=>{const cardEl=e.target.closest('[data-key]'),key=cardEl?.dataset.key;if(e.target.closest('[data-an-close]'))closeCentre();else if(e.target.closest('[data-an-filter]')){activeFilter=e.target.closest('[data-an-filter]').dataset.anFilter;render()}else if(e.target.closest('[data-an-all-read]'))markAllRead();else if(key&&e.target.closest('[data-an-action]'))openAction(notificationState().records.find(r=>r.key===key));else if(key&&e.target.closest('[data-an-read]'))markRead(key);else if(key&&e.target.closest('[data-an-dismiss]'))dismiss(key);else if(key)openAction(notificationState().records.find(r=>r.key===key))});
  $('#auroraNotificationCentre').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.an-card')){e.preventDefault();openAction(notificationState().records.find(r=>r.key===e.target.dataset.key))}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&centreOpen)closeCentre()});
}
function toggleCentre(){centreOpen?closeCentre():openCentre()}
function openCentre(){centreOpen=true;document.body.classList.add('an-open');$('#auroraNotificationCentre')?.setAttribute('aria-hidden','false');render()}
function closeCentre(){centreOpen=false;document.body.classList.remove('an-open');$('#auroraNotificationCentre')?.setAttribute('aria-hidden','true')}

function dividendEvents(s,today){
  arr(s.income?.calendar).forEach(e=>{
    const ticker=String(e.ticker||'').toUpperCase(),id=String(e.id||e.backendId||'EVENT'),status=String(e.status||'').toUpperCase();
    if(e.exDate===today&&!['CANCELLED','ARCHIVED'].includes(status))emit({key:`EXDIV:${ticker}:${today}`,eventType:'exdiv',category:'investments',priority:'date',title:'Ex-dividend today',detail:`${ticker} goes ex-dividend today. Eligibility uses the canonical Income calendar.`,actionLabel:'Open Income',actionUrl:'income.html',source:'INCOME'});
    if(e.payDate===today&&status==='PAID')emit({key:`DIVIDEND:${ticker}:${today}:${id}`,eventType:'dividend',category:'income',priority:'positive',title:'Dividend received',detail:`${ticker} paid ${money(e.actualAmountGbp||e.expectedAmountGbp)} into your ${e.account||'investment account'} today.`,actionLabel:'View Income',actionUrl:'income.html',source:'INCOME'});
  });
}
function financeEvents(s,todayDate,today){
  const payday=dateAt(s.finance?.plan?.paydayDate),diff=payday?dayDiff(todayDate,payday):null;
  if(diff===2||diff===0)emit({key:`PAYDAY:${today}:${diff===0?'TODAY':'TWO_DAYS'}:${s.finance.plan.paydayDate}`,eventType:'payday',category:'finance',priority:diff===0?'positive':'important',title:diff===0?'Payday today':'Payday approaching',detail:diff===0?'Payday has arrived. Review wage routing and protected commitments.':'Payday is in two days. Finance can confirm the protected runway.',actionLabel:'Open Finance',actionUrl:'finance.html',source:'FINANCE'});
  arr(s.finance?.bills).filter(b=>!b.paid&&!b.archived&&b.included!==false).forEach(b=>{const due=dateAt(b.due);if(!due)return;const d=dayDiff(todayDate,due);let stage='';if(d===3)stage='THREE_DAYS';else if(d===1)stage='TOMORROW';else if(d===0)stage='TODAY';else if(d<0)stage='OVERDUE';if(!stage)return;emit({key:`BILL:${b.id}:${stage}:${b.due}`,eventType:d<0?'bill-overdue':'bill-due',category:'finance',priority:d<0?'critical':d===0?'important':'info',title:d<0?'Bill overdue':d===0?'Bill due today':d===1?'Bill due tomorrow':'Bill due in three days',detail:`${b.name} • ${money(b.amount)} from ${b.fundingSource||'Current Account'}.`,actionLabel:'Review Bill',actionUrl:'finance.html#billsPanel',source:'FINANCE'})});
}
function workflowEvents(s){
  const m=s.mission;if(!m?.id)return;
  const status=String(m.status||''),p=w.AuroraTransferMission?.progress?.(s)||m.registrationStatus||{};
  const common={eventType:'transfer',category:'investments',actionUrl:'transfer.html',source:'TRANSFER'};
  if(status==='DRAFT')emit({...common,key:`MISSION:${m.id}:DRAFT`,title:'Payday money ready',detail:`Finance released ${money(m.approvedBudget)} for one canonical Transfer mission.`,actionLabel:'Open Transfer'});
  if(status==='READY')emit({...common,key:`MISSION:${m.id}:READY`,title:'Transfer plan ready for review',detail:`${p.total||m.legIds?.length||0} planned purchase legs await route approval.`,actionLabel:'Review Route'});
  if(status==='LOCKED')emit({...common,key:`MISSION:${m.id}:LOCKED`,title:'Transfer route locked',detail:`The approved route is ready for Registration.`,actionLabel:'Open Registration',actionUrl:'registration.html'});
  if(status==='PARTIALLY_REGISTERED')emit({...common,key:`MISSION:${m.id}:PARTIAL:${p.registered}`,title:'Transfer partially complete',detail:`${p.registered} of ${p.total} purchases are confirmed by AuroraData 2.`,actionLabel:'Continue Registration',actionUrl:'registration.html'});
  if(status==='COMPLETE')emit({...common,key:`MISSION:${m.id}:COMPLETE`,title:'Payday transfer complete',detail:`Actual investment ${money(p.actualInvested)} • remaining cash ${money(p.remaining)}.`,actionLabel:'View Transfer Review'});
}
function marketEvents(s){
  const ns=notificationState(s),next={...ns.marketState};
  arr(s.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&Number(h.shares)>0).forEach(h=>{
    const ticker=String(h.ticker||'').toUpperCase(),pct=Number(h.dayChangePct);if(!ticker||!Number.isFinite(pct))return;
    const direction=pct>=2?'UP':pct<=-2?'DOWN':'FLAT',magnitude=Math.abs(pct),tier=[7,4,2].find(x=>magnitude>=x)||0,previous=obj(next[ticker]);
    if(tier&&!(previous.direction===direction&&Number(previous.tier)>=tier))emit({key:`MARKET:${ticker}:${direction}:${tier}`,eventType:direction==='UP'?'stock-rise':'stock-fall',category:'investments',priority:tier>=7?'critical':tier>=4?'important':'info',title:`${ticker} moved ${direction==='UP'?'up':'down'} ${tier}%`,detail:`The canonical Squad feed shows ${pct>0?'+':''}${pct.toFixed(2)}%, crossing the ${tier}% movement threshold.`,actionLabel:'View Holding',actionUrl:`squad.html#${encodeURIComponent(ticker)}`,source:'SQUAD'});
    const previousPrice=Number(previous.price)||0;
    const price=Number(h.livePriceGbp),targets=[['USER',Number(h.priceTargetGbp)],['CHAIRMAN',Number(h.chairmanTargetGbp)]];
    targets.forEach(([kind,target])=>{if(previousPrice>0&&previousPrice<target&&price>=target)emit({key:`PRICE_TARGET:${ticker}:${kind}:${target}`,category:'investments',priority:kind==='CHAIRMAN'?'premium':'important',title:'Price target crossed',detail:`${ticker} reached ${money(price)}, above the ${kind==='CHAIRMAN'?"Chairman's ":''}target of ${money(target)}.`,actionLabel:'Review Holding',actionUrl:'club-control.html',source:'SQUAD'})});
    next[ticker]={direction,tier,percent:pct,price};
  });
  if(JSON.stringify(next)!==JSON.stringify(ns.marketState))save(n=>({marketState:next}));
}
function offerEvents(s){
  arr(s.transfer?.offers).forEach(o=>{const ticker=String(o.ticker||o.symbol||'HOLDING').toUpperCase(),id=String(o.id||o.offerId||'');if(!id)return;const status=String(o.status||'RECEIVED').toUpperCase(),reviewed=Boolean(o.reviewedAt||o.dismissedAt||o.acceptedAt)||['REVIEWED','ACCEPTED','DISMISSED'].includes(status);
    if(!reviewed&&['RECEIVED','NEW','PENDING','OPEN'].includes(status))emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:RECEIVED`,eventType:'chairman-offer',category:'chairman',priority:'premium',label:"Chairman's Office",metadata:`${ticker} • Review required`,title:"Chairman's Offer Received",detail:`${ticker} has generated a new offer and needs review.`,actionLabel:'Review Offer',actionUrl:'club-control.html#chairmanReviewBoardV11',pinned:true,source:'CHAIRMAN'});
    if(['ACTIVE','ACTIVATED','TARGET_REACHED'].includes(status))emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:${status==='TARGET_REACHED'?'TARGET_REACHED':'ACTIVATED'}`,category:'chairman',priority:'premium',title:status==='TARGET_REACHED'?"Chairman's Offer target reached":"Chairman's Offer activated",detail:`${ticker} offer ${status==='TARGET_REACHED'?'has reached its recorded target':'is now active'}.`,actionLabel:'Review Offer',actionUrl:'club-control.html#chairmanReviewBoardV11',source:'CHAIRMAN'});
    const legitimatelyEnded=(status==='WITHDRAWN'&&o.withdrawnAt)||(status==='EXPIRED'&&(o.expiredAt||(o.expiresAt&&new Date(o.expiresAt)<=new Date())));if(legitimatelyEnded)emit({key:`CHAIRMAN_OFFER:${ticker}:${id}:${status}`,category:'chairman',priority:'important',title:`Chairman's Offer ${status.toLowerCase()}`,detail:`${ticker} offer was explicitly ${status.toLowerCase()} in the canonical offer record.`,actionLabel:'Open Club Control',actionUrl:'club-control.html',source:'CHAIRMAN'});
  });
}
function healthEvents(s){
  const ns=notificationState(s),health={...ns.healthState},cfg=w.AuroraData2Client?.config?.(),backend=String(s.income?.backend?.status||s.connection?.status||'');
  if(w.AuroraData2Client){const dataProblem=!cfg?.endpoint?'ENDPOINT_MISSING':(['ERROR','FAILED'].includes(backend)?'BACKEND_FAILED':'');
    if(dataProblem&&health.data2!==dataProblem)emit({key:`DATA2:${dataProblem}:${localDate()}`,eventType:'backend',category:'system',priority:'critical',title:dataProblem==='ENDPOINT_MISSING'?'AuroraData 2 endpoint missing':'AuroraData 2 backend failed',detail:dataProblem==='ENDPOINT_MISSING'?'This browser has no AuroraData 2 endpoint configured. Credentials remain local and are never synced.':String(s.income?.backend?.lastError||'The backend reported a real failure.'),actionLabel:'Open System Health',actionUrl:'system-health.html',source:'AURORADATA2'});
    if(!dataProblem&&health.data2&&health.data2!=='HEALTHY')emit({key:`DATA2:RECOVERED:${localDate()}:${health.data2}`,category:'system',priority:'positive',title:'AuroraData 2 recovered',detail:'The backend responded successfully after the recorded problem.',actionLabel:'View Health',actionUrl:'system-health.html',source:'AURORADATA2'});
    health.data2=dataProblem||'HEALTHY';
  }
  const cloud=w.AuroraCloudSync?.status?.();if(cloud){let issue='';if(arr(cloud.conflicts).length)issue='CONFLICT';else if(cloud.signedIn&&cloud.online&&cloud.phase==='ERROR')issue='SYNC_FAILURE';else if(cloud.signedIn&&cloud.online&&cloud.lastSyncAt&&Date.now()-new Date(cloud.lastSyncAt).getTime()>86400000)issue='STALE_DEVICE';if(issue&&health.cloud!==issue)emit({key:`CLOUD:${issue}:${localDate()}`,eventType:'cloud',category:'system',priority:issue==='CONFLICT'?'critical':'important',title:issue==='CONFLICT'?'Aurora Cloud conflict':'Aurora Cloud needs attention',detail:issue==='CONFLICT'?'A real department conflict needs a protected copy choice.':issue==='STALE_DEVICE'?'This joined device has not completed a sync for more than 24 hours.':'Aurora Cloud reported a sync failure.',actionLabel:'Review Cloud',actionUrl:'system-health.html',source:'AURORA_CLOUD'});health.cloud=issue||'HEALTHY'}
  if(JSON.stringify(health)!==JSON.stringify(ns.healthState))save(n=>({healthState:health}));
}
function evaluate(){
  if(!ready||writing)return status();const s=state();if(!s)return status();const d=new Date();d.setHours(12,0,0,0);const today=localDate(d);
  const paidBills=new Set(arr(s.finance?.bills).filter(b=>b.paid||b.archived).map(b=>String(b.id)));
  const closedOffers=new Set(arr(s.transfer?.offers).filter(o=>o.reviewedAt||o.dismissedAt||o.acceptedAt||['REVIEWED','ACCEPTED','DISMISSED'].includes(String(o.status||'').toUpperCase())).map(o=>String(o.id||o.offerId)));
  const currentNotifications=notificationState(s);
  if(currentNotifications.records.some(r=>(!r.archivedAt&&r.key.startsWith('BILL:')&&paidBills.has(r.key.split(':')[1]))||(r.pinned&&r.key.startsWith('CHAIRMAN_OFFER:')&&closedOffers.has(r.key.split(':')[2]))))save(n=>({records:n.records.map(r=>{if(!r.archivedAt&&r.key.startsWith('BILL:')&&paidBills.has(r.key.split(':')[1]))return {...r,archivedAt:now(),readAt:r.readAt||now()};if(r.pinned&&r.key.startsWith('CHAIRMAN_OFFER:')&&closedOffers.has(r.key.split(':')[2]))return {...r,pinned:false,readAt:r.readAt||now()};return r})}));
  dividendEvents(s,today);financeEvents(s,d,today);workflowEvents(s);marketEvents(state());offerEvents(state());healthEvents(state());render();return status();
}
function scheduleEvaluate(){clearTimeout(evaluateTimer);evaluateTimer=setTimeout(evaluate,350)}
function init(){
  if(ready||!core()?.read){setTimeout(init,50);return}ready=true;injectStyles();buildUi();pending.splice(0).forEach(emit);render();setTimeout(evaluate,200);w.addEventListener('aurora2:state',scheduleEvaluate);w.addEventListener('aurora2:cloud-applied',scheduleEvaluate);setInterval(()=>{render();evaluate()},5*60*1000);
}
function injectStyles(){
  if($('#auroraNotificationStyles'))return;const style=document.createElement('style');style.id='auroraNotificationStyles';style.textContent=`
:root{--an-bg:#090d13;--an-line:rgba(115,202,255,.14);--an-cyan:#52d9ff}.an-bell{position:relative;transition:filter .2s,transform .2s}.an-bell:hover{filter:drop-shadow(0 0 8px rgba(82,217,255,.65));transform:translateY(-1px)}.an-bell>span{display:grid;color:#bfefff}.an-bell svg{width:20px;height:20px}.an-bell b{position:absolute;right:-3px;top:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:10px;background:#28bfe8;color:#00141c;font:900 9px/17px Inter,Arial;box-shadow:0 0 13px rgba(40,191,232,.7)}.an-bell b.is-critical{background:#ff455d;color:#fff;box-shadow:0 0 15px #ff304f}.an-shade{position:fixed;inset:0;z-index:9990;background:rgba(2,5,10,.68);opacity:0;pointer-events:none;transition:.25s}.an-centre{position:fixed;z-index:9991;right:0;top:0;width:min(540px,100vw);height:100dvh;transform:translateX(102%);transition:transform .32s cubic-bezier(.2,.8,.2,1);background:linear-gradient(145deg,rgba(12,19,29,.975),rgba(5,8,13,.985));backdrop-filter:blur(22px);border-left:1px solid var(--an-line);box-shadow:-30px 0 90px rgba(0,0,0,.65);color:#e9f7ff;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif}.an-open .an-shade{opacity:1;pointer-events:auto}.an-open .an-centre{transform:none}.an-centre header{padding:28px 24px 20px;display:flex;justify-content:space-between;border-bottom:1px solid var(--an-line);background:radial-gradient(circle at 15% 0,rgba(55,194,255,.11),transparent 55%)}.an-centre header small,.an-toast small{font-size:9px;font-weight:900;letter-spacing:.18em;color:#52d9ff}.an-centre h2{margin:6px 0 4px;font:800 25px/1.1 Inter,system-ui}.an-centre header span{font-size:9px;letter-spacing:.12em;color:#7f96a6}.an-centre header button{border:0;background:transparent;color:#89a0af;font-size:30px;cursor:pointer}.an-centre nav{display:flex;flex:none;gap:7px;padding:14px 18px;overflow-x:auto;scrollbar-width:thin;border-bottom:1px solid rgba(255,255,255,.06)}.an-centre nav button,.an-toolbar button{--filter:#52d9ff;display:inline-flex;align-items:center;gap:6px;flex:none;white-space:nowrap;border:1px solid color-mix(in srgb,var(--filter) 25%,transparent);border-radius:20px;background:color-mix(in srgb,var(--filter) 7%,transparent);color:color-mix(in srgb,var(--filter) 75%,#a7b8c2);padding:8px 11px;font:800 9px Inter;letter-spacing:.04em;cursor:pointer}.an-centre nav button svg{width:13px;height:13px}.an-centre nav button[data-an-filter=action]{--filter:#ff455d}.an-centre nav button[data-an-filter=investments]{--filter:#ae7cff}.an-centre nav button[data-an-filter=finance]{--filter:#42dd98}.an-centre nav button[data-an-filter=system]{--filter:#559cff}.an-centre nav button[data-an-filter=unread]{--filter:#e8bd52}.an-centre nav button.is-active{color:#f5fbff;border-color:color-mix(in srgb,var(--filter) 68%,transparent);background:color-mix(in srgb,var(--filter) 16%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--filter) 16%,transparent)}.an-toolbar{padding:10px 20px;display:flex;gap:12px;align-items:center;justify-content:space-between;color:#698594;font-size:8px;font-weight:800;letter-spacing:.11em}.an-toolbar button{border:0;color:#79dffa;background:none;padding:7px}.an-list{padding:2px 16px 35px;overflow:auto}.an-group{margin:15px 5px 5px;color:#647d8b;font-size:9px;letter-spacing:.15em;text-transform:uppercase}.an-card{--accent:#52d9ff;position:relative;display:grid;grid-template-columns:48px minmax(0,1fr);gap:13px;margin:9px 0;padding:16px;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:15px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 6%,rgba(15,20,28,.9)),rgba(8,12,18,.88));box-shadow:inset 3px 0 var(--accent),0 12px 35px rgba(0,0,0,.2);cursor:pointer}.an-card.is-unread{border-color:color-mix(in srgb,var(--accent) 35%,transparent);box-shadow:inset 3px 0 var(--accent),0 12px 35px rgba(0,0,0,.24),0 0 20px color-mix(in srgb,var(--accent) 7%,transparent)}.an-card.is-read{box-shadow:inset 2px 0 color-mix(in srgb,var(--accent) 55%,transparent)}.an-card.is-read .an-title{color:#d8e5eb}.an-card.is-pinned{border-color:color-mix(in srgb,var(--accent) 55%,transparent)}.an-tone-critical,.an-tone-overdue,.an-tone-fall-major{--accent:#ff4059}.an-tone-important,.an-tone-bill,.an-tone-fall{--accent:#ffb947}.an-tone-positive,.an-tone-dividend{--accent:#4ee39a}.an-tone-info,.an-tone-target,.an-tone-payday{--accent:#52d9ff}.an-tone-premium,.an-tone-chairman{--accent:#e9b94d}.an-tone-date,.an-tone-exdiv{--accent:#b985ff}.an-tone-rise{--accent:#45dbb6}.an-tone-milestone{--accent:#a8d95a}.an-tone-transfer{--accent:#df5aa9}.an-tone-cloud{--accent:#64b9ff}.an-tone-backend{--accent:#ff873d}.an-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);border-radius:13px;background:color-mix(in srgb,var(--accent) 11%,transparent);color:var(--accent);box-shadow:0 0 20px color-mix(in srgb,var(--accent) 12%,transparent)}.an-icon svg{width:23px;height:23px}.an-eyebrow{display:flex;align-items:center;gap:7px;color:var(--accent);font:900 8px Inter;letter-spacing:.17em;text-transform:uppercase}.an-eyebrow i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 9px var(--accent)}.an-title{display:block;margin:7px 0 5px;color:#f2fbff;font-size:14px}.an-card p,.an-toast p{margin:0;color:#94a8b4;font-size:11px;line-height:1.5}.an-meta{display:flex;flex-wrap:wrap;gap:7px 12px;margin-top:9px;color:#667d8a;font-size:9px}.an-meta span{color:color-mix(in srgb,var(--accent) 72%,#91a3ad);font-weight:800;letter-spacing:.04em}.an-actions{display:flex;align-items:center;gap:9px;margin-top:12px}.an-actions button{border:1px solid color-mix(in srgb,var(--accent) 62%,transparent);border-radius:8px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:color-mix(in srgb,var(--accent) 85%,white);padding:8px 11px;font:900 9px Inter;letter-spacing:.04em;cursor:pointer}.an-actions .an-secondary,.an-actions .an-dismiss{border:0;background:none;color:#78909e}.an-actions .an-dismiss{margin-left:auto;width:30px;height:30px;padding:6px}.an-dismiss svg{width:16px;height:16px}.an-empty{text-align:center;padding:80px 25px;color:#617480}.an-empty>svg{width:30px;color:#52d9ff}.an-empty strong{display:block;margin:10px;color:#cdebf7}.an-empty p{font-size:11px}.an-toasts{position:fixed;z-index:9995;right:18px;top:78px;width:min(390px,calc(100vw - 28px));pointer-events:none}.an-toast{--accent:#52d9ff;display:grid;grid-template-columns:44px 1fr 20px;gap:12px;margin-bottom:10px;padding:15px;border:1px solid color-mix(in srgb,var(--accent) 42%,transparent);border-radius:14px;background:rgba(9,14,21,.97);box-shadow:0 18px 55px rgba(0,0,0,.55),0 0 25px color-mix(in srgb,var(--accent) 9%,transparent);transform:translateX(115%);opacity:0;transition:.3s;pointer-events:auto;cursor:pointer;color:white}.an-toast.show{transform:none;opacity:1}.an-toast strong{display:block;margin:5px 0;font-size:13px}.an-toast button{border:0;background:none;color:#7e929f;font-size:19px;cursor:pointer}@media(max-width:600px){.an-centre{width:min(100vw,540px)}.an-centre header{padding:20px 18px 15px}.an-toolbar{padding-inline:14px}.an-toolbar>span{max-width:210px;line-height:1.4}.an-list{padding:2px 10px 26px}.an-card{grid-template-columns:40px minmax(0,1fr);padding:14px 12px;gap:10px}.an-icon{width:38px;height:38px}.an-actions{flex-wrap:wrap}.an-actions button{min-height:36px}.an-toasts{right:14px;top:66px}}
`;document.head.appendChild(style)}

w.AuroraNotifications={version:VERSION,emit,markRead,dismiss,markAllRead,status,evaluate,open:openCentre,close:closeCentre};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
