(function(w){
  'use strict';
  const KEY='aurora2:state:v1';
  const VERSION=11;
  const BACKUP_KEY='aurora2:state:backup:lastgood';
  const BACKUP_META_KEY='aurora2:state:backup:meta';
  const BACKUP_INTERVAL_MS=5*60*1000;
  const now=()=>new Date().toISOString();

  const defaultState=()=>({
    schemaVersion:VERSION,
    updatedAt:now(),
    connection:{mode:'foundation',status:'NOT_CONNECTED'},
    portfolio:{
      teamValue:null,annualIncome:null,monthlyIncome:null,squadSize:null,
      bestDividendPlayer:null,topAuroraPlayer:null
    },
    income:{
      version:1,
      source:'SQUAD_CANONICAL',
      nextDividend:null,
      settings:{monthlyTarget:0,horizonMonths:12},
      calendar:[],
      history:[],
      backend:{status:'LOCAL',lastSyncAt:null,lastError:null},
      lastCalculatedAt:null,
      updatedAt:null
    },
    decision:{
      title:'Aurora 2.0 foundation ready',
      note:'No investment decision engine is connected yet.',
      ticker:null,confidence:null
    },
    finance:{
      plan:{
        paydayDate:'',openingCash:0,expectedWages:0,wagesReceived:0,netPay:0,
        wageDifference:0,extraCash:0,billsDue:0,potsDue:0,otherPlanned:0,
        protectedCash:0,releaseAmount:0
      },
      pots:[],
      bills:[],
      payments:[],
      fundingPolicy:{
        goalPotBudget:0,
        extraPotBudget:0,
        engineVersion:3,
        strategy:'priority',
        source:'AURORA2_WAGE_ROUTING',
        legacyImported:false,
        lastCalculatedAt:null,
        lastPlan:null
      },
      houseProject:{
        version:1,
        target:0,
        openingHistoricalSpend:0,
        rooms:['Games Room','Living Room','Hallway','Kitchen','Whole House'],
        entries:[],
        actions:[],
        migrated:false,
        migration:null,
        updatedAt:null
      },
      lastCalculatedAt:null,
      lastReleasedAt:null
    },
    scouting:{
      version:1,
      status:'SCOUTING_REVIEW',
      strategy:'sustainable',
      targets:[],
      replacementBasket:[],
      decisionHistory:[],
      importedFromLegacy:false,
      source:'AURORA2_SCOUTING',
      updatedAt:null
    },
    transfer:{
      version:1,
      settings:{
        strategy:'sustainable',
        brokerScope:'both',
        minAllocation:250,
        increment:25
      },
      route:null,
      registrationDrafts:[],
      completedMissions:[],
      offers:[],
      migration:null,
      updatedAt:null
    },
    registration:{
      version:1,
      backend:{
        spreadsheetId:'1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA',
        status:'NOT_CONNECTED',
        lastHealthAt:null,
        lastError:null
      },
      receipts:[],
      updatedAt:null
    },
    squad:{
      version:1,
      holdings:[],
      migration:null,
      source:'AURORA2',
      updatedAt:null
    },
    platform:{
      version:1,
      release:'AURORA2_STABLE_CORE_V1',
      migratedFrom:null,
      lastMigrationAt:null,
      recoveredFromBackupAt:null
    },
    mission:null,
    notifications:{
      version:1,
      records:[],
      marketState:{},
      healthState:{},
      updatedAt:null
    },
    alerts:[]
  });

  function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function safeParse(v){try{return JSON.parse(v)}catch(_){return null}}
  function normalizePot(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled pot'),
      balance:Math.max(0,Number(r.balance)||0),
      target:Math.max(0,Number(r.target)||0),
      fundingPerPayday:Math.max(0,Number(r.fundingPerPayday)||0),
      fundingOverride:Math.max(0,Number(r.fundingOverride)||0),
      fundingReason:String(r.fundingReason||''),
      fundingRequired:Math.max(0,Number(r.fundingRequired)||0),
      priority:[1,2,3].includes(Number(r.priority))?Number(r.priority):2,
      goalMode:r.goalMode==='funded-progress'?'funded-progress':'balance',
      spent:Math.max(0,Number(r.spent)||0),
      deadline:String(r.deadline||r.completeBy||r.targetDate||''),
      note:String(r.note||''),
      archived:Boolean(r.archived),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeBill(b){
    const r=object(b);
    const allowed=['one-off','weekly','4-weeks','5-weeks','monthly','yearly'];
    const frequency=allowed.includes(r.frequency)?r.frequency:'one-off';
    const allowedTypes=['fixed_monthly','rolling_monthly','recurring_yearly','one_off'];
    const inferredType=frequency==='yearly'?'recurring_yearly'
      :frequency==='monthly'?(r.due?'fixed_monthly':'rolling_monthly')
      :'one_off';
    const commitmentType=allowedTypes.includes(r.commitmentType)?r.commitmentType:inferredType;
    const rollingMonth=/^\d{4}-\d{2}$/.test(String(r.occurrenceMonth||''))
      ?String(r.occurrenceMonth)
      :new Date().toISOString().slice(0,7);
    return {
      id:String(r.id||''),
      name:String(r.name||'Untitled bill'),
      amount:Math.max(0,Number(r.amount)||0),
      // Rolling commitments deliberately discard legacy placeholder dates.
      due:commitmentType==='rolling_monthly'?'':String(r.due||''),
      frequency:commitmentType==='rolling_monthly'||commitmentType==='fixed_monthly'?'monthly'
        :commitmentType==='recurring_yearly'?'yearly'
        :commitmentType==='one_off'?'one-off':frequency,
      commitmentType,
      recurrence:commitmentType==='one_off'?'none':commitmentType==='recurring_yearly'?'yearly':'monthly',
      occurrenceMonth:commitmentType==='rolling_monthly'?rollingMonth:'',
      fundingSource:String(r.fundingSource||'Current Account'),
      category:String(r.category||'Other'),
      included:r.included!==false,
      paid:Boolean(r.paid),
      archived:Boolean(r.archived),
      actualPaid:Math.max(0,Number(r.actualPaid)||0),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizePayment(p){
    const r=object(p);
    return {
      id:String(r.id||''),
      billId:String(r.billId||''),
      billName:String(r.billName||'Payment'),
      amount:Math.max(0,Number(r.amount)||0),
      fundingSource:String(r.fundingSource||'Current Account'),
      paidAt:r.paidAt||now(),
      dueAtPayment:String(r.dueAtPayment||''),
      commitmentType:String(r.commitmentType||''),
      occurrenceKey:String(r.occurrenceKey||''),
      reversed:Boolean(r.reversed),
      reversedAt:r.reversedAt||null,
      beforeBill:object(r.beforeBill),
      beforePot:r.beforePot?object(r.beforePot):null
    };
  }

  function normalizeHouseEntry(e){
    const r=object(e), allowed=['reserved','paid','historical'];
    const status=allowed.includes(r.status)?r.status:'reserved';
    const estimated=Math.max(0,Number(r.estimated??r.amount)||0);
    const actual=Math.max(0,Number(r.actual??((status==='paid'||status==='historical')?r.amount:0))||0);
    return {
      id:String(r.id||''),
      name:String(r.name||'House payment'),
      estimated,
      actual,
      due:String(r.due||''),
      room:String(r.room||'Whole House'),
      category:String(r.category||'House project'),
      status,
      deducted:Boolean(r.deducted),
      paidDate:String(r.paidDate||''),
      notes:String(r.notes||''),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeHouseAction(a){
    const r=object(a);
    return {
      id:String(r.id||''),
      type:String(r.type||'change'),
      entryId:String(r.entryId||''),
      label:String(r.label||'House change'),
      amount:Math.max(0,Number(r.amount)||0),
      at:r.at||now(),
      reversed:Boolean(r.reversed),
      reversedAt:r.reversedAt||null,
      beforeEntry:r.beforeEntry?object(r.beforeEntry):null,
      beforePot:r.beforePot?object(r.beforePot):null
    };
  }

  function normalizeScoutingTarget(t){
    const r=object(t);
    const allowedStatus=['pass','caution','block'];
    const allowedRecommendation=['STRONG BUY','BUY','WATCH','CAUTION','BLOCK'];
    const account=String(r.preferredAccount||r.account||r.platform||r.broker||'CHECK');
    return {
      id:String(r.id||''),
      // Global Scouting identities and approval evidence are part of the
      // canonical Transfer handoff.  Do not reduce these to the legacy id or
      // ticker: the same ticker can legitimately exist on two exchanges.
      securityId:String(r.securityId||r.networkSecurityId||''),
      exchange:String(r.exchange||r.market||'').toUpperCase(),
      ticker:String(r.ticker||r.symbol||'').replace(/\..*$/,'').toUpperCase(),
      name:String(r.name||r.company||r.companyName||r.ticker||'Target'),
      country:String(r.country||r.region||''),
      currency:String(r.currency||r.quoteCurrency||'').toUpperCase(),
      assetType:String(r.assetType||r.assetClass||r.type||''),
      preferredAccount:account,
      sector:String(r.sector||''),
      status:allowedStatus.includes(String(r.status||'').toLowerCase())?String(r.status).toLowerCase():'caution',
      recommendation:allowedRecommendation.includes(String(r.recommendation||'').toUpperCase())
        ? String(r.recommendation).toUpperCase()
        : 'WATCH',
      reason:String(r.reason||r.note||''),
      eligibilityReasons:Array.isArray(r.eligibilityReasons)?r.eligibilityReasons.map(x=>String(x)):[],
      eligibilityStatus:String(r.eligibilityStatus||r.transferEligibilityStatus||''),
      brokerEligibility:r.brokerEligibility??null,
      transferPermitted:r.transferPermitted!==false,
      approvedForTransfer:r.approvedForTransfer===true,
      approvalBatchId:r.approvalBatchId==null?null:String(r.approvalBatchId),
      approvedAt:r.approvedAt||null,
      rank:Math.max(0,Number(r.rank)||0),
      maximumRank:Math.max(0,Number(r.maximumRank)||0),
      yieldPct:Math.max(0,Number(r.yieldPct)||0),
      livePriceGbp:Math.max(0,Number(r.livePriceGbp||r.livePrice||r.price)||0),
      sustainableScore:Math.max(0,Math.min(100,Number(r.sustainableScore)||0)),
      maximumScore:Math.max(0,Math.min(100,Number(r.maximumScore)||0)),
      confidence:Math.max(0,Math.min(100,Number(r.confidence||r.dataQuality)||0)),
      dataQuality:Math.max(0,Math.min(100,Number(r.dataQuality||r.confidence)||0)),
      dividendSafety:Math.max(0,Math.min(100,Number(r.dividendSafety)||0)),
      incomeScore:Math.max(0,Math.min(100,Number(r.incomeScore)||0)),
      valuationScore:Math.max(0,Math.min(100,Number(r.valuationScore)||0)),
      portfolioFit:Math.max(0,Math.min(100,Number(r.portfolioFit)||0)),
      dividendGrowth:Math.max(0,Math.min(100,Number(r.dividendGrowth)||0)),
      businessQuality:Math.max(0,Math.min(100,Number(r.businessQuality)||0)),
      dividendStatus:String(r.dividendStatus||''),
      payoutRisk:String(r.payoutRisk||''),
      source:String(r.source||'SCOUTING'),
      sourceUpdatedAt:r.sourceUpdatedAt||null,
      lastAssessedAt:r.lastAssessedAt||null,
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeReplacementBasket(rows,targets=[]){
    const targetRows=Array.isArray(targets)?targets:[];
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).map(item=>{
      const raw=typeof item==='string'?{securityId:item}:object(item);
      const explicit=String(raw.securityId||raw.networkSecurityId||'').trim();
      const exchange=String(raw.exchange||raw.market||'').trim().toUpperCase();
      const ticker=String(raw.ticker||raw.symbol||'').replace(/\..*$/,'').trim().toUpperCase();
      const matched=targetRows.find(target=>
        (explicit&&String(target.securityId||'')===explicit)||
        (!explicit&&exchange&&ticker&&String(target.exchange||'')===exchange&&String(target.ticker||'')===ticker)
      );
      const securityId=explicit||String(matched?.securityId||'')||(exchange&&ticker?`${exchange}:${ticker}`:'');
      return {
        securityId,
        exchange:String(matched?.exchange||exchange||'').toUpperCase(),
        ticker:String(matched?.ticker||ticker||'').toUpperCase()
      };
    }).filter(identity=>identity.securityId&&!seen.has(identity.securityId)&&seen.add(identity.securityId));
  }
  function normalizeTransferAllocation(a){
    const r=object(a);
    const legId=String(r.legId||r.leg_id||r.id||'');
    return {
      id:String(r.id||legId),
      legId,
      leg_id:legId,
      transactionId:String(r.transactionId||''),
      targetId:String(r.targetId||''),
      securityId:String(r.securityId||''),
      exchange:String(r.exchange||'').toUpperCase(),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||'Target'),
      account:String(r.account||r.preferredAccount||'CHECK'),
      amount:Math.max(0,Number(r.amount)||0),
      yieldPct:Math.max(0,Number(r.yieldPct)||0),
      expectedAnnualIncome:Math.max(0,Number(r.expectedAnnualIncome)||0),
      estimatedPriceGbp:Math.max(0,Number(r.estimatedPriceGbp)||0),
      estimatedShares:r.estimatedShares==null?null:Math.max(0,Math.floor(Number(r.estimatedShares)||0)),
      quoteUpdatedAt:r.quoteUpdatedAt||null,
      score:Math.max(0,Number(r.score)||0),
      reason:String(r.reason||''),
      status:String(r.status||'PLANNED')
    };
  }
  function normalizeTransferRoute(route){
    if(!route||typeof route!=='object')return null;
    const r=object(route);
    return {
      id:String(r.id||''),
      missionId:String(r.missionId||''),
      financeBudget:Math.max(0,Number(r.financeBudget)||0),
      strategy:['sustainable','maximum'].includes(r.strategy)?r.strategy:'sustainable',
      brokerScope:['both','IG','T212'].includes(r.brokerScope)?r.brokerScope:'both',
      minAllocation:Math.max(25,Number(r.minAllocation)||250),
      increment:Math.max(1,Number(r.increment)||25),
      allocations:Array.isArray(r.allocations)?r.allocations.map(normalizeTransferAllocation):[],
      allocated:Math.max(0,Number(r.allocated)||0),
      remaining:Math.max(0,Number(r.remaining)||0),
      expectedAnnualIncome:Math.max(0,Number(r.expectedAnnualIncome)||0),
      income:Math.max(0,Number(r.income??r.expectedAnnualIncome)||0),
      baselineAnnualIncome:Math.max(0,Number(r.baselineAnnualIncome)||0),
      baselinePortfolioValue:Math.max(0,Number(r.baselinePortfolioValue)||0),
      baselineHoldings:Array.isArray(r.baselineHoldings)?r.baselineHoldings.map(h=>({
        ticker:String(h?.ticker||'').toUpperCase(),account:String(h?.account||''),shares:Math.max(0,Number(h?.shares)||0),
        livePriceGbp:Math.max(0,Number(h?.livePriceGbp)||0),marketValueGbp:Math.max(0,Number(h?.marketValueGbp)||0)
      })):[],
      status:String(r.status||'DRAFT'),
      locked:Boolean(r.locked),
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }
  function normalizeRegistrationDraft(d){
    const r=object(d);
    return {
      id:String(r.id||''),
      routeId:String(r.routeId||''),
      missionId:String(r.missionId||''),
      allocationId:String(r.allocationId||''),
      legId:String(r.legId||r.allocationId||''),
      transactionId:String(r.transactionId||''),
      clientRequestId:String(r.clientRequestId||''),
      backendReceiptId:String(r.backendReceiptId||''),
      tradeDate:String(r.tradeDate||''),
      account:String(r.account||''),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||''),
      side:String(r.side||'BUY').toUpperCase(),
      shares:Math.max(0,Number(r.shares)||0),
      priceInput:Math.max(0,Number(r.priceInput)||0),
      priceUnit:['GBP','PENCE'].includes(r.priceUnit)?r.priceUnit:'GBP',
      currency:String(r.currency||'GBP').toUpperCase(),
      fxRateToGbp:Math.max(0,Number(r.fxRateToGbp)||0),
      grossCostNative:Math.max(0,Number(r.grossCostNative)||0),
      feesNative:Math.max(0,Number(r.feesNative)||0),
      totalCostNative:Math.max(0,Number(r.totalCostNative)||0),
      totalCostGbp:Math.max(0,Number(r.totalCostGbp)||0),
      plannedAmount:Math.max(0,Number(r.plannedAmount)||0),
      differenceGbp:Number(r.differenceGbp)||0,
      previousShares:Math.max(0,Number(r.previousShares)||0),
      newShares:Math.max(0,Number(r.newShares)||0),
      previousBookCostGbp:Math.max(0,Number(r.previousBookCostGbp)||0),
      newBookCostGbp:Math.max(0,Number(r.newBookCostGbp)||0),
      previousAvgCostGbp:Math.max(0,Number(r.previousAvgCostGbp)||0),
      newAvgCostGbp:Math.max(0,Number(r.newAvgCostGbp)||0),
      expectedAnnualIncomeGbp:Math.max(0,Number(r.expectedAnnualIncomeGbp)||0),
      status:String(r.status||'DRAFT'),
      error:String(r.error||''),
      confirmedAt:r.confirmedAt||null,
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }

  function normalizeRegistrationReceipt(r){
    const x=object(r);
    return {
      id:String(x.id||x.backendReceiptId||''),
      backendReceiptId:String(x.backendReceiptId||x.id||''),
      transactionId:String(x.transactionId||''),
      routeId:String(x.routeId||''),
      missionId:String(x.missionId||''),
      allocationId:String(x.allocationId||''),
      legId:String(x.legId||x.allocationId||''),
      account:String(x.account||''),
      ticker:String(x.ticker||'').toUpperCase(),
      totalCostGbp:Math.max(0,Number(x.totalCostGbp)||0),
      confirmedAt:x.confirmedAt||now(),
      duplicate:Boolean(x.duplicate),
      source:String(x.source||'AURORADATA2')
    };
  }
  function normalizeIncomeEvent(e){
    const r=object(e);
    const allowed=['FORECAST','CONFIRMED','PAID','CANCELLED','ARCHIVED'];
    const status=allowed.includes(String(r.status||'').toUpperCase())?String(r.status).toUpperCase():'FORECAST';
    return {
      id:String(r.id||''),
      ticker:String(r.ticker||'').replace(/\..*$/,'').toUpperCase(),
      name:String(r.name||r.ticker||'Dividend'),
      account:String(r.account||'CHECK'),
      exDate:String(r.exDate||r.ex_date||''),
      payDate:String(r.payDate||r.pay_date||''),
      dividendPerShareGbp:Math.max(0,Number(r.dividendPerShareGbp??r.dividend_per_share_gbp)||0),
      expectedAmountGbp:Math.max(0,Number(r.expectedAmountGbp??r.expected_amount_gbp)||0),
      actualAmountGbp:Math.max(0,Number(r.actualAmountGbp??r.actual_amount_gbp)||0),
      status,
      notes:String(r.notes||''),
      source:String(r.source||'AURORA2_INCOME'),
      backendId:String(r.backendId||r.backend_id||''),
      createdAt:r.createdAt||r.created_at||now(),
      updatedAt:r.updatedAt||r.updated_at||now()
    };
  }
  function normalizeIncomeHistory(h){
    const r=object(h);
    return {
      id:String(r.id||''),
      annualIncome:Math.max(0,Number(r.annualIncome)||0),
      monthlyIncome:Math.max(0,Number(r.monthlyIncome)||0),
      at:r.at||now(),
      reason:String(r.reason||'Income recalculation')
    };
  }

  function normalizeNotifications(rows){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(record=>{
      const key=String(record?.key||record?.id||'').trim();
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    }).slice(0,500);
  }

  function normalizeHolding(h){
    const r=object(h);
    const allowedStatus=['ACTIVE','LOCKED','SOLD','ARCHIVED'];
    const shares=Math.max(0,Number(r.shares)||0);
    const bookCostGbp=Math.max(0,Number(r.bookCostGbp)||0);
    const avgCostGbp=shares>0
      ? Math.max(0,Number(r.avgCostGbp)||(bookCostGbp/shares)||0)
      : Math.max(0,Number(r.avgCostGbp)||0);
    const marketValueGbp=Math.max(0,Number(r.marketValueGbp)||0);
    const livePriceGbp=shares>0
      ? Math.max(0,Number(r.livePriceGbp)||(marketValueGbp/shares)||0)
      : Math.max(0,Number(r.livePriceGbp)||0);
    const annualIncomeGbp=Math.max(0,Number(r.annualIncomeGbp)||0);
    const annualDpsGbp=shares>0
      ? Math.max(0,Number(r.annualDpsGbp)||(annualIncomeGbp/shares)||0)
      : Math.max(0,Number(r.annualDpsGbp)||0);
    return {
      id:String(r.id||''),
      ticker:String(r.ticker||'').toUpperCase(),
      name:String(r.name||r.ticker||'Holding'),
      account:String(r.account||'ACCOUNT REVIEW'),
      shares,
      bookCostGbp,
      avgCostGbp,
      livePriceGbp,
      dayChangePct:Number(r.dayChangePct??r.changePct??r.priceChangePct)||0,
      priceTargetGbp:Math.max(0,Number(r.priceTargetGbp??r.targetPriceGbp)||0),
      chairmanTargetGbp:Math.max(0,Number(r.chairmanTargetGbp)||0),
      marketValueGbp:marketValueGbp||(shares*livePriceGbp),
      profitLossGbp:Number.isFinite(Number(r.profitLossGbp))
        ? Number(r.profitLossGbp)
        : ((marketValueGbp||(shares*livePriceGbp))-bookCostGbp),
      annualDpsGbp,
      annualIncomeGbp:annualIncomeGbp||(shares*annualDpsGbp),
      sector:String(r.sector||''),
      role:String(r.role||''),
      status:allowedStatus.includes(String(r.status||'').toUpperCase())
        ? String(r.status).toUpperCase()
        : (shares>0?'ACTIVE':'ARCHIVED'),
      locked:Boolean(r.locked),
      lockReason:String(r.lockReason||''),
      source:String(r.source||'AURORA2'),
      sourceKey:String(r.sourceKey||''),
      sourceUpdatedAt:r.sourceUpdatedAt||null,
      createdAt:r.createdAt||now(),
      updatedAt:r.updatedAt||now()
    };
  }

  function normalize(raw){
    const d=defaultState(), r=object(raw), rf=object(r.finance);
    return {
      ...d,...r,
      schemaVersion:VERSION,
      connection:{...d.connection,...object(r.connection)},
      portfolio:{...d.portfolio,...object(r.portfolio)},
      platform:{...d.platform,...object(r.platform),version:1,release:'AURORA2_STABLE_CORE_V1'},
      income:{
        ...d.income,
        ...object(r.income),
        version:1,
        settings:{...d.income.settings,...object(r.income?.settings),monthlyTarget:Math.max(0,Number(r.income?.settings?.monthlyTarget)||0),horizonMonths:Math.max(3,Math.min(24,Number(r.income?.settings?.horizonMonths)||12))},
        calendar:Array.isArray(r.income?.calendar)?r.income.calendar.map(normalizeIncomeEvent):[],
        history:Array.isArray(r.income?.history)?r.income.history.map(normalizeIncomeHistory):[],
        backend:{...d.income.backend,...object(r.income?.backend)}
      },
      decision:{...d.decision,...object(r.decision)},
      scouting:{
        ...d.scouting,
        ...object(r.scouting),
        version:1,
        strategy:['sustainable','maximum'].includes(r.scouting?.strategy)?r.scouting.strategy:'sustainable',
        targets:Array.isArray(r.scouting?.targets)?r.scouting.targets.map(normalizeScoutingTarget):[],
        replacementBasket:normalizeReplacementBasket(
          r.scouting?.replacementBasket,
          Array.isArray(r.scouting?.targets)?r.scouting.targets.map(normalizeScoutingTarget):[]
        ),
        decisionHistory:Array.isArray(r.scouting?.decisionHistory)?r.scouting.decisionHistory:[]
      },
      transfer:{
        ...d.transfer,
        ...object(r.transfer),
        settings:{
          ...d.transfer.settings,
          ...object(r.transfer?.settings),
          strategy:['sustainable','maximum'].includes(r.transfer?.settings?.strategy)?r.transfer.settings.strategy:'sustainable',
          brokerScope:['both','IG','T212'].includes(r.transfer?.settings?.brokerScope)?r.transfer.settings.brokerScope:'both',
          minAllocation:Math.max(25,Number(r.transfer?.settings?.minAllocation)||250),
          increment:Math.max(1,Number(r.transfer?.settings?.increment)||25)
        },
        route:normalizeTransferRoute(r.transfer?.route),
        registrationDrafts:Array.isArray(r.transfer?.registrationDrafts)?r.transfer.registrationDrafts.map(normalizeRegistrationDraft):[],
        completedMissions:Array.isArray(r.transfer?.completedMissions)?r.transfer.completedMissions:[],
        offers:Array.isArray(r.transfer?.offers)?r.transfer.offers:[]
      },
      registration:{
        ...d.registration,
        ...object(r.registration),
        backend:{...d.registration.backend,...object(r.registration?.backend),spreadsheetId:'1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA'},
        receipts:Array.isArray(r.registration?.receipts)?r.registration.receipts.map(normalizeRegistrationReceipt):[]
      },
      squad:{
        ...d.squad,
        ...object(r.squad),
        version:1,
        holdings:Array.isArray(r.squad?.holdings)?r.squad.holdings.map(normalizeHolding):[]
      },
      notifications:{
        ...d.notifications,
        ...object(r.notifications),
        version:1,
        records:normalizeNotifications(r.notifications?.records),
        marketState:object(r.notifications?.marketState),
        healthState:object(r.notifications?.healthState)
      },
      finance:{
        ...d.finance,...rf,
        plan:{...d.finance.plan,...object(rf.plan)},
        pots:Array.isArray(rf.pots)?rf.pots.map(normalizePot):[],
        bills:Array.isArray(rf.bills)?rf.bills.map(normalizeBill):[],
        payments:Array.isArray(rf.payments)?rf.payments.map(normalizePayment):[],
        fundingPolicy:{
          ...d.finance.fundingPolicy,
          ...object(rf.fundingPolicy),
          goalPotBudget:Math.max(0,Number(rf.fundingPolicy?.goalPotBudget)||0),
          strategy:['priority','balanced','critical'].includes(rf.fundingPolicy?.strategy)?rf.fundingPolicy.strategy:'priority'
        },
        houseProject:{
          ...d.finance.houseProject,
          ...object(rf.houseProject),
          version:1,
          target:Math.max(0,Number(rf.houseProject?.target)||0),
          openingHistoricalSpend:Math.max(0,Number(rf.houseProject?.openingHistoricalSpend)||0),
          rooms:Array.isArray(rf.houseProject?.rooms)&&rf.houseProject.rooms.length
            ? [...new Set(rf.houseProject.rooms.map(x=>String(x).trim()).filter(Boolean))]
            : [...d.finance.houseProject.rooms],
          entries:Array.isArray(rf.houseProject?.entries)?rf.houseProject.entries.map(normalizeHouseEntry):[],
          actions:Array.isArray(rf.houseProject?.actions)?rf.houseProject.actions.map(normalizeHouseAction):[]
        }
      },
      alerts:Array.isArray(r.alerts)?r.alerts:[]
    };
  }

  function migrate(raw){
    const source=object(raw);
    const from=Math.max(0,Number(source.schemaVersion)||0);
    let next={...source};

    if(from<VERSION){
      next={
        ...next,
        platform:{
          ...object(next.platform),
          version:1,
          release:'AURORA2_STABLE_CORE_V1',
          migratedFrom:from||null,
          lastMigrationAt:now(),
          recoveredFromBackupAt:object(next.platform).recoveredFromBackupAt||null
        }
      };
    }
    return next;
  }

  function backupMeta(){return object(safeParse(localStorage.getItem(BACKUP_META_KEY)))}

  function backupRaw(rawText,reason='periodic',force=false){
    if(!rawText)return false;
    const parsed=safeParse(rawText);
    if(!parsed||typeof parsed!=='object')return false;

    const meta=backupMeta();
    const last=new Date(meta.at||0).getTime();
    if(!force&&Number.isFinite(last)&&Date.now()-last<BACKUP_INTERVAL_MS)return false;

    try{
      localStorage.setItem(BACKUP_KEY,rawText);
      localStorage.setItem(BACKUP_META_KEY,JSON.stringify({
        at:now(),reason,schemaVersion:Number(parsed.schemaVersion)||null
      }));
      return true;
    }catch(err){
      console.warn('Aurora state backup failed:',err);
      return false;
    }
  }

  function backup(reason='manual'){
    return backupRaw(localStorage.getItem(KEY),reason,true);
  }

  function validate(input){
    const state=normalize(input);
    const errors=[],warnings=[];
    const push=(list,code,message,detail=null)=>list.push({code,message,detail});

    if(Number(state.schemaVersion)!==VERSION){
      push(errors,'SCHEMA_VERSION',`Expected schema ${VERSION}, found ${state.schemaVersion}.`);
    }

    const holdings=Array.isArray(state.squad?.holdings)?state.squad.holdings:[];
    const activeKeys=new Set();
    holdings.forEach(h=>{
      const key=`${String(h.account||'').toUpperCase()}|${String(h.ticker||'').toUpperCase()}`;
      if(['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&Number(h.shares)>0){
        if(activeKeys.has(key))push(warnings,'DUPLICATE_ACTIVE_HOLDING',`Duplicate active holding ${key}.`,key);
        activeKeys.add(key);
      }
      if(Number(h.shares)<0)push(errors,'NEGATIVE_SHARES',`${key} has negative shares.`,Number(h.shares));
      if(Number(h.bookCostGbp)<0)push(errors,'NEGATIVE_BOOK_COST',`${key} has negative book cost.`,Number(h.bookCostGbp));
    });

    const route=state.transfer?.route;
    if(route&&Array.isArray(route.allocations)){
      const sum=route.allocations.reduce((x,a)=>x+Math.max(0,Number(a.amount)||0),0);
      const allocated=Math.max(0,Number(route.allocated)||0);
      const remaining=Math.max(0,Number(route.remaining)||0);
      const budget=Math.max(0,Number(route.financeBudget)||0);
      if(Math.abs(sum-allocated)>1.01){
        push(warnings,'TRANSFER_ALLOCATED_MISMATCH','Transfer allocation rows do not match route allocated total.',{rows:sum,allocated});
      }
      if(budget>0&&Math.abs((allocated+remaining)-budget)>1.01){
        push(warnings,'TRANSFER_BUDGET_MISMATCH','Transfer allocated + remaining does not match Finance budget.',{allocated,remaining,budget});
      }
    }

    const receipts=Array.isArray(state.registration?.receipts)?state.registration.receipts:[];
    const tx=new Set();
    receipts.forEach(r=>{
      const id=String(r.transactionId||'').trim();
      if(!id)return;
      if(tx.has(id))push(warnings,'DUPLICATE_RECEIPT_TX',`Duplicate Registration receipt transaction ${id}.`,id);
      tx.add(id);
    });

    const ids=(rows,label)=>{
      const seen=new Set();
      rows.forEach(x=>{
        const id=String(x?.id||'').trim();
        if(!id)return;
        if(seen.has(id))push(warnings,'DUPLICATE_ID',`${label} contains duplicate id ${id}.`,{label,id});
        seen.add(id);
      });
    };
    ids(Array.isArray(state.finance?.pots)?state.finance.pots:[],'Finance pots');
    ids(Array.isArray(state.finance?.bills)?state.finance.bills:[],'Finance bills');

    return {ok:errors.length===0,errors,warnings,checkedAt:now(),schemaVersion:VERSION};
  }

  function restoreBackup(){
    const raw=localStorage.getItem(BACKUP_KEY);
    const parsed=safeParse(raw);
    if(!parsed||typeof parsed!=='object')throw new Error('No valid Aurora backup is available.');
    const recovered=normalize({
      ...migrate(parsed),
      platform:{...object(parsed.platform),version:1,release:'AURORA2_STABLE_CORE_V1',recoveredFromBackupAt:now()}
    });
    const check=validate(recovered);
    if(!check.ok)throw new Error('Backup failed Aurora integrity validation.');
    localStorage.setItem(KEY,JSON.stringify(recovered));
    w.dispatchEvent(new CustomEvent('aurora2:state',{detail:recovered}));
    return recovered;
  }

  function read(){
    const raw=localStorage.getItem(KEY);
    const parsed=safeParse(raw);
    if(parsed&&typeof parsed==='object')return normalize(migrate(parsed));

    if(raw){
      const backupParsed=safeParse(localStorage.getItem(BACKUP_KEY));
      if(backupParsed&&typeof backupParsed==='object'){
        console.warn('Aurora state was unreadable. Recovering from last good backup.');
        return restoreBackup();
      }
    }
    return normalize(defaultState());
  }

  function write(next){
    const currentRaw=localStorage.getItem(KEY);
    backupRaw(currentRaw,'pre-write',false);

    const state=normalize({...migrate(next),schemaVersion:VERSION,updatedAt:now()});
    const check=validate(state);
    if(!check.ok){
      console.error('Aurora rejected an invalid state write:',check.errors);
      throw new Error('Aurora state integrity check failed. Existing state was kept.');
    }

    try{
      localStorage.setItem(KEY,JSON.stringify(state));
    }catch(err){
      console.error('Aurora state write failed:',err);
      throw err;
    }
    w.dispatchEvent(new CustomEvent('aurora2:state',{detail:state}));
    return state;
  }

  function update(updater){
    const current=read();
    const next=typeof updater==='function'?updater(current):{...current,...object(updater)};
    return write(next);
  }

  function diagnostics(){
    const raw=localStorage.getItem(KEY);
    const state=read();
    const check=validate(state);
    const meta=backupMeta();
    return {
      key:KEY,
      version:VERSION,
      release:'AURORA2_STABLE_CORE_V1',
      primaryReadable:!raw||Boolean(safeParse(raw)),
      primaryBytes:raw?raw.length:0,
      backupAvailable:Boolean(safeParse(localStorage.getItem(BACKUP_KEY))),
      backupAt:meta.at||null,
      backupReason:meta.reason||null,
      validation:check,
      stateUpdatedAt:state.updatedAt||null
    };
  }

  function bootstrapMigration(){
    const raw=localStorage.getItem(KEY);
    const parsed=safeParse(raw);
    if(!parsed||typeof parsed!=='object')return;
    const from=Math.max(0,Number(parsed.schemaVersion)||0);
    if(from===VERSION)return;
    backupRaw(raw,`pre-migration-v${from}-to-v${VERSION}`,true);
    const migrated=normalize({...migrate(parsed),schemaVersion:VERSION,updatedAt:now()});
    const check=validate(migrated);
    if(!check.ok){
      console.error('Aurora migration validation failed. Original state left untouched.',check.errors);
      return;
    }
    localStorage.setItem(KEY,JSON.stringify(migrated));
  }

  bootstrapMigration();
  function money(v){
    return Number.isFinite(Number(v))
      ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v))
      : '—';
  }
  function text(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—'}
  function escape(s){
    return String(s??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
  }
  function uid(prefix='A2'){
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  }

  // The live Holdings ledger is the only authority for current dividend income.
  // Route, payday and simulator snapshots deliberately never participate here.
  function financialNumber(value){
    const parsed=Number(String(value??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(parsed)?parsed:0;
  }
  function incomeExemptHolding(holding){
    if(!holding)return false;
    if(holding.incomeExempt===true||holding.dividendEligible===false)return true;
    const ticker=String(holding.ticker||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
    const account=String(holding.account||'').toLowerCase();
    const reason=String(`${holding.lockReason||''} ${holding.role||''} ${holding.source||''}`).toLowerCase();
    return ticker==='TSCO'&&(!account.includes('212')&&!/\big\b/.test(account)||/saye|save as you earn|2029|legacy/.test(reason));
  }
  function isActiveIncomeHolding(holding){
    return ['ACTIVE','LOCKED'].includes(String(holding?.status||'').toUpperCase())&&financialNumber(holding?.shares)>0;
  }
  function getHoldingAnnualIncome(holding){
    if(!isActiveIncomeHolding(holding)||incomeExemptHolding(holding))return 0;
    const shares=financialNumber(holding.shares);
    const dps=financialNumber(holding.annualDpsGbp??holding.annual_dps);
    // A stored total is legacy evidence only. When both operands exist, even a
    // stale annualIncomeGbp/annual_dps_total can never beat shares × DPS.
    if(shares>0&&dps>0)return shares*dps;
    return Math.max(0,financialNumber(holding.annualIncomeGbp??holding.annual_dps_total??holding.annual_income));
  }
  function getCurrentAnnualIncome(state){
    const source=state||read();
    return (Array.isArray(source?.squad?.holdings)?source.squad.holdings:[])
      .reduce((total,holding)=>total+getHoldingAnnualIncome(holding),0);
  }
  function getCurrentMonthlyIncome(state){return getCurrentAnnualIncome(state)/12}
  function getProjectedAnnualIncome(route,state){
    const allocations=Array.isArray(route?.allocations)?route.allocations:[];
    const uplift=allocations.reduce((total,item)=>total+Math.max(0,financialNumber(item?.expectedAnnualIncome)),0);
    return getCurrentAnnualIncome(state)+uplift;
  }
  function setActiveNav(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    document.querySelectorAll('.nav a').forEach(a=>{
      const href=(a.getAttribute('href')||'').toLowerCase();
      a.classList.toggle('active',href===path);
    });
  }
  function activateBuiltDepartments(){
    document.querySelectorAll('[data-soon="Transfer"]').forEach(a=>{
      a.setAttribute('href','transfer.html');
      a.removeAttribute('data-soon');
    });
    document.querySelectorAll('[data-soon="Squad"]').forEach(a=>{
      a.setAttribute('href','squad.html');
      a.removeAttribute('data-soon');
    });
    document.querySelectorAll('[data-soon="Scouting"]').forEach(a=>{
      a.setAttribute('href','scouting.html');
      a.removeAttribute('data-soon');
    });
    document.querySelectorAll('[data-soon="Income"]').forEach(a=>{
      a.setAttribute('href','income.html');
      a.removeAttribute('data-soon');
    });
    document.querySelectorAll('[data-soon="Registration"]').forEach(a=>{
      a.setAttribute('href','registration.html');
      a.removeAttribute('data-soon');
    });
  }
  function wireSoon(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-soon]');
      if(!a)return;
      e.preventDefault();
      alert((a.getAttribute('data-soon')||'Department')+' 2.0 is reserved and will be built after the audit.');
    });
  }
  function wireNavigationFallback(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('.nav a');
      if(!a)return;
      const href=a.getAttribute('href')||'';
      if(!href||href==='#'||a.hasAttribute('data-soon'))return;
      e.preventDefault();
      window.location.assign(href);
    },true);
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.core={KEY,VERSION,BACKUP_KEY,read,write,update,defaultState,normalize,migrate,validate,diagnostics,backup,restoreBackup,uid};
  w.AuroraFinancialTruth=Object.freeze({
    getHoldingAnnualIncome,getCurrentAnnualIncome,getCurrentMonthlyIncome,getProjectedAnnualIncome,
    isActiveHolding:isActiveIncomeHolding,isIncomeExempt:incomeExemptHolding
  });
  w.Aurora2.ui={money,text,escape};
  document.addEventListener('DOMContentLoaded',()=>{activateBuiltDepartments();setActiveNav();wireSoon();wireNavigationFallback();});
})(window);
