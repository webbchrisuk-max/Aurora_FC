# Aurora AI — Conversational setup

The Clean build now supports free-form Aurora AI chat through the existing **AuroraData 2 Consolidated** backend.

## Confirmed router integration

Your consolidated router already has exactly the structure Aurora AI needs:

- one authenticated `doPost()`
- one authenticated `doGet()`
- a central action registry
- POST-only execution for non-READ actions
- backend dependency/status reporting

Aurora AI should be registered as a **WRITE_DERIVED** POST action. It does not write to the workbook; that mode is used because the request carries a conversation/context payload and therefore belongs on POST rather than the read-only GET route.

### 1. Update the router release

```javascript
const A2_BACKEND_RELEASE = 'AURORA_DATA2_CONSOLIDATED_BACKEND_V2_3_AI';
const A2_BACKEND_ROUTER_VERSION = 2.3;
const A2_BACKEND_RELEASED_AT = '2026-09-25';
```

### 2. Add `aiChat` to `auroraActionSpecs_()`

```javascript
{
  name:'aiChat',
  group:'AI',
  mode:'WRITE_DERIVED',
  handler:p => auroraHandleAiChat_(p)
},
```

No change to `doPost()` is required. The existing `ARD2_verifyToken_(e, payload)` call runs before the registry handler, and the current POST gate already allows `WRITE_DERIVED`.

### 3. Add the AI dependency to `auroraBackendDependencies_()`

```javascript
ai:{
  chat:
    typeof auroraHandleAiChat_ === 'function'
},
```

This makes `backendStatus` and `backendHardeningSelfTest_` report the AI handler as a dependency.

### 4. Add the AI handler file

Copy `clean-rebuild/AuroraAIChat.gs` into the same Apps Script project.

### 5. Configure Script Properties

In **Apps Script → Project Settings → Script Properties** add:

- `OPENAI_API_KEY` = your OpenAI project API key
- Optional: `AURORA_AI_MODEL` = `gpt-5.6`

Never place the API key in `aurora.js`, HTML, localStorage, GitHub, or any browser-visible code.

### 6. Redeploy the existing web app

Deploy a **new version of the same AuroraData 2 Consolidated web app**. Keep the existing backend URL/token connection where possible.

### 7. Validate

Run these in Apps Script:

```javascript
backendHardeningSelfTest_()
auroraAiRouterPatchStatus_()
testAuroraAiChat()
```

Expected results:

- hardening self-test passes
- `aiChat` is registered as `AI / WRITE_DERIVED`
- the AI test returns `ok:true` with an answer

## Architecture

Browser (Aurora Clean) → authenticated AuroraData 2 Consolidated web app → OpenAI Responses API

The browser sends only a controlled Aurora snapshot plus recent Aurora AI conversation history.

## Safety boundary

Aurora AI can explain, reason, navigate, highlight and run approved read/refresh controls.

It does not execute purchases, move money, lock Transfer routes, complete Registration, or reset data from free-form chat. Those actions remain on the existing explicit Aurora controls.
