# Kimi notes

Checked against platform.kimi.ai/docs/api/chat (platform.moonshot.ai redirects there) on 2026-10-06.

- **API:** OpenAI-compatible `POST {KIMI_BASE_URL}/chat/completions`, `Authorization: Bearer $KIMI_API_KEY`. Called with `fetch` (no SDK) from `app/lib/kimi.ts`, 8s timeout (`AbortSignal.timeout`).
- **Base URL:** `https://api.moonshot.ai/v1` (default). Accounts on the China platform use `https://api.moonshot.cn/v1`; set `KIMI_BASE_URL`.
- **Model:** `kimi-k2.6` (default, `KIMI_MODEL` overrides). Listed models at the time: `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k3`. Only k2.6 can turn thinking off (`"thinking": {"type": "disabled"}`); k2.7-code and k3 always think, which doesn't fit the 8s budget. If you switch models, drop the `thinking` field in `chat()` if the API rejects it.
- **Tools:** `tools: [{ type: "function", function: { name, description, parameters } }]`, `tool_choice` accepts `"auto" | "none" | "required"` or `{ type: "function", function: { name } }`. The reply has `choices[0].message.tool_calls[].function.arguments` as a JSON string.

## How Squadjar uses it

- **Draft** (`POST /api/kimi/draft`): one call forcing the `draftSquad` tool. Its args carry the form fields plus `followUp` and `warnings` (both in the user's language), so there is no second round trip. `lib/kimi-draft.ts` validates the args (contribution integer >= 100, size 3 to 20, period Demo/Weekly/Monthly, due weekday 0-6 / monthDay 1-28 / hour 0-23) and drops any text with a banned word. Anything wrong: `{ draft: null, warnings }`, and the screen uses the pattern parser (`lib/draft.ts`).
- **Remind** (`POST /api/squads/[slug]/remind`) and **nudges** (`GET /api/cron/nudge`): plain completions written from facts we read on chain. `cleanMessage` rejects banned words and over-long text and appends the pay link if Kimi left it out; a rejected or missing message falls back to the dictionary template (`remindText`, `nudgeSoon`, `nudgeLate`) in the reader's language.
- The spec's `lookupTrust`, `getSquadState` and `getMemberHistory` tools were not built: the server already has the facts and passes them in the prompt, which saves a round trip inside the 8s budget.

## Nudge stages

`lib/nudge-plan.ts`. Weekly/Monthly: `t24h` within 24h of the deadline, `t1h` within 1h. Demo: T-2m and T-30s. `missed` is sent after the deadline while grace is still open (the last chance to pay before it counts as a miss); after grace the round settles and nothing is sent. One row per (member, squad, round, stage, channel) in `notifications`; in-app only (`GET /api/notifications`, the bell on Home). No email provider yet.

## Acceptance

`node lib/kimi-draft.check.ts` covers "8 of us, 5k every Friday" and "We be 8, 5k every Friday" as tool args. Run the real model with `KIMI_API_KEY` set in `.env.local`.
