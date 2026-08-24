Aurora FC 2.0 — Income Centre v0.1

NEW DEPARTMENT
- income.html
- income.js

UPDATED INTEGRATION
- aurora-core.js -> schema v9
- hq.js -> consumes Income outputs and recognises AuroraData2 CONNECTED state
- index.html + all department HTML pages -> Income navigation is live
- latest Finance v1.4.1 files are preserved in this complete bundle

INCOME OWNERSHIP
- Squad owns account-scoped shares / book cost / annual DPS.
- Income calculates forward annual income from shares × annual DPS.
- Stored annualIncomeGbp is only a fallback if DPS is unavailable.
- Income publishes annual income, monthly equivalent, best dividend player and next recorded dividend to HQ.
- Transfer projected income is displayed read-only; Income does not recreate Transfer allocation logic.
- Confirmed Registration expected-income uplift is displayed separately and is not added again to current Squad income.

DIVIDEND CALENDAR
- Payment dates are never guessed.
- Add forecast/confirmed events in Income Centre.
- Event amount auto-calculates from CURRENT account+ticker shares × event DPS.
- Multi-account tickers remain account-specific.
- PAID events can store the actual amount.
- 12-month calendar totals only use recorded dividend events.

AURORADATA 2 BACKEND UPGRADE (RECOMMENDED, NOT REQUIRED FOR BASIC INCOME TOTALS)
The current Registration connection continues to work without this upgrade.
Income totals work immediately from the seeded Squad.

To sync the Dividend calendar into AuroraData 2:
1. Open AuroraData 2 > Extensions > Apps Script.
2. Replace Code.gs with apps-script/AuroraData2_Code_v0.2.gs.
3. Deploy > Manage deployments > Edit > New version > Deploy.
4. Keep the SAME deployment URL and SAME private token.
5. In Income Centre press Sync Dividend Calendar.

The v0.2 backend adds:
- incomeSnapshot
- upsertDividend
- automatic Dividends schema header repair
and preserves the existing health, seedHoldings and registerPurchase actions.

UPLOAD
Upload/replace the ROOT files from this bundle in the aurora-fc-2 repository.
The apps-script folder is NOT uploaded to GitHub if you want to keep backend deployment instructions separate; only its code is pasted into Apps Script. It contains no private token.
