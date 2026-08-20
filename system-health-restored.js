(() => {
  'use strict';

  const BUILD = '20260820-system-health-restored-1';
  const $ = id => document.getElementById(id);
  const arr = value => Array.isArray(value) ? value : [];
  const set = (id,value) => { const el=$(id); if(el) el.textContent=value ?? '—'; };
  const since = value => {
    if (!value) return 'Never';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return String(value);
    const mins = Math.max(0,Math.round((Date.now()-time)/60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins/60);
    if (hours < 48) return `${hours}h ago`;
    return new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  };

  let running = false;

  function toast(message) {
    const el=$('healthToast'); if(!el) return;
    el.textContent=String(message || ''); el.classList.add('show');
    clearTimeout(window.__auroraHealthToast);
    window.__auroraHealthToast=setTimeout(()=>el.classList.remove('show'),3000);
  }
  function badge(id,text,tone='') {
    const el=$(id); if(!el) return;
    el.textContent=text; el.className=`health-badge ${tone}`.trim();
  }
  function healthRow(tone,title,note,meta='') {
    const icon=tone==='block'?'!':tone==='warn'?'•':'✓';
    return `<div class="health-row ${tone}"><i>${icon}</i><div><strong>${title}</strong><span>${note}</span></div><b>${meta}</b></div>`;
  }
  function safeCloudStatus() {
    try { return window.AuroraCloudSync?.status?.() || null; } catch (_) { return null; }
  }
  function safeNotificationStatus() {
    try { return window.AuroraNotifications?.status?.() || null; } catch (_) { return null; }
  }
  function stage3gStatus() {
    try { return window.AuroraStage3GShield?.status?.() || null; } catch (_) { return null; }
  }
  async function backendCheck() {
    try {
      if (!window.AuroraData2Client?.health) return {ok:false,error:'AuroraData 2 client not loaded'};
      const result=await window.AuroraData2Client.health();
      return {ok:true,result};
    } catch (error) {
      return {ok:false,error:String(error?.message || error || 'Connection failed')};
    }
  }
  function cloudView(cloud) {
    if (!cloud) return {label:'WAITING',tone:'warn',title:'Aurora Cloud is loading',meta:'Waiting for the cloud lifecycle engine.'};
    const conflicts=arr(cloud.conflicts);
    if (conflicts.length || cloud.phase==='CONFLICT') return {label:'CONFLICT',tone:'block',title:'Cross-device conflict protected',meta:'Aurora stopped before overwriting departments changed independently on two devices.'};
    if (!cloud.signedIn) return {label:'SIGNED OUT',tone:'warn',title:'Aurora Cloud is signed out',meta:'Local Aurora remains available on this device.'};
    if (cloud.phase==='ERROR') return {label:'ERROR',tone:'block',title:'Aurora Cloud needs attention',meta:cloud.lastError || 'Cloud lifecycle reported an error.'};
    if (cloud.phase==='OFFLINE' || cloud.online===false) return {label:'OFFLINE',tone:'warn',title:'Device is offline',meta:'Cloud sync can resume when the device is online.'};
    if (!cloud.bootstrapped) return {label:'SETUP',tone:'warn',title:'Cloud device setup is incomplete',meta:cloud.cloudExists?'Cloud master exists; this device still needs a deliberate join action.':'No Aurora 2 cloud master has been confirmed.'};
    return {label:'CLOUD READY',tone:'good',title:'Aurora Cloud is connected',meta:`${cloud.autoSync?'Auto sync':'Manual sync'} • ${since(cloud.lastSyncAt)}`};
  }

  function renderCloud(cloud,shield) {
    const view=cloudView(cloud);
    badge('cloudBadge',view.label,view.tone);
    set('cloudKpiStatus',view.label);
    set('cloudKpiMeta',view.meta);
    set('heroCloud',view.label);
    set('cloudStatusTitle',view.title);
    set('cloudStatusMeta',view.meta);
    set('cloudDeviceDisplay',cloud?.deviceName || 'Aurora Device');
    set('cloudDeviceId',cloud?.deviceId ? `ID ${String(cloud.deviceId).slice(0,8)}…` : '—');
    set('cloudAccount',cloud?.user?.email || 'Not signed in');
    set('cloudAccountMeta',cloud?.signedIn ? 'Firebase authenticated' : 'Cloud session');
    set('cloudLastWriter',cloud?.cloudDeviceName || '—');
    set('cloudLastWriterMeta',cloud?.cloudSavedAt ? `${since(cloud.cloudSavedAt)} • revision ${cloud.cloudRevision || 0}` : 'No cloud save inspected');
    set('cloudRevision',cloud?.cloudExists ? `#${cloud.cloudRevision || 0}` : '—');
    set('cloudLastSync',since(cloud?.lastSyncAt));

    const protectedMode=Boolean(window.AuroraStage3GShield?.active);
    set('cloudWriteMode',protectedMode?'PROTECTED':'LIVE');
    set('cloudApplyMode',protectedMode?'PROTECTED':'LIVE');
    set('cloudWriteMeta',protectedMode?`${shield?.firestoreWriteBlocks || 0} blocked cloud write${Number(shield?.firestoreWriteBlocks||0)===1?'':'s'}`:'Cloud write path enabled');
    set('cloudApplyMeta',protectedMode?`${shield?.coreWriteBlocks || 0} blocked local appl${Number(shield?.coreWriteBlocks||0)===1?'y':'ies'}`:'Local apply path enabled');

    const conflicts=arr(cloud?.conflicts);
    const box=$('cloudConflictBox');
    if (box) box.hidden=!conflicts.length;
    if (conflicts.length) {
      set('cloudConflictMeta',`Protected departments: ${conflicts.map(x=>String(x).replace(/([A-Z])/g,' $1').trim()).join(', ')}. The conflict remains visible here, but repeat notification toasts are deduplicated.`);
    }

    const useCloud=$('cloudUseCloud');
    const useDevice=$('cloudUseDevice');
    const resolutionLocked=protectedMode || !conflicts.length;
    if (useCloud) { useCloud.disabled=resolutionLocked; useCloud.title=protectedMode?'Rebuild cloud shield is active.':''; }
    if (useDevice) { useDevice.disabled=resolutionLocked; useDevice.title=protectedMode?'Rebuild cloud shield is active.':''; }
  }

  function renderNotifications() {
    const info=safeNotificationStatus();
    const stage=window.AuroraStage3I || {};
    const loaded=Boolean(window.AuroraNotifications);
    const label=loaded?'STABLE':'WAITING';
    set('notificationStatus',label);
    set('notificationMeta',loaded?`${Number(info?.unread || 0)} unread • ${Number(info?.active || 0)} active`:'Notification engine loading');
    set('heroNotifications',label);
    return {info,stage,label};
  }

  async function run() {
    if (running) return;
    running=true;
    try {
      const core=window.Aurora2?.core;
      if (!core?.read) {
        set('overallStatus','WAITING'); set('overallNote','Stable Core is still loading.');
        return;
      }
      const state=core.read();
      const diagnostics=core.diagnostics?.() || {};
      const integrity=core.validate?.(state) || {ok:false,errors:[{message:'Core validation unavailable'}],warnings:[]};
      const sync=window.AuroraSyncManager?.status?.() || null;
      const cloud=safeCloudStatus();
      const shield=stage3gStatus();
      const notification=renderNotifications();
      const backend=await backendCheck();
      const canonical=state?.squad?.canonicalSync || {};
      const release=window.AuroraRelease || {};

      set('releaseName',release.release || diagnostics.release || 'Stable Core');
      set('releaseBuild',release.build ? `Build ${release.build}` : `Health ${BUILD}`);
      set('schemaVersion',`v${core.VERSION || state?.schemaVersion || '—'}`);
      set('backendStatus',backend.ok?'CONNECTED':'CHECK');
      set('backendMeta',backend.ok?'AuroraData 2 responded':backend.error);
      set('holdingsStatus',canonical.status || sync?.detail?.holdings?.status || (arr(state?.squad?.holdings).length?'LOCAL':'CHECK'));
      set('holdingsMeta',canonical.lastSyncAt?`Synced ${since(canonical.lastSyncAt)}`:`${arr(state?.squad?.holdings).length} Squad positions`);
      set('backupStatus',diagnostics.backupAvailable?'READY':'NONE');
      set('backupMeta',diagnostics.backupAt?`${since(diagnostics.backupAt)} • ${diagnostics.backupReason || 'backup'}`:'Create first backup');
      set('heroBackup',diagnostics.backupAvailable?'READY':'NONE');
      badge('recoveryBadge',diagnostics.backupAvailable?'PROTECTED':'BACKUP NEEDED',diagnostics.backupAvailable?'good':'warn');

      const integrityRows=[];
      integrityRows.push(healthRow(diagnostics.primaryReadable===false?'block':'good',diagnostics.primaryReadable===false?'Primary Aurora state is unreadable':'Primary Aurora state is readable',diagnostics.primaryReadable===false?'Recovery should use the last-good backup.':`${diagnostics.primaryBytes || 0} characters stored.`,'CORE'));
      arr(integrity.errors).forEach(item=>integrityRows.push(healthRow('block',item.code || 'Integrity error',item.message || 'State validation error','ERROR')));
      arr(integrity.warnings).forEach(item=>integrityRows.push(healthRow('warn',item.code || 'Integrity warning',item.message || 'Review recommended','WARN')));
      if (integrity.ok && !arr(integrity.errors).length && !arr(integrity.warnings).length) integrityRows.push(healthRow('good','Core integrity checks passed','No structural state problems were detected.','PASS'));
      const notificationWrites=Number(notification.stage?.allowedNotificationUpdates || 0);
      integrityRows.push(healthRow('good','Notification dedupe state can persist',`Notification-only updates allowed: ${notificationWrites}. Non-notification Stage 3I writes remain shielded.`,'NOTIFY'));
      if (window.AuroraStage3GShield?.active) integrityRows.push(healthRow('good','Cloud rebuild shield is active','Remote overwrite and local cloud apply remain protected while diagnostics still read the real cloud lifecycle.','SHIELD'));
      if ($('integrityList')) $('integrityList').innerHTML=integrityRows.join('');
      badge('integrityBadge',integrity.ok?(arr(integrity.warnings).length?'PASS + WARNINGS':'PASSED'):'FAILED',integrity.ok?(arr(integrity.warnings).length?'warn':'good'):'block');

      const syncRows=[];
      if (sync) {
        Object.entries(sync.detail || {}).filter(([key])=>key!=='updatedAt').forEach(([name,item])=>{
          const status=String(item?.status || 'CHECK').toUpperCase();
          const tone=status==='ERROR'?'block':status==='CONNECTED'?'good':'warn';
          syncRows.push(healthRow(tone,name.replaceAll('-',' ').toUpperCase(),item?.lastError || `Last success ${since(item?.lastSuccessAt)}`,status));
        });
      }
      if (!syncRows.length) syncRows.push(healthRow('warn','Sync Manager is loading','Run the check again in a moment.','WAIT'));
      if ($('syncList')) $('syncList').innerHTML=syncRows.join('');
      badge('syncBadge',sync?'MANAGED':'WAITING',sync?'good':'warn');

      renderCloud(cloud,shield);
      const conflicts=arr(cloud?.conflicts);
      const criticalOk=integrity.ok && diagnostics.primaryReadable!==false && backend.ok && !conflicts.length && cloud?.phase!=='ERROR';
      set('overallStatus',criticalOk?'HEALTHY':'ATTENTION');
      set('overallNote',criticalOk?'Core, backend, notifications and recovery protections are operating.':'One or more checks need review below. A cloud conflict is kept visible here instead of repeatedly popping up.');
      const overall=$('overallStatus'); if(overall) overall.style.color=criticalOk?'#c9f9dc':'#fde68a';
      set('lastChecked',new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));

      const support={
        build:BUILD,
        release:{release:release.release || diagnostics.release || null,build:release.build || null},
        core:diagnostics,
        integrity,
        sync,
        cloud:cloud ? {
          phase:cloud.phase,signedIn:cloud.signedIn,online:cloud.online,bootstrapped:cloud.bootstrapped,
          conflicts:arr(cloud.conflicts),deviceName:cloud.deviceName,cloudDeviceName:cloud.cloudDeviceName,
          cloudRevision:cloud.cloudRevision,lastSyncAt:cloud.lastSyncAt,lastUploadAt:cloud.lastUploadAt,lastDownloadAt:cloud.lastDownloadAt
        } : null,
        cloudShield:shield,
        notifications:{status:notification.info,stage:notification.stage},
        state:{
          connection:state?.connection,
          squad:{positions:arr(state?.squad?.holdings).length,updatedAt:state?.squad?.updatedAt,canonicalSync:canonical},
          incomeBackend:state?.income?.backend,
          registrationBackend:state?.registration?.backend,
          mission:state?.mission?{id:state.mission.id,status:state.mission.status,approvedBudget:state.mission.approvedBudget}:null,
          route:state?.transfer?.route?{id:state.transfer.route.id,status:state.transfer.route.status,allocated:state.transfer.route.allocated,remaining:state.transfer.route.remaining}:null
        }
      };
      if ($('supportSnapshot')) $('supportSnapshot').textContent=JSON.stringify(support,null,2);
    } finally {
      running=false;
    }
  }

  async function syncNow() {
    try {
      toast('Running managed sync diagnostics…');
      await window.AuroraSyncManager?.runAll?.('system-health-restored');
      await run();
      toast('Sync diagnostics complete.');
    } catch (error) {
      toast(String(error?.message || error));
    }
  }
  async function useCloudCopy() {
    const cloud=window.AuroraCloudSync;
    if (!cloud?.useCloudCopy || window.AuroraStage3GShield?.active) return;
    if (!confirm('Use the CLOUD copy for this protected conflict? This device should be backed up before the cloud state is applied.')) return;
    try { await cloud.useCloudCopy(); toast('Conflict resolved using cloud copy.'); await run(); } catch(error){ toast(String(error?.message || error)); }
  }
  async function useDeviceCopy() {
    const cloud=window.AuroraCloudSync;
    const fn=cloud?.useDeviceCopy || cloud?.replaceCloudWithDevice;
    if (!fn || window.AuroraStage3GShield?.active) return;
    if (!confirm('Replace the CLOUD copy with this device for the protected conflict?')) return;
    try { await fn.call(cloud); toast('Conflict resolved using this device.'); await run(); } catch(error){ toast(String(error?.message || error)); }
  }

  function bind() {
    $('runCheck')?.addEventListener('click',()=>run());
    $('syncNow')?.addEventListener('click',syncNow);
    $('backupNow')?.addEventListener('click',()=>{
      const ok=window.Aurora2?.core?.backup?.('manual-system-health-restored');
      toast(ok?'Last-good backup created.':'Backup could not be created.'); run();
    });
    $('restoreBackup')?.addEventListener('click',()=>{
      if (!confirm('Restore the last-good Aurora state backup? This replaces the current browser working state.')) return;
      try { window.Aurora2?.core?.restoreBackup?.(); toast('Backup restored. Reloading Aurora…'); setTimeout(()=>location.reload(),600); }
      catch(error){ toast(String(error?.message || error)); }
    });
    $('cloudUseCloud')?.addEventListener('click',useCloudCopy);
    $('cloudUseDevice')?.addEventListener('click',useDeviceCopy);
    window.addEventListener('aurora2:state',()=>setTimeout(run,20));
    window.addEventListener('aurora:stage3i-notifications',()=>setTimeout(run,20));
    window.addEventListener('aurora:stage3g-cloud-lifecycle',()=>setTimeout(run,20));
  }

  async function start() {
    bind();
    let tries=0;
    while (!window.Aurora2?.core?.read && tries<160) { await new Promise(resolve=>setTimeout(resolve,50)); tries+=1; }
    await run();
    setInterval(()=>{ if(document.visibilityState==='visible') run(); },60000);
    setTimeout(run,700); setTimeout(run,1800);
  }

  window.AuroraSystemHealthRestored={build:BUILD,run};
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
