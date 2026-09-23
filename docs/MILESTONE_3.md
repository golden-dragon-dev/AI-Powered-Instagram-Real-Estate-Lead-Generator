# Milestone 3

Instagram Messaging, HubSpot contact sync, and WhatsApp high-intent alerts on top of the Milestone 2 engine.

## Deliverables

- Meta Instagram webhook receive with signature verification
- Durable webhook deduplication by message id
- Fact-checked replies sent through Instagram Graph API
- HubSpot contact upsert keyed by Instagram user id (no duplicates)
- WhatsApp Cloud API template alerts for viewing, reservation, and agent requests
- Informational EOI does not alert
- WhatsApp-only and no-call preferences preserved on the buyer and HubSpot
- Negated reserve (`don't reserve`) and stop phrases (`I'm good`) suppress alerts / pause sales follow-up
- Integration failures are isolated and written to a redacted log
- Test chat remains available outside production

## Architecture

```text
Instagram DM
  -> Meta webhook (signed)
  -> claim message.mid
  -> ConversationEngine.handleMessage
  -> HubSpot upsert (instagram_user_id)
  -> Instagram send (fact-checked reply)
  -> WhatsApp alert only when alertRecommended
  -> redacted integration log on failure
```

Matching, Airtable facts, and the commercial fact checker stay inside the existing engine.

## Environment

See `.env.example`. On Railway:

1. Mount a volume and set `RUNTIME_DATA_DIR` to that path.
2. Set `NODE_ENV=production`.
3. Keep `ALLOW_RUNTIME_LLM_KEY` unset/false.
4. Set Meta, HubSpot, and WhatsApp variables in Railway secrets.
5. Point the Meta webhook to `https://<host>/webhook/meta`.

HubSpot property bootstrap:

```bash
node scripts/hubspot-setup.js
```

WhatsApp template body parameters expected by the sender:

1. Instagram user id
2. Alert reason
3. Recommended project
4. Contact preference
5. Conversation summary

## Acceptance scenarios

```bash
node --test test/step19-milestone3-integrations.test.js
npm test
```

Covered launch cases:

- Multi-field extraction
- Later preference correction
- Informational EOI with no alert
- Viewing request alert
- Reservation request alert
- Agent request alert
- WhatsApp preference with no-call preserved
- Negative `don't reserve`
- `I'm good` stops the sales path
- Meta signature verification and echo filtering
- Duplicate webhook protection
- HubSpot upsert without duplicates
- Failed integrations logged without wiping buyer memory

## Final live acceptance

1. Save Meta, HubSpot, and WhatsApp credentials in Railway (never in chat).
2. Confirm webhook verification succeeds.
3. Message the business Instagram account from a separate personal Instagram account.
4. Confirm the bot reply, HubSpot contact create/update, and one WhatsApp alert to the opted-in advisor phone for a viewing or reservation request.
5. Resend / retry the same webhook payload and confirm no duplicate HubSpot contact and no second WhatsApp alert.

## Milestone boundary

Milestone 3 does not redesign chat matching. Milestone 4 is final production acceptance, documentation polish, and handover.
