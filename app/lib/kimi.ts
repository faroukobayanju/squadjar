// Kimi (Moonshot) over its OpenAI-compatible chat completions API, server only. docs/kimi-notes.md has the details.
// Every call returns null on a missing key, timeout, HTTP error or unexpected shape, so callers fall back to templates.
import type { Lang } from "./i18n/core";
import { normalizeDraft, type DraftReply } from "./kimi-draft";

const KEY = process.env.KIMI_API_KEY;
const MODEL = process.env.KIMI_MODEL || "kimi-k2.6";
const BASE = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/$/, "");
const TIMEOUT_MS = 8000;

export const kimiConfigured = () => !!KEY;

export const LANG_NAME: Record<Lang, string> = { en: "English", pcm: "Nigerian Pidgin", yo: "Yoruba", ig: "Igbo", ha: "Hausa" };

const RULES = `Squadjar is a rotating savings app for Nigerians: a squad of 3 to 20 members each pays a fixed contribution every round, and one member (the collector) gets the whole payout. Money is in naira (₦).
Use only these words for things: squad, member, organizer, contribution, round, payout, collector, turn, deposit, jar, trust score, naira balance.
Never write any of these words, in any language: wallet, crypto, token, gas, transaction, blockchain, stake, address, default.`;

type Message = { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };

async function chat(body: object): Promise<Message | null> {
  if (!KEY) return null;
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      // Thinking off: these are short structured replies and the 8s budget can't fit a reasoning pass.
      // `thinking` is a Moonshot-only switch; other OpenAI-compatible hosts of Kimi (e.g. OpenRouter's free
      // moonshotai/kimi-k2:free) reject or ignore unknown fields, so only send it to Moonshot.
      body: JSON.stringify({ model: MODEL, ...(BASE.includes("moonshot") ? { thinking: { type: "disabled" } } : {}), ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      console.error("kimi: http", r.status);
      return null;
    }
    const j = (await r.json()) as { choices?: { message?: Message }[] };
    return j.choices?.[0]?.message ?? null;
  } catch (e) {
    console.error("kimi: failed", e instanceof Error ? e.name : e);
    return null;
  }
}

const DRAFT_TOOL = {
  type: "function",
  function: {
    name: "draftSquad",
    description: "Fill the start-a-squad form from what the person said. Leave out any field they did not say or clearly imply.",
    parameters: {
      type: "object",
      properties: {
        contribution: { type: "integer", description: "Whole naira each member pays per round. '5k' = 5000. At least 100." },
        size: { type: "integer", description: "Number of members including the person, 3 to 20. 'We be 8' or '8 of us' = 8." },
        period: { type: "string", enum: ["Weekly", "Monthly", "Demo"], description: "How often a round comes. A weekday ('every Friday') means Weekly. Demo only if they ask for a demo or test." },
        name: { type: "string", description: "Squad name if they gave one, at most 40 characters." },
        due: {
          type: "object",
          description: "When each round's contribution is due, if they said.",
          properties: {
            weekday: { type: "integer", description: "Weekly only. 0 Sunday, 1 Monday ... 5 Friday, 6 Saturday." },
            monthDay: { type: "integer", description: "Monthly only. Day of the month, 1 to 28." },
            hour: { type: "integer", description: "Hour of day, 0 to 23, Nigeria time. Leave out if not said." },
          },
        },
        followUp: { type: "string", description: "At most one short question, in the person's language, only if contribution, size or period is missing or unclear." },
        warnings: { type: "array", items: { type: "string" }, description: "Short notes in the person's language, e.g. an amount under ₦100 or more than 20 people. Usually empty." },
      },
    },
  },
} as const;

/** The draft agent. Null draft on any failure; the screen then uses the pattern parser. */
export async function draftSquad(text: string, lang: Lang): Promise<DraftReply> {
  const m = await chat({
    messages: [
      {
        role: "system",
        content: `${RULES}\nYou turn a short description into the start-a-squad form by calling draftSquad exactly once. You never create the squad; the person checks the form. The person may write in English, Nigerian Pidgin, Yoruba, Igbo or Hausa. Write followUp and warnings in ${LANG_NAME[lang]}.`,
      },
      { role: "user", content: text },
    ],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "function", function: { name: "draftSquad" } },
    max_tokens: 400,
  });
  const call = m?.tool_calls?.find((c) => c.function?.name === "draftSquad");
  if (!call?.function?.arguments) return { draft: null, warnings: [] };
  try {
    return normalizeDraft(JSON.parse(call.function.arguments));
  } catch {
    return { draft: null, warnings: [] };
  }
}

/** One short message written from `facts`, or null. Callers still run it through cleanMessage. */
export async function writeMessage(task: string, facts: object, lang: Lang): Promise<string | null> {
  const m = await chat({
    messages: [
      { role: "system", content: `${RULES}\n${task} Write in ${LANG_NAME[lang]}. Warm, plain, no hashtags, no quotes around it. Include the pay link exactly as given. Reply with the message only.` },
      { role: "user", content: JSON.stringify(facts) },
    ],
    max_tokens: 200,
  });
  return m?.content ?? null;
}
