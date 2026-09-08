# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single household's residents, tracking their own shared home expenses privately. Not a multi-tenant product — there is one household's data, not many households each with their own account.

## Product Purpose

Gestione Casa ("household management") lets the household log every expense as it happens and see where the money goes. Success is a fast, frictionless record of spending (`Andamento`, expense entries) and clear, accurate aggregate views (`Statistiche`) over that record — not budgeting advice, forecasting, or bank integration.

## Positioning

A personal tool built to fit this one household's real spending shape exactly, not a generic budgeting app with configurable categories. The fixed Italian category set (`spesa` grocery, `carburante` fuel, `bolletta` utility bill, `casa` house/other) is a deliberate constraint, not a limitation to design around — matching the household's actual habits beats flexibility a single household will never use.

## Operating Context

- Primary job: quick expense logging on the go, right after a purchase or bill — a phone-first interaction, not a desktop review session. The app is installable as a PWA (`manifest.webmanifest`, icon set from 72px–512px, standalone display) for exactly this reason.
- Secondary job: periodic review of statistics (`Spese medie` / average spend, `Spese frequenti` / frequent expenses, per-category bar breakdowns) to understand spending patterns over time.
- Currently mid-migration from a legacy Angular + Koa/TypeORM stack (`gc-frontend` + `gc-server`) to this Bun/React/Elysia stack, run side by side during the transition. See the root and `gestione-casa` `CLAUDE.md` for the full migration and cross-repo contract.

## Capabilities and Constraints

- Domain vocabulary is Italian and shared verbatim across the legacy and new stacks: `Andamento` (expense entry), `TipoSpesa` (expense category), `Utente` (user), `Token`.
- Expense-category IDs are hardcoded and load-bearing: statistics group by `1=spesa, 2=carburante, 3=bolletta, 7=casa`, and the `/statistiche/{spesa|carburante|bolletta|casa}` routes mirror exactly that set. Changing a category means editing both the API aggregation and every web view together.
- Auth is cookie-based (httpOnly access/refresh JWTs with refresh-token rotation); only login and registration are unauthenticated.
- No stated i18n requirement beyond staying Italian for now — not confirmed as a permanent English-never constraint, just the current and only implemented language.

## Brand Commitments

Product name "Gestione Casa" (also the PWA short name). Theme/background color `#7FC1AD` (sage green) is set in the web manifest and is the only confirmed brand color so far.

## Evidence on Hand

None gathered yet — no testimonials, case studies, or usage data on hand. Future work must not fabricate any.

## Product Principles

1. Fit this one household's real habits over generic configurability — fixed categories and Italian-only UI are intentional, not gaps.
2. Logging must stay fast and phone-first; anything that adds friction to recording an expense works against the product's core job.
3. Statistics must be accurate and trustworthy above all — they're read to understand real spending, not decorative.
4. Preserve behavioral and vocabulary parity with the legacy stack throughout the migration; the two must stay interchangeable in what they mean, even as the implementation changes.
