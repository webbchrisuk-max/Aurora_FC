/* Aurora 2 shared motion controller. Observes rendered state; never writes canonical data. */
(function(){
  'use strict';
  if(window.AuroraMotion)return;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const statusWords=/\b(DRAFT|READY|LOCKED|PARTIALLY_REGISTERED|COMPLETE|CAUTION|PASS|PENDING|SENDING|WRITING|CONFIRMED|REGISTERED|FAILED|ERROR|CONNECTED|ONLINE|OFFLINE)\b/i;
  const valueIds=new Set(['heroValue','heroAnnual','heroMonthly','missionBudget','missionAllocated','missionRemaining','kRemaining','kCandidates','kPass','income3Gap','income3Percent','houseRemainingKpi','overallStatus']);
  const previous=new WeakMap();
  const timers=new WeakMap();
  let armed=false;

  function pulse(el,name='aurora-value-change',duration=700){if(!el||reduce.matches)return;el.classList.remove(name);void el.offsetWidth;el.classList.add(name);clearTimeout(timers.get(el));timers.set(el,setTimeout(()=>el.classList.remove(name),duration))}
  function remember(root=document){root.querySelectorAll('strong,[class*="status"],[id*="Status"],[id*="status"]').forEach(el=>previous.set(el,el.textContent.trim()))}
  function inspect(el){if(!(el instanceof HTMLElement))return;const text=el.textContent.trim(),old=previous.get(el);if(old===undefined){previous.set(el,text);return}if(text===old)return;previous.set(el,text);if(!armed)return;if(valueIds.has(el.id)||/£|%|\b\d+[.,]?\d*\b/.test(text))pulse(el);if(statusWords.test(text)||/status|chip|badge/i.test(`${el.id} ${el.className}`)){pulse(el,'aurora-status-change');if(/LOCKED/.test(text))pulse(el,'aurora-route-locked');if(/CONFIRMED|REGISTERED|COMPLETE|PASS/.test(text))pulse(el,'aurora-confirmed');if(/FAILED|ERROR/.test(text))pulse(el,'aurora-failed')}}
  function animateRows(root){if(reduce.matches)return;root.querySelectorAll?.('tbody tr,.execution-check,.an-card,.scouting12-watch-row').forEach((row,index)=>{if(row.dataset.auroraMotionRow)return;row.dataset.auroraMotionRow='1';row.style.setProperty('--aurora-delay',`${Math.min(index,8)*35}ms`);pulse(row,'aurora-row-enter',700)})}
  const observer=new MutationObserver(records=>records.forEach(record=>{if(record.type==='characterData'){inspect(record.target.parentElement);return}record.addedNodes.forEach(node=>{if(node.nodeType===1){remember(node);animateRows(node)}else inspect(record.target)});inspect(record.target.closest?.('strong,[class*="status"],[id*="Status"],[id*="status"]'))}));

  function scoutingHooks(){const button=document.getElementById('runScouting');if(!button)return;button.addEventListener('click',()=>{document.body.classList.add('aurora-is-scanning');button.setAttribute('aria-label','Scanning market');queueMicrotask(()=>{document.body.classList.remove('aurora-is-scanning');button.removeAttribute('aria-label');pulse(document.getElementById('scoutingStatus'),'aurora-confirmed')})},{capture:true})}
  function loadScriptForPage(page,selector,src,datasetKey){const file=String(location.pathname||'').split('/').pop().toLowerCase();if(file!==page||document.querySelector(selector))return;const script=document.createElement('script');script.src=src;script.async=false;script.dataset[datasetKey]='1';document.head.appendChild(script)}
  function loadScoutingIntelligence3Migration(){loadScriptForPage('scouting.html','script[data-aurora-scouting-intelligence3-migration]','scouting-intelligence-3-migration.js?v=20260819-intelligence-3-migration-3','auroraScoutingIntelligence3Migration')}
  function loadScoutingIntelligence3(){loadScriptForPage('scouting.html','script[data-aurora-scouting-intelligence3]','scouting-intelligence-3.js?v=20260819-intelligence-3-2','auroraScoutingIntelligence3')}
  function loadScoutingIntelligence3Global(){loadScriptForPage('scouting.html','script[data-aurora-scouting-intelligence3-global]','scouting-intelligence-3-global-bridge.js?v=20260819-intelligence-3-global-1','auroraScoutingIntelligence3Global')}
  function loadScoutingIntelligence3ApprovalGuard(){loadScriptForPage('scouting.html','script[data-aurora-scouting-intelligence3-approval]','scouting-intelligence-3-approval-guard.js?v=20260819-intelligence-3-approval-1','auroraScoutingIntelligence3Approval')}
  function loadFormerReentryRefresh(){loadScriptForPage('scouting.html','script[data-aurora-former-reentry]','scouting-former-reentry-refresh.js?v=20260818-former-reentry-2','auroraFormerReentry')}
  function loadScoutingSquadOpportunities(){loadScriptForPage('scouting.html','script[data-aurora-squad-opportunities]','scouting-squad-opportunities.js?v=20260818-former-evidence-4','auroraSquadOpportunities')}
  function loadScoutingCleanBoard(){loadScriptForPage('scouting.html','script[data-aurora-scouting-clean-board]','scouting-clean-board.js?v=20260819-intelligence-3-board-3','auroraScoutingCleanBoard')}
  function loadBackgroundSignalScouting(){loadScriptForPage('scouting.html','script[data-aurora-background-signals]','scouting-signal-background.js?v=20260818-silent-signals-1','auroraBackgroundSignals')}
  function loadFinanceBillActionsFix(){loadScriptForPage('finance.html','script[data-aurora-bill-actions-fix]','finance-bill-actions-fix.js?v=20260824-pots-bills-1','auroraBillActionsFix')}
  function loadFinanceHouseDashboardUpgrade(){loadScriptForPage('finance.html','script[data-aurora-house-dashboard-upgrade]','finance-house-dashboard-upgrade.js?v=20260818-house-modal-2','auroraHouseDashboardUpgrade')}
  function loadFinanceHouseRoomGroups(){loadScriptForPage('finance.html','script[data-aurora-house-room-groups]','finance-house-room-groups.js?v=20260819-house-actions-2','auroraHouseRoomGroups')}
  function loadFinanceHousePriorityLayout(){loadScriptForPage('finance.html','script[data-aurora-house-priority-layout]','finance-house-priority-layout.js?v=20260819-bill-actions-1','auroraHousePriorityLayout')}
  function init(){remember();animateRows(document);scoutingHooks();loadScoutingIntelligence3Migration();loadScoutingIntelligence3();loadScoutingIntelligence3Global();loadScoutingIntelligence3ApprovalGuard();loadFormerReentryRefresh();loadScoutingSquadOpportunities();loadScoutingCleanBoard();loadBackgroundSignalScouting();loadFinanceBillActionsFix();loadFinanceHouseDashboardUpgrade();loadFinanceHouseRoomGroups();loadFinanceHousePriorityLayout();observer.observe(document.body,{subtree:true,childList:true,characterData:true});requestAnimationFrame(()=>requestAnimationFrame(()=>{armed=true;document.documentElement.classList.add('aurora-motion-ready')}))}
  window.AuroraMotion={pulse,reducedMotion:()=>reduce.matches};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
