// The four "how Squadjar works" cards: one source for the landing grid and the /intro swipe deck.
export const HOW_IT_WORKS = [
  { title: "Save together, nobody holds the money", body: "Everyone pays the same contribution each round into the squad's jar. No member can touch it." },
  { title: "Everyone gets a turn", body: "Each round one member is the collector and gets the whole jar. Turns are set when the squad starts, best payment record first." },
  { title: "Your deposit protects the squad", body: "Everyone locks a refundable deposit. If someone misses, the deposit covers it so the collector is still paid in full. It comes back at the end." },
  { title: "Pay on time, earn trust", body: "On-time payments raise your trust score, which unlocks earlier turns and smaller deposits. Quick demo squads don't count." },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {HOW_IT_WORKS.map((c, i) => (
        <li key={c.title} className="rounded-lg border border-rule bg-paper p-5">
          <span className="font-mono text-xs text-stamp">{i + 1} of {HOW_IT_WORKS.length}</span>
          <h3 className="mt-2 font-display text-xl leading-tight font-extrabold tracking-[-0.02em]">{c.title}</h3>
          <p className="mt-2 text-muted">{c.body}</p>
        </li>
      ))}
    </ol>
  );
}
