# UAE Real Estate AI

Abu Dhabi Instagram lead system. This repo currently implements **Milestone 1**.

Milestone 1 is the data layer only. No Instagram, Claude, or HubSpot yet.

## What Milestone 1 includes

- Airtable-ready developer, project, and unit schema
- Local JSON catalog that matching code already uses
- Buyer card keyed by Instagram user id
- Matching in code by budget, cash, area, developer, type, bedrooms, payment plan
- Fact retrieval that returns null instead of guessing
- Fact checker that blocks invented prices, plans, dates, and availability
- Missing data does not trigger a human handoff

## Run

Node 18+ is required. No npm packages are required.

```bash
node --test test/step1-schema.test.js test/step2-buyer-model.test.js test/step3-matching.test.js test/step4-fact-retrieval.test.js test/step5-fact-checker.test.js test/step6-acceptance.test.js
npm run verify
npm run match -- --budget 3M --cash 500k --area "Yas" --bedrooms 3 --payment-plan
```

On Windows PowerShell use:

```powershell
npm test
npm run verify
```

## Codex test order

Follow `docs/MILESTONE_1.md` from step 1 to step 12. `npm run verify` prints PASS or FAIL for each step.

## Sample data

`data/seed` is a demo Abu Dhabi set for tests. It is not live inventory. Replace it in Airtable later without changing matcher code.

## Later milestones

- Milestone 2: conversation, qualification, buyer memory in the assistant, fact check before send
- Milestone 3: Instagram Messaging API, HubSpot, high-intent pings
- Milestone 4: acceptance tests, production deploy, docs, handover
"# AI-Powered-Instagram-Real-Estate-Lead-Generator" 
