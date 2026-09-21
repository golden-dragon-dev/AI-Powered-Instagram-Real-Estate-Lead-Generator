# Abu Dhabi property lead system

Instagram enquiry system for Abu Dhabi real estate. Milestone 1 covers the property database, buyer records, matching, and confirmed-data replies.

Later milestones add conversation flow, Instagram, HubSpot, and live deploy.

## Milestone 1

- Developer, project, and unit tables (Airtable-ready)
- Local catalog used by matching code
- Buyer record keyed by Instagram user id
- Matching by budget, cash, area, developer, type, bedrooms, and payment plan
- Replies use approved fields only
- Unknown prices, plans, dates, and availability are blocked
- Missing fields do not send the enquiry to an agent

## Run

Node 18 or newer. No extra packages.

```bash
npm test
npm run verify
npm run match -- --budget 3M --cash 500k --area "Yas" --bedrooms 3 --payment-plan
```

How to check each part is in `docs/MILESTONE_1.md`. `npm run verify` prints PASS or FAIL for each check.

## Sample listings

`data/seed` is demo Abu Dhabi stock for tests. It is not live inventory. Replace it in Airtable later. Matching code stays the same.

## Next milestones

- Milestone 2: conversation, qualification, saved buyer details, reply checks before send
- Milestone 3: Instagram Messaging API, HubSpot, high-intent alerts
- Milestone 4: acceptance tests, production deploy, docs, handover
