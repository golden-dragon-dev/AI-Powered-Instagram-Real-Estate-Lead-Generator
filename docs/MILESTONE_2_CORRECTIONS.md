# Milestone 2 client correction checks (Codex)

Step-by-step tests for the screenshot bugs: area switch, multi bedroom, mid-chat budget change, and cash ceiling.

## Run one file

```bash
node --test test/step16-client-corrections.test.js
```

## Run full suite

```bash
npm test
```

## Step map

### Step 16a. Forget Yas / What about Reem (extract)

Input: `Forget Yas actually. What about Reem?`  
Expect: `facts.area === "Al Reem Island"` (not Yas).

### Step 16b. 1 or 2 bed (extract)

Input: `Maybe a 1 or 2 bed. What would you recommend?`  
Expect: `facts.bedrooms === [1, 2]`.

### Step 16c. Cash ceiling (extract)

Input: `I don't want to put more than 150k down.`  
Expect: `facts.cash === 150000`.

### Step 16d. Budget correction (extract)

Input: `Actually let’s make the budget 2m.`  
Expect: `facts.budget === 2000000`.

### Step 16e. Conversation area switch

1. `Budget AED 2M, Yas Island, 1 bedroom`
2. `Forget Yas actually. What about Reem?`  
Expect: buyer area is Al Reem Island; reply does not say `on Yas Island`; matches are Reem (or no Yas pitch).

### Step 16f. Conversation multi bedroom wording

1. `Budget AED 1.5M, Yas`
2. `Maybe a 1 or 2 bed. What would you recommend?`  
Expect: buyer bedrooms `[1, 2]`; reply does not say `You asked for 2 bedroom` alone.

### Step 16g. Mid-chat budget change does not re-ask cash

1. Establish Yas budget + bedrooms
2. Reach a cash ask
3. `Actually let’s make the budget 2m.`  
Expect: budget becomes 2M; reply does **not** contain `How much cash can you put in for the initial payment?`

### Step 16h. 150k down filters matches

1. `Budget AED 2M, Yas, 1 bedroom`
2. `I don't want to put more than 150k down.`  
Expect: `cashAvailableAed === 150000`; every match `downPaymentAed <= 150000`.

### Step 16i. Matcher accepts bedroom array

Buyer bedrooms `[1, 2]` on Yas under 2M.  
Expect: matches exist and every match is 1BR or 2BR.

### Step 16j. Soft mismatch wording for multi bed

Wanted `[1, 2]`, offered studio only.  
Expect: note mentions `1 bedroom or 2 bedroom`, not only `You asked for 2 bedroom.`

## Pass rule

All step 16 tests green before calling Milestone 2 ready for client retest.
