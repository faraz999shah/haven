# Haven

**Voice-first payments for older adults, with scam protection and family approval.**
Built for the PayPal AI Hackathon.

Haven lets an older adult send money through PayPal by simply saying what they want ("Send Maria $85 for groceries"). Before any money moves, every request passes through the caregiver's protection rules and an AI scam check. Routine payments to trusted people are confirmed in one step; anything risky is held until a family caregiver approves it.

There are two people in the demo (no login, the demo switch moves between them):

- **Margaret (senior)** taps a big microphone button and talks. Haven confirms, asks a gentle question, or tells her it has asked Sarah to take a look.
- **Sarah (caregiver)** sets the protection rules, sees every payment in a live table, reads the full conversation and the AI's reasoning, and approves or declines held payments.

## Demo scenarios

| Margaret says | What happens |
|---|---|
| "Send Maria $85 for groceries" | Maria is trusted, within limits, AI rates it low → "Send $85 to Maria for groceries?" → Yes → sent via PayPal Payouts. |
| "Pay Joe's Plumbing $350" | Over the $200 single-payment limit → held. Sarah approves → sent via PayPal. |
| "My grandson Kevin is in jail and needs $450 for bail, he said not to tell anyone" | New payee + over limits, AI flags impersonation, urgency and secrecy → held with a plain-language explanation. Sarah declines; Margaret is told gently. |

## How it works

```
 Margaret's speech (Web Speech API, in the browser)
        │
        ▼
 1. Parse ─────────── OpenAI → payee, amount, purpose (structured JSON)
        │             missing/unclear? → ask one clarifying question
        │             amount and purpose must appear in what she actually said
        ▼
 2. Rules engine ──── deterministic code, no AI → PASS or HOLD + rules triggered
        │             trusted list · max single payment · daily limit ·
        │             rapid payments · new-payee rule · known-scam list
        ▼
 3. AI risk check ─── OpenAI → {risk_level, reason, signals, next_question}
        │             urgency, secrecy, impersonation, gift cards, crypto, pressure…
        ▼
 4. Decide ────────── deterministic code: the stricter result always wins
        │   rules HOLD            → high (whatever the AI says)
        │   AI error / bad JSON   → high
        │   low                   → read back and confirm
        │   medium                → ask the AI's follow-up (max 2 rounds), then high
        │   high                  → hold for Sarah
        ▼
 5. PayPal ────────── Payouts API (sandbox) → webhook → status: sent / failed
```

**The AI can never lower a decision.** If the rules say HOLD, nothing the model outputs (or anything a scammer coaches the senior to say) can release the payment without caregiver approval. This is enforced in code (`lib/decision/combine.ts`), not just in the prompt, and covered by tests that feed the combine step every pairing of rules result and AI result, including a "coached" AI that always answers low.

Other safety details:

- The payee is matched to the trusted list by **code**, not by the AI (`lib/payees/resolve.ts`).
- AI output is validated with zod. Any network error, refusal, malformed JSON or unknown value is treated as **high risk**.
- The transcript is passed to the model fenced as evidence, never as instructions.
- The rules are re-checked at the moment Margaret says "yes", and a spoken yes/no is interpreted by code (anything that sounds like "no" cancels).
- Each payment can be paid only once: a conditional database update claims it before calling PayPal, and the PayPal `sender_batch_id` is derived from the payment ID, so retries and double-taps can't create a second payout.

## Tech stack

| Tool | How Haven uses it |
|---|---|
| **PayPal Payouts API** (sandbox) | OAuth client-credentials token, then `POST /v1/payments/payouts` with one item per approved payment. Each payment stores its `payout_batch_id`, item ID and PayPal status. A duplicate `sender_batch_id` is detected and resolved to the original batch. |
| **PayPal Webhooks** | `POST /api/webhooks/paypal` receives `PAYMENT.PAYOUTSBATCH.*` and `PAYMENT.PAYOUTS-ITEM.*` events, verifies each signature with `POST /v1/notifications/verify-webhook-signature`, de-duplicates by event ID, then re-reads the batch from PayPal (the source of truth) and updates the payment to `sent` or `failed`. |
| **OpenAI API** | Responses API with Structured Outputs (zod schemas) for parsing and risk assessment. Prompts live in [`prompts/`](prompts) as Markdown; the risk prompt includes six few-shot examples (two safe, grandparent jail scam, IRS gift-card scam, romance scam, one ambiguous). |
| **AG Grid Community** (React) | The caregiver's payments table: sortable and filterable columns, colored status and risk badge cell renderers, Approve/Decline buttons in held rows, high-risk held rows tinted via `rowClassRules`, quick-filter search, and live row updates via `getRowId`. Themed to match the app with `themeQuartz.withParams`. |
| **Render** | One Node web service plus one Postgres database, defined in [`render.yaml`](render.yaml). |
| Next.js 16, React 19, Tailwind, shadcn/ui | App and API routes. The UI was generated with v0, then wired to the backend. |
| PostgreSQL + Drizzle ORM | Caregiver, senior, trusted payees, rule settings, payments, conversations and transcripts, webhook events. |
| Web Speech API | Speech-to-text in the browser, and spoken replies via `speechSynthesis`. |
| Vitest | Unit and integration tests. |

