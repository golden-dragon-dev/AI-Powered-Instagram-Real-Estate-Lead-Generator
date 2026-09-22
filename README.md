# Abu Dhabi property lead system

Instagram enquiry system for Abu Dhabi real estate.

Milestone 1 covers the property database, buyer records, matching, and confirmed-data replies.
Milestone 2 adds the test conversation layer: qualification, buyer memory, quick replies, and fact-checked replies.

## Milestone 1

- Developer, project, and unit tables
- Matching reads Airtable when keys are set
- Buyer record keyed by Instagram user id
- Matching by budget, cash, area, developer, type, bedrooms, and payment plan
- Replies use approved fields only
- Unknown prices, plans, dates, and availability are blocked
- Missing fields do not send the enquiry to an agent

## Milestone 2

- Natural buyer messages update the buyer card
- Progressive qualification with editable quick replies (`data/qualification-choices.json`)
- Multi-turn memory and short conversation summary
- Bedroom and area corrections replace earlier values
- Phone refusal is respected
- Matched replies built from approved fact packs
- Fact check before send
- Web test chat and CLI chat

## Run

Node 18 or newer. No required extra packages.

```bash
npm test
npm run verify:m1
npm run verify:m2
npm run match -- --budget 3M --cash 500k --area "Yas" --bedrooms 3 --payment-plan
npm run chat:web
npm run chat
```

Web test chat opens at `http://127.0.0.1:8787/`

Docs:

- Milestone 1: `docs/MILESTONE_1.md`
- Milestone 2: `docs/MILESTONE_2.md`

## Sample listings

`data/seed` is demo Abu Dhabi stock for tests. It is not live inventory. Replace it in Airtable later. Matching code stays the same.

## Next milestones

- Milestone 3: Instagram Messaging API, HubSpot, high-intent alerts
- Milestone 4: acceptance tests, production deploy, docs, handover
