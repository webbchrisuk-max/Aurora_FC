(() => {
  'use strict';

  const BUILD = '20260826-clean-house-baseline-1';
  const BASELINE_KEY = 'aurora-clean:house-baseline:20260826-v1';
  const ROOMS = ['Games Room','Living Room','Hallway','Kitchen','Whole House'];

  function entry(id,name,room,estimated,actual,status){
    return {
      id,
      name,
      room,
      category:'Renovation',
      estimated:Number(estimated),
      actual:Number(actual),
      due:'',
      status,
      paidDate:'',
      notes:'Clean rebuild House Fund baseline · 26 Aug 2026'
    };
  }

  const ENTRIES = [
    entry('HOUSE-GAMES-HIST','Games Room completed spend','Games Room',2302.77,2157.85,'historical'),

    entry('HOUSE-LIVING-HIST','Living Room completed spend','Living Room',664.89,654.89,'historical'),
    entry('HOUSE-LIVING-RES','Living Room remaining works','Living Room',4300.00,0,'reserved'),

    entry('HOUSE-HALL-HIST','Hallway completed spend','Hallway',194.00,194.00,'historical'),
    entry('HOUSE-HALL-RES','Hallway remaining works','Hallway',2400.00,0,'reserved'),

    entry('HOUSE-KITCHEN-HIST','Kitchen completed spend','Kitchen',95.00,95.00,'historical'),
    entry('HOUSE-KITCHEN-RES','Kitchen remaining works','Kitchen',5120.00,0,'reserved'),

    entry('HOUSE-WHOLE-HIST','Whole House completed spend','Whole House',260.00,241.73,'historical'),
    entry('HOUSE-WHOLE-RES','Whole House remaining works','Whole House',5100.00,0,'reserved')
  ];

  function apply(){
    const A = window.AuroraClean;
    if(!A?.readState || !A?.updateState) return false;

    try {
      if(localStorage.getItem(BASELINE_KEY) === 'done') return true;
    } catch(_) {}

    A.updateState(state => {
      state.finance = state.finance || {};
      state.finance.pots = Array.isArray(state.finance.pots) ? state.finance.pots : [];

      state.finance.houseProject = {
        target:20436.66,
        openingHistoricalSpend:153.98,
        rooms:[...ROOMS],
        entries:ENTRIES.map(row => ({...row})),
        migrationDone:true,
        migratedAt:new Date().toISOString(),
        baselineBuild:BUILD,
        baselineAppliedAt:new Date().toISOString()
      };

      let pot = state.finance.pots.find(p => String(p?.id || '') === 'house_fund' || String(p?.name || '').trim().toLowerCase().includes('house'));
      if(!pot){
        pot = {id:'house_fund',name:'House Fund'};
        state.finance.pots.push(pot);
      }
      Object.assign(pot, {
        id:'house_fund',
        name:'House Fund',
        balance:18771.14,
        target:20436.66,
        spent:3497.45,
        goalMode:'funded-progress',
        deadline:'',
        fundingOverride:0,
        priority:2,
        archived:false,
        note:'Renovation and home projects'
      });
    });

    try { localStorage.setItem(BASELINE_KEY,'done'); } catch(_) {}
    window.dispatchEvent(new CustomEvent('aurora-clean:house-baseline',{detail:{build:BUILD}}));
    return true;
  }

  function boot(){
    if(apply()) return;
    let tries=0;
    const timer=setInterval(() => {
      tries += 1;
      if(apply() || tries > 200) clearInterval(timer);
    },25);
  }

  window.AuroraCleanHouseBaseline = Object.freeze({build:BUILD,apply});
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
