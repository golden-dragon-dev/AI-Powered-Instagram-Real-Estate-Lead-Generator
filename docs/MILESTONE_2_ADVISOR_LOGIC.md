# Milestone 2 advisor-fit logic

This is the final conversation/recommendation gate before Milestone 2 closes.

## Production principle

The bot must distinguish:

- **Exact fit**: all stated criteria match.
- **Strong fit with a compromise**: area, unit size/type, and budget fit; a financing criterion such as initial cash or developer payment plan does not.
- **Nearby option**: one non-severe core criterion differs, and the difference is stated.
- **Poor match**: multiple material core gaps, a strict area mismatch, or a budget gap over 20%. Do not pitch it as suitable.

The response order is:

1. Lead with why a viable property fits.
2. State the compromise with confirmed figures.
3. Show the confirmed property facts.
4. Ask a useful next-step question.

Never use a blanket “no exact match” opener for a strong fit with a financing compromise.

## Architecture

```text
buyer message
  -> Claude/local structured understanding
  -> validated buyer update
  -> durable buyer memory
  -> deterministic candidate assessment
  -> exact / strong-with-compromise / nearby / poor
  -> ranked confirmed Airtable candidates
  -> balanced fit + compromise explanation
  -> optional Claude natural rewrite
  -> final commercial fact checker
```

Claude does not decide listing facts or override matching. Airtable remains the property source of truth. Every recommendation carries deterministic fit evidence (`tier`, `score`, matched criteria, compromises).

## Ranking model

Applicable buyer criteria are weighted:

- Area: 24
- Bedrooms: 18
- Property type: 10
- Budget: 24
- Initial cash: 14
- Developer payment plan: 10

Scores are normalized over only the criteria the buyer actually supplied.

Classification rules:

- No gaps: `exact`
- No core gaps and one or more financing gaps: `strong_with_compromise`
- One non-severe core gap: `nearby`
- Otherwise: `poor`

Explicit project and developer requests are candidate gates. Inactive projects, inactive developers, inactive units, and wrong emirates are excluded.

## Codex test order

### 1. Fundamental fit suite

```bash
node --test test/step17-advisor-fit.test.js
```

Expected: 6 tests pass.

### 2. Reem strong-fit scenario

Input:

```text
AED 2M, Reem, 2 bedrooms, no more than 150k down, payment plan
```

Expected:

- `fitTier === "strong_with_compromise"`
- Reem Gate is selected.
- Area, 2BR, and AED 2M budget are stated as reasons it fits.
- AED 1.6M initial payment versus AED 150k is stated.
- Developer payment plan is stated as not confirmed.
- Reply does not say `I do not have an exact match`.
- Fact checker passes.

### 3. Reem exact scenario

Input:

```text
I want a 2 bedroom in Reem around AED 2M
```

Expected:

- `fitTier === "exact"`
- Reem Gate is selected.
- No compromise is invented because financing was not constrained.

### 4. Nearby scenario

Input:

```text
Budget AED 2M, Yas Island, 3 bedrooms
```

Expected:

- `fitTier === "nearby"`
- The reply leads with the useful fit.
- The bedroom trade-off is explicit.
- No blanket `I do not have an exact match` opener.

### 5. Genuine poor-match scenario

Input:

```text
Yas Park Views, AED 1M, 3 bedrooms, 50k down, payment plan
```

Expected:

- `fitTier === "none"`
- No property is pitched as a strong fit.
- The reply says there is no confirmed option fitting those details.

### 6. Prior correction suite

```bash
node --test test/step16-client-corrections.test.js
```

Expected: 10 tests pass.

### 7. Full regression

```bash
npm test
```

Expected: all tests pass.

## Research basis

The design follows established conversational and knowledge-based recommendation patterns:

- Hard constraints plus weighted soft preferences, followed by utility ranking:
  https://www.ise.bgu.ac.il/faculty/liorr/recsyshb/chConstraint.pdf
- Trade-off navigation instead of all-or-nothing filtering:
  https://doi.org/10.1007/978-3-030-94751-4_14
- Knowledge-based recommenders for high-involvement purchases including property:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10925703/
- Balanced reasons for and against a recommendation:
  https://link.springer.com/article/10.1007/s11257-025-09432-6
- Credible positive framing without hiding factual weaknesses:
  https://aclanthology.org/2024.findings-emnlp.247.pdf
- Strict structured extraction and validation before deterministic execution:
  https://aclanthology.org/2025.emnlp-industry.184.pdf

## Milestone boundary

After this gate passes, the conversation and recommendation behavior is considered complete for Phase 1.

- Milestone 3 connects this engine to Instagram, HubSpot, and high-intent notifications.
- Milestone 4 runs final acceptance, production deployment, documentation, and handover.

Later milestones should not redesign the chat logic unless testing reveals a regression or the client requests new scope.
