# Aurora AI — Conversational setup

The Clean build now supports free-form Aurora AI chat through the existing Aurora backend connection.

## Architecture

Browser (Aurora Clean) → existing Aurora Apps Script web app → OpenAI Responses API

The OpenAI API key must never be placed in `aurora.js`, HTML, localStorage, GitHub, or any other browser-visible file.

## One-time backend setup

1. Open the existing Aurora Apps Script web app project.
2. Add the contents of `clean-rebuild/AuroraAIChat.gs` to that Apps Script project.
3. In the existing authenticated POST router, add:

```javascript
if (action === 'aiChat') {
  return auroraHandleAiChat_(payload);
}
```

The router's existing Aurora token/authentication check must run before this handler.

4. Open **Project Settings → Script Properties** and add:

- `OPENAI_API_KEY` = your OpenAI project API key
- Optional: `AURORA_AI_MODEL` = `gpt-5.6`

5. Deploy a new version of the existing web app. Keep the same Aurora backend connection URL/token where possible.
6. Run `testAuroraAiChat` in Apps Script once to verify the server can reach the OpenAI Responses API.
7. Open Aurora Clean and ask the assistant a free-form question such as:

> Why is my current safe release lower than my available cash?

## What the browser sends

Only a controlled snapshot relevant to Aurora conversation:

- Finance summary, bills and pots
- ISA allowance summary
- Scouting status and limited candidate/plan data
- Transfer mission and route summary
- Registration receipt summary
- Squad holdings summary
- Forward income and Match Report status
- Recent Aurora assistant conversation

The browser does **not** include the Aurora backend token or OpenAI API key in the AI payload.

## Safety boundary

Aurora AI can explain, reason, navigate, highlight and run approved read/refresh controls.

It does not execute purchases, move money, lock Transfer routes, complete Registration, or reset data from free-form chat. Those actions remain on the existing explicit Aurora controls.
