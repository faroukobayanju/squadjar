"use client";

import { useT } from "@/lib/i18n";

// The four "how Squadjar works" cards: one source for the landing grid and the /intro swipe deck.
export const HOW_IT_WORKS = [
  { title: "how1Title", body: "how1Body" },
  { title: "how2Title", body: "how2Body" },
  { title: "how3Title", body: "how3Body" },
  { title: "how4Title", body: "how4Body" },
] as const;

export function HowItWorks() {
  const t = useT();
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {HOW_IT_WORKS.map((c, i) => (
        <li key={c.title} className="rounded-lg border border-rule bg-paper p-5">
          <span className="font-mono text-xs text-stamp">{t("stepOf", { n: i + 1, total: HOW_IT_WORKS.length })}</span>
          <h3 className="mt-2 font-display text-xl leading-tight font-extrabold tracking-[-0.02em]">{t(c.title)}</h3>
          <p className="mt-2 text-muted">{t(c.body)}</p>
        </li>
      ))}
    </ol>
  );
}
