(() => {
  'use strict';
  const BUILD='20260822-club-control-status-mirror-1';
  if(window.__auroraClubControlStatusMirror)return;
  window.__auroraClubControlStatusMirror=BUILD;
  const setAll=(id,value)=>document.querySelectorAll(`[id="${id}"]`).forEach(node=>{node.textContent=value});
  function sync(){
    let notifications=null;
    try{notifications=window.AuroraNotifications?.status?.()||null}catch(_){}
    setAll('ccNotificationEngine',notifications?'ACTIVE':'WAITING');
    setAll('ccUnread',notifications?String(Number(notifications.unread||0)):'—');
    const release=window.AuroraRelease;
    setAll('ccReleaseState',release?'GUARDED':'WAITING');
  }
  function bind(){sync();[100,500,1200,2500].forEach(delay=>setTimeout(sync,delay));setInterval(()=>{if(document.visibilityState==='visible')sync()},15000);window.addEventListener('aurora:stage3i-notifications',sync);window.addEventListener('focus',sync)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
