# Milestone 1 checks

Run these in order. A step fails if the command exits non-zero or `scripts/verify-milestone1.js` prints FAIL.

## What this uses

- Node 18 or newer
- Local listings in `data/seed`
- Matching and fact retrieval in `src/`
- Airtable is optional. Tests must pass without Airtable keys.

## Step 0. Environment

```bash
node --version
```

Expected: `v18` or newer.

## Step 1. Schema and seed

```bash
node --test test/step1-schema.test.js
```

Expected: all tests pass.

Checks:

- Developer, project, unit, and buyer fields exist
- Seed catalog validates
- Active projects require source and last verified date
- `Old Yas Towers` is hidden unless `includeInactive` is true
- A studio row cannot be stored as 3 bedroom

## Step 2. Buyer records

```bash
node --test test/step2-buyer-model.test.js
```

Expected: all tests pass.

Checks:

- A new Instagram id creates a buyer record
- `AED 3M`, `500k`, `Yas`, `3BR` store as `3000000`, `500000`, `Yas Island`, `[3]`
- A later message does not wipe earlier budget or area
- A returning visitor loads the same record
- Empty values cannot clear name or phone

## Step 3. Property matching

```bash
node --test test/step3-matching.test.js
```

Expected: all tests pass.

Query used here:

- Budget AED 3,000,000
- Cash AED 500,000
- Area Yas Island
- 3 bedroom
- Payment plan required

Expected match: only `Yas Park Views` 3 bedroom at AED 2,600,000 with AED 260,000 initial.

Must not match:

- `Yas Studio One` (no 3 bedroom)
- `Yas Waterfront Residences` (price not confirmed)
- `Yas Grove Residences` (AED 800,000 initial)
- `Old Yas Towers` (inactive)
- Hudayriyat rows (wrong area)

## Step 4. Confirmed listing fields

```bash
node --test test/step4-fact-retrieval.test.js
```

Expected: all tests pass.

Checks:

- Confirmed prices come from the unit row
- Missing price, plan, handover, and availability stay `confirmed: false`
- A studio price is not copied onto a 3 bedroom row

## Step 5. Reply checks

```bash
node --test test/step5-fact-checker.test.js
```

Expected: all tests pass.

Checks:

- AED 2,600,000 is allowed for Yas Park Views
- AED 2,100,000 is blocked
- Q1 2025 is blocked when handover is Q4 2027
- Built replies pass the checker
- Missing data does not set `handoffRequired`
- Zero matches does not set `handoffRequired`

## Step 6. Sample buyer lines

```bash
node --test test/step6-acceptance.test.js
```

Expected: all tests pass.

Covers:

- I have AED 3M, 500k now, Yas, 3BR, payment plan
- What can I buy in Hudayriyat
- Anything from Aldar
- I want a studio
- I want a villa
- Returning buyer still has budget stored

## Step 7. Full Milestone 1 gate

```bash
npm run verify
```

Expected final line:

```
Milestone 1 verification passed.
```

Every numbered line above that must print `PASS`.

## Step 8. Matching from the command line

```bash
npm run match -- --budget 3M --cash 500k --area "Yas" --bedrooms 3 --payment-plan
```

Expected JSON:

- `matchCount` is `1`
- `matches[0].project` is `Yas Park Views`
- `matches[0].price` is `2600000`
- `handoffRequired` is `false`

Studio control case:

```bash
npm run match -- --area "Yas" --type studio
```

Expected: `Yas Studio One` only. `Yas Park Views` must be absent.

## Step 9. Airtable records

```bash
npm run airtable:demo
node --test test/step7-airtable-adapter.test.js
```

Expected:

- Developers, Projects, and Units are loaded as Airtable records
- AED 3M / 500k / Yas / 3BR / payment plan returns Yas Park Views at AED 2,600,000
- Raising that unit to AED 3,500,000 in Airtable drops it from the match
- Restoring AED 2,600,000 brings it back
- Old Yas Towers stays hidden
- Yas Waterfront Residences has no price and the reply says not confirmed yet

Live Airtable needs `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID`. Owner email is `BusinessBotUAE77@gmail.com`.

## Airtable mapping

Matching reads this shape from JSON or Airtable:

- Developers: Name, Active
- Projects: Name, Developer, Emirate, Area, Property types, Status, Handover, Payment plan available, Payment plan summary, Required initial payment AED, Description, Features, Availability notes, Source, Last verified, Active
- Units: Project, Property type, Bedrooms, Starting price AED, Size sqft from, Size sqft to, Initial payment AED, Availability, Active

See `docs/AIRTABLE_SETUP.md` to recreate the base. Do not hardcode prices. Change a price on the unit row only.

## Milestone 1 is done when

- `npm test` passes
- `npm run verify` passes
- The Yas 3M query returns one confirmed project
- Invented prices are blocked
- Missing fields say not confirmed yet
- `npm run airtable:demo` passes
- Changing a unit price changes the match
- Inactive projects stay hidden
