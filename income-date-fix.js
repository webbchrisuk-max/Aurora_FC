(() => {
  'use strict';

  const base = window.AuroraIncomeTruth;
  if (!base) return;

  const BUILD = '20260821-income-date-fix-1';
  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const arr = value => Array.isArray(value) ? value : [];

  function validDate(year, month, day) {
    const d = new Date(year, month, day, 12, 0, 0, 0);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
  }

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return validDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if (match) {
      let year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return validDate(year, Number(match[2]) - 1, Number(match[1]));
    }

    match = raw.match(/^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:[\s,]+(\d{4}))?$/i);
    if (match) {
      const weekday = match[1] ? WEEKDAYS[match[1].slice(0, 3).toLowerCase()] : null;
      const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
      const day = Number(match[3]);
      const explicitYear = match[4] ? Number(match[4]) : null;
      if (Number.isInteger(month)) {
        if (explicitYear) return validDate(explicitYear, month, day);
        const now = new Date();
        const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
        let candidates = years.map(year => validDate(year, month, day)).filter(Boolean);
        if (weekday !== null) {
          const weekdayMatches = candidates.filter(date => date.getDay() === weekday);
          if (weekdayMatches.length) candidates = weekdayMatches;
        }
        candidates.sort((a, b) => Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime()));
        if (candidates[0]) return candidates[0];
      }
    }

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function calendarState(event) {
    const status = String(event?.status || 'FORECAST').toUpperCase();
    if (status === 'CANCELLED' || status === 'ARCHIVED') return 'cancelled';
    if (status === 'PAID') return 'paid';
    const pay = parseDate(event?.payDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pay && pay < today) return 'late';
    if (status === 'CONFIRMED' || status === 'ANNOUNCED') return 'confirmed';
    return 'forecast';
  }

  function upcoming(state, events) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return base.activeCalendar(state, events)
      .map(event => ({ ...event, computedAmount: base.eventAmount(state, event), __date: parseDate(event.payDate) }))
      .filter(event => event.__date && event.__date >= today && String(event.status || '').toUpperCase() !== 'PAID')
      .sort((a, b) => a.__date - b.__date || base.ticker(a.ticker).localeCompare(base.ticker(b.ticker)));
  }

  function nextDividend(state, events) {
    const event = upcoming(state, events)[0];
    return event ? {
      ticker: base.ticker(event.ticker),
      name: event.name || base.ticker(event.ticker),
      account: base.accountCode(event.account),
      accountLabel: base.accountLabel(event.account),
      amount: Number(event.computedAmount.toFixed(2)),
      date: base.dateISO(event.__date),
      exDate: event.exDate || '',
      status: String(event.status || 'FORECAST').toUpperCase()
    } : null;
  }

  function reliability(state, events, metrics = base.metrics(state)) {
    const all = Array.isArray(events) ? events : arr(state?.income?.calendar);
    const counts = { paid: 0, confirmed: 0, forecast: 0, late: 0, cancelled: 0 };
    all.forEach(event => { counts[calendarState(event)] += 1; });
    const players = new Set(metrics.players.map(player => base.ticker(player.ticker)).filter(Boolean));
    const covered = new Set(all.filter(event => calendarState(event) !== 'cancelled').map(event => base.ticker(event.ticker)).filter(ticker => players.has(ticker)));
    return { all, counts, coveragePct: players.size ? covered.size / players.size * 100 : 0, coveredPlayers: covered.size, totalPlayers: players.size };
  }

  function runway(state, events, metrics = base.metrics(state)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setMonth(end.getMonth() + 12);
    const first = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const months = [];
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(first.getFullYear(), first.getMonth() + i, 1, 12);
      months.push({ key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, date, confirmed: 0, forecast: 0, total: 0, confirmedCount: 0, forecastCount: 0 });
    }
    const monthMap = new Map(months.map(row => [row.key, row]));
    let confirmed = 0;
    let forecast = 0;
    let receivedYtd = 0;
    base.activeCalendar(state, events).forEach(event => {
      const status = String(event?.status || 'FORECAST').toUpperCase();
      const pay = parseDate(event.payDate);
      const amount = base.eventAmount(state, event);
      if (status === 'PAID') {
        if (pay && pay.getFullYear() === today.getFullYear()) receivedYtd += amount;
        return;
      }
      if (!pay || pay < today || pay >= end) return;
      const key = `${pay.getFullYear()}-${String(pay.getMonth() + 1).padStart(2, '0')}`;
      const row = monthMap.get(key);
      if (!row) return;
      if (status === 'CONFIRMED' || status === 'ANNOUNCED') {
        confirmed += amount;
        row.confirmed += amount;
        row.confirmedCount += 1;
      } else {
        forecast += amount;
        row.forecast += amount;
        row.forecastCount += 1;
      }
      row.total += amount;
    });
    const scheduled = confirmed + forecast;
    const unscheduled = Math.max(0, metrics.annual - scheduled);
    return { months, confirmed, forecast, scheduled, unscheduled, mappedPct: metrics.annual > 0 ? Math.min(100, scheduled / metrics.annual * 100) : 0, receivedYtd };
  }

  function summary(state, events, history) {
    const metrics = base.metrics(state);
    const next = nextDividend(state, events);
    const run = runway(state, events, metrics);
    const rel = reliability(state, events, metrics);
    const route = base.activeTransferIncome(state);
    const registration = base.confirmedRegistrationUplift(state);
    return {
      version: 1,
      build: BUILD,
      source: 'SQUAD_CANONICAL',
      calculatedAt: new Date().toISOString(),
      annualIncomeGbp: Number(metrics.annual.toFixed(2)),
      monthlyIncomeGbp: Number(metrics.monthly.toFixed(2)),
      yieldOnCostPct: Number(metrics.yoc.toFixed(2)),
      portfolioYieldPct: Number(metrics.yieldPct.toFixed(2)),
      bestDividendPlayer: metrics.best ? { ticker: metrics.best.ticker, name: metrics.best.name, annualIncomeGbp: Number(metrics.best.annual.toFixed(2)) } : null,
      nextDividend: next,
      top5ConcentrationPct: Number(metrics.top5Pct.toFixed(2)),
      calendarCoveragePct: Number(rel.coveragePct.toFixed(2)),
      routeProjectedAnnualIncomeGbp: Number(route.toFixed(2)),
      confirmedRegistrationAnnualUpliftGbp: Number(registration.total.toFixed(2)),
      runway: {
        confirmedGbp: Number(run.confirmed.toFixed(2)),
        forecastGbp: Number(run.forecast.toFixed(2)),
        unscheduledAnnualGbp: Number(run.unscheduled.toFixed(2)),
        mappedPct: Number(run.mappedPct.toFixed(2)),
        receivedYtdGbp: Number(run.receivedYtd.toFixed(2))
      },
      forecast625: base.historyForecast(history, 625),
      forecast2000: base.historyForecast(history, 2000)
    };
  }

  window.AuroraIncomeTruth = Object.freeze({
    ...base,
    build: BUILD,
    parseDate,
    calendarState,
    upcoming,
    nextDividend,
    reliability,
    runway,
    summary
  });
})();