## Project structure

```
app/
  page.tsx                     the app shell and demo switch
  api/converse                 one senior turn (speech/text → reply)
  api/caregiver/...            payments list/detail, approve, decline, rules
  api/senior/...               senior history, contacts, notices
  api/webhooks/paypal          PayPal webhook receiver
  api/health                   health check
components/haven/              the screens (from v0) and AG Grid table
lib/
  rules/engine.ts              Layer 1: deterministic rules (pure functions)
  scam/                        checkScamList() behind a swappable ScamSource interface
  ai/                          parsing and risk assessment (OpenAI)
  decision/combine.ts          rules + AI → decision (stricter wins)
  pipeline/assess.ts           payee matching → rules + AI → combine → reply
  conversation/                multi-turn conversation state machine
  paypal/                      OAuth client, Payouts, webhook verification
  payments/                    sending, status reconciliation, webhook handling
  caregiver/                   approve/decline, rules, notices
  db/                          Drizzle schema, client, demo seed
prompts/                       system prompts (edit to tune the AI)
drizzle/                       SQL migrations
scripts/                       setup, seed, migrate, PayPal and AI tools
tests/                         integration tests (Postgres)
```

## Running locally

Requirements: Node 20.9+ (22 recommended), PostgreSQL, an OpenAI API key, and a PayPal Developer sandbox app.

```bash
npm install
createdb haven
createdb haven_test            # optional, for integration tests
cp .env.example .env           # then fill it in (see below)
npm run db:setup               # migrate + seed demo data
npm run dev                    # http://localhost:3000
```

Use Chrome, Edge or Safari for voice (Firefox has no speech recognition; typing works everywhere).

### PayPal sandbox setup

