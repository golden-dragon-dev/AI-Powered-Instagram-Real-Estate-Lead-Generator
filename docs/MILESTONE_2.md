# Milestone 2 checks

Conversation, qualification, buyer memory, quick-reply choices, and fact-checked replies in a test chat. Instagram and HubSpot stay in Milestone 3.

## What this uses

- Node 18 or newer
- Local seed catalog by default
- Live Airtable when `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` are set
- Editable quick replies in `data/qualification-choices.json`
- Optional reply polish when `ANTHROPIC_API_KEY` is set

## Web test chat

```bash
npm run chat:web
```

Open:

```text
http://127.0.0.1:8787/
```

Keep the same test buyer id in the page header to check memory.

## CLI test chat

```bash
npm run chat
```

## Automated checks

```bash
npm test
npm run verify:m2
```

## Client scenarios to try

1. `I have AED 3M.`
2. `Yas Island, 3 bedroom.`
3. `I have AED 500k available now and need a payment plan.`
4. `What do you recommend?` (should remember previous facts)
5. `Actually make that 2 bedrooms.` (replaces 3BR)
6. `What's the payment plan?` (confirmed Airtable text only)
7. Ask about a blank field (should say not confirmed)
8. Reload or return with the same buyer id (memory kept)
9. `I don't want to give my phone number.` (keeps helping, no repeat phone ask)

## Project-led chat

Once budget and area are known, the chat introduces confirmed projects early and keeps qualifying around them.

Edit soft project emphasis without code changes:

```text
data/conversation-preferences.json
```

Set `featuredProjectIds` or `featuredProjectNames` for the launch you want to lean toward.

Examples already included:

- Buy / Invest / Just exploring
- Apartment / Villa / Townhouse
- Cash / Mortgage / Payment plan
- Yas / Saadiyat / Reem / Hudayriyat / Other

Tapping a choice or typing the same words stores the same structured value.

## Acceptance for release

- Progressive qualification works with free text and quick replies
- Buyer card keeps budget, cash, area, and bedrooms across turns
- Bedroom corrections replace the old value
- Phone refusal stops contact prompts
- Fact checker blocks invented commercial claims
- Missing listing fields stay unanswered and do not hand off
- Test chat runs without Instagram
