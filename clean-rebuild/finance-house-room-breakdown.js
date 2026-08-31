(()=>{
'use strict';
const BUILD='20260831-finance-house-room-breakdown-2-recovered-plan';
const A=()=>window.AuroraClean;
const n=v=>Number(v)||0;
const m=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
const RECOVERED={
  'Hallway':[
    {name:'Hallway / stairs / landing labour',amount:2100,note:'Recovered prior labour budget'},
    {name:'Panelling + dado materials',amount:218.20,note:'Recovered discounted basket figure'},
    {name:'Hallway ceiling lights',amount:70,note:'Recovered lighting budget'}
  ],
  'Living Room':[
    {name:'Living Room labour',amount:1200,note:'Recovered prior labour budget'},
    {name:'Electrician / TV socket work',amount:270,note:'Recovered paid/quoted electrical figure'},
    {name:'Rug',amount:120,note:'Recovered room budget'},
    {name:'Ceiling light',amount:49,note:'Recovered room budget'},
    {name:'65-inch TV',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Soundbar',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Wall-hung TV unit',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Feature wallpaper',amount:0,note:'Already owned — no purchase cost'}
  ],
  'Games Room':[
    {name:'Games Room labour',amount:900,note:'Recovered prior labour budget'},
    {name:'Acoustic slat panels',amount:615,note:'Recovered panel order figure'},
    {name:'Plastering',amount:350,note:'Recovered accepted plastering price'},
    {name:'Ceiling light',amount:32,note:'Recovered lighting cost'},
    {name:'Skirting',amount:54.15,note:'Recovered room estimate'},
    {name:'LVT flooring',amount:1000,note:'Recovered room flooring estimate'},
    {name:'Shelving',amount:null,note:'Item recovered; exact old amount not recovered'}
  ],
  'Kitchen':[
    {name:'Kitchen labour',amount:1400,note:'Recovered original labour budget'},
    {name:'Oven',amount:350,note:'Recovered appliance budget'},
    {name:'Washing machine',amount:400,note:'Recovered appliance budget'},
    {name:'Kitchen lighting',amount:95,note:'Recovered lighting budget'},
    {name:'LVT flooring',amount:700,note:'Recovered room flooring estimate'},
    {name:'Worktops',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Sink + tap',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Induction hob',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Extractor',amount:null,note:'Item recovered; exact old amount not recovered'},
    {name:'Splashback / metro tiles',amount:null,note:'Item recovered; exact old amount not recovered'}
  ],
  'Whole House':[
    {name:'Whole-house flooring allowance',amount:5050,note:'Recovered amount set aside for flooring project'}
  ]
};
function liveBreakdown(room,entries){
  const rows=entries.filter(e=>e.status!=='archived'&&(e.room||'Whole House')===room);
  const estimated=rows.reduce((s,e)=>s+n(e.estimated),0),actual=rows.reduce((s,e)=>s+n(e.actual),0),reserved=rows.filter(e=>e.status==='reserved').reduce((s,e)=>s+n(e.estimated),0);
  const d=document.createElement('details');d.className='house-room-breakdown';
  const sum=document.createElement('summary');sum.textContent=`Live ledger · ${rows.length} item${rows.length===1?'':'s'} · ${m(Math.max(0,estimated-actual))} left`;d.appendChild(sum);
  rows.forEach(e=>{const x=document.createElement('div');x.className='house-room-payment';x.innerHTML=`<strong>${e.name||'House payment'}</strong><small>Estimated ${m(e.estimated)} · ${e.status==='reserved'?'Reserved '+m(e.estimated):'Paid '+m(e.actual)}</small>`;d.appendChild(x)});
  const t=document.createElement('div');t.className='house-room-total';t.textContent=`Live totals: ${m(estimated)} estimated · ${m(actual)} paid · ${m(reserved)} reserved.`;d.appendChild(t);
  return d;
}
function recoveredBreakdown(room){
  const rows=RECOVERED[room]||[];if(!rows.length)return null;
  const d=document.createElement('details');d.className='house-room-breakdown house-room-recovered';
  const sum=document.createElement('summary');sum.textContent=`Recovered old plan · ${rows.length} item${rows.length===1?'':'s'} · reference only`;d.appendChild(sum);
  rows.forEach(e=>{const x=document.createElement('div');x.className='house-room-payment recovered';x.innerHTML=`<strong>${e.name}</strong><small>${e.amount===null?'Amount not recovered':m(e.amount)} · ${e.note}</small>`;d.appendChild(x)});
  const t=document.createElement('div');t.className='house-room-total';t.textContent='Reference only — these recovered planning items do not change the live House Fund totals or reserved balance.';d.appendChild(t);
  return d;
}
function render(){if(!A()?.readState)return;const entries=A().readState().finance?.houseProject?.entries||[];document.querySelectorAll('#houseRoomCards .house-room-card').forEach(card=>{const room=card.querySelector('.finance-pot-card-head strong')?.textContent?.trim();if(!room)return;card.querySelectorAll('.house-room-breakdown').forEach(x=>x.remove());const a=card.querySelector('.finance-manage-actions');const live=liveBreakdown(room,entries);a?card.insertBefore(live,a):card.appendChild(live);const recovered=recoveredBreakdown(room);if(recovered){a?card.insertBefore(recovered,a):card.appendChild(recovered)}})}
function boot(){if(!A()){setTimeout(boot,60);return}if(!document.getElementById('houseRoomBreakdownStyle')){const s=document.createElement('style');s.id='houseRoomBreakdownStyle';s.textContent='.house-room-breakdown{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}.house-room-breakdown summary{cursor:pointer;font-weight:900;color:#dff6ff}.house-room-payment{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}.house-room-payment strong,.house-room-payment small{display:block}.house-room-payment small{margin-top:3px;color:#8da1b4}.house-room-total{padding-top:8px;color:#8da1b4}.house-room-recovered summary{color:#f6d27e}.house-room-payment.recovered strong{color:#f3f7fb}';document.head.appendChild(s)}render();window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));window.addEventListener('pageshow',()=>setTimeout(render,0));document.addEventListener('click',e=>{if(e.target.closest?.('[data-tab="house"]'))setTimeout(render,100)});window.AuroraFinanceHouseRoomBreakdown=Object.freeze({BUILD,render})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();