1. At [developer.paypal.com](https://developer.paypal.com), in **Sandbox** mode, open **Apps & Credentials** and create one app. Copy its Client ID and Secret into `.env`. Payouts must be enabled for the app. Payouts are sent from the app's default sandbox **Business** account.
2. Under **Testing Tools → Sandbox Accounts**, create three **Personal** (US) accounts for Maria, Joe and Linda, and put their emails in `SANDBOX_EMAIL_*`. Run `npm run db:seed` so the trusted payees use them.
3. Webhooks need a public HTTPS URL. Locally, run a tunnel (e.g. `ngrok http 3000`), then register it:
   ```bash
   npm run paypal:webhook -- https://your-tunnel.example
   ```
   Put the printed ID in `PAYPAL_WEBHOOK_ID`. Without webhooks, Haven still updates payout statuses by polling PayPal while screens are open.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Render, the database's internal URL (set automatically by the blueprint). |
| `DATABASE_SSL` | no | `true` when connecting to Render's *external* database URL from elsewhere. |
| `TEST_DATABASE_URL` | no | A throwaway database for integration tests (it is wiped). Without it those tests are skipped. |
| `OPENAI_API_KEY` | yes | OpenAI API key. |
| `OPENAI_PARSE_MODEL` | no | Model for parsing requests. Default `gpt-6-luna` (fast). |
| `OPENAI_RISK_MODEL` | no | Model for risk assessment. Default `gpt-6.1-sol`. |
| `PAYPAL_CLIENT_ID` | yes | PayPal sandbox app client ID. |
| `PAYPAL_CLIENT_SECRET` | yes | PayPal sandbox app secret. |
| `PAYPAL_API_BASE` | no | Default `https://api-m.sandbox.paypal.com`. |
| `PAYPAL_WEBHOOK_ID` | for webhooks | ID of the registered webhook, used for signature verification. |
| `SANDBOX_EMAIL_MARIA`, `SANDBOX_EMAIL_JOE`, `SANDBOX_EMAIL_LINDA` | recommended | Sandbox Personal account emails for the seeded trusted payees. |
| `DEMO_TIME_ZONE` | no | Margaret's time zone for "today" in the daily limit. Default `America/New_York`. |
| `DEMO_RESET_TOKEN` | no | Enables `POST /api/admin/reset-demo` with `Authorization: Bearer <token>`. |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode. |
| `npm run db:setup` | Apply migrations; seed demo data only if the database is empty. |
| `npm run db:seed` | **Reset** the database to the demo state (run before each demo). |
| `npm test` | Run the test suite. |
| `RUN_LIVE_AI=1 npm test -- ai-live` | Also run tests against the real OpenAI API. |
| `npm run try -- "Send Maria $85"` | Talk to the pipeline in the terminal (real AI, nothing is sent). |
| `npm run paypal:smoke` | Send a real $1 sandbox payout to Maria and watch it settle (`-- --webhook` to rely on webhooks only). |
| `npm run paypal:webhook -- <https url>` | Register the PayPal webhook for a host and print its ID. |

## Deploying on Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, select the repository. Render reads `render.yaml` and creates the `haven` web service and the `haven-db` Postgres database.
3. Fill in the secrets it prompts for: `OPENAI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `SANDBOX_EMAIL_*`. Leave `PAYPAL_WEBHOOK_ID` empty for now.
4. After the first deploy (migrations and demo data run automatically on start), register the webhook with Render's public URL, from your machine:
   ```bash
   npm run paypal:webhook -- https://<your-service>.onrender.com
   ```
   Set the printed ID as `PAYPAL_WEBHOOK_ID` in the service's **Environment** tab (Render redeploys).
5. To reset the demo data on Render (no shell on the free plan), copy `DEMO_RESET_TOKEN` from the Environment tab and run:
   ```bash
   curl -X POST https://<your-service>.onrender.com/api/admin/reset-demo -H "Authorization: Bearer <token>"
   ```

**Free plan caveats.** The free web service sleeps after 15 minutes without traffic and takes about a minute to wake, so open the app a minute before demoing. A free Postgres database **expires 30 days after it is created** (with a 14-day grace period to upgrade), so either create it within 30 days of when it needs to be live, or use a paid database plan.

## Testing

```bash
npm test
```

209 tests cover the rules engine (every limit at its boundary, time zones, which statuses count), the scam check, payee matching, the combine logic (every rules/AI pairing), AI output validation and grounding, yes/no interpretation, PayPal response handling, and integration tests against Postgres for the full conversation flow, the three demo scenarios, payouts and webhook handling (with a fake PayPal), and caregiver approve/decline and rules.

## Known limitations

- **Haven only protects payments made through Haven.** It doesn't see or block the senior's other PayPal activity, bank transfers, gift-card purchases or cash.
- **The known-scam list is hardcoded** (a few fictional entries in `lib/scam/hardcoded-source.ts`). `checkScamList()` sits behind a `ScamSource` interface so a real data source can be swapped in without changing callers.
- **Sandbox only.** Payments use PayPal sandbox money. Payouts to an email with no PayPal account stay "unclaimed" (Haven keeps them as in-flight); PayPal returns them after 30 days.
- **Webhook simulator events can't be verified.** PayPal's dashboard simulator events fail signature verification, so Haven rejects them; use real sandbox payouts.
- **No authentication.** One hardcoded caregiver and senior, switched by the demo toggle. Anyone with the URL can use the caregiver pages: approve held payments, change rules and read transcripts. This is a sandbox-only demo; real use needs caregiver login.
- **Rate limiting is basic.** `/api/converse` allows 20 turns per minute per IP and 300 per hour in total, kept in memory. Set a spending cap on the OpenAI key as well.
- **Single server instance.** Turns within one conversation are serialized in memory, which assumes one process (true on Render's free plan). Payment sending is still protected by a database-level claim.
- **Voice depends on the browser.** Speech recognition works in Chrome, Edge and Safari (Safari needs Dictation enabled), not Firefox; typing is always available. Browser speech recognition may send audio to the browser vendor's speech service.
- **AI output can vary between runs.** The decision is safe regardless (it can only be made stricter by the AI), but wording and risk levels for borderline cases may differ.
- **Rare network edge case.** If both the first attempt to create a payout and its automatic retry fail with network errors, the payment is marked failed even though PayPal may have accepted it. The stored batch ID can be checked in the PayPal dashboard.

## License

[MIT](LICENSE)
