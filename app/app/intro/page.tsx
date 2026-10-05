"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HOW_IT_WORKS } from "@/components/how-it-works";
import { safeNext } from "@/lib/next";

export default function Intro() {
  return (
    <Suspense>
      <Deck />
    </Suspense>
  );
}

function Deck() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next") ?? undefined);
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const last = i === HOW_IT_WORKS.length - 1;

  useEffect(() => {
    try {
      localStorage.setItem("squadjar-intro-seen", "1");
    } catch {}
  }, []);

  const go = () => router.replace(next);
  function advance() {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: (i + 1) * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-4 pt-4 pb-8">
      <div className="flex h-12 items-center justify-between">
        <span className="font-display text-xl font-extrabold tracking-[-0.03em]">Squadjar</span>
        <button type="button" onClick={go} className="inline-flex min-h-12 items-center px-1 font-semibold text-muted underline">
          Skip
        </button>
      </div>
      <div
        ref={track}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="mt-6 flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HOW_IT_WORKS.map((c, n) => (
          <section key={c.title} aria-label={`${n + 1} of ${HOW_IT_WORKS.length}`} className="flex w-full shrink-0 snap-center flex-col justify-center pr-1">
            <div className="rounded-lg border border-rule bg-paper p-6">
              <span className="font-mono text-xs text-stamp">{n + 1} of {HOW_IT_WORKS.length}</span>
              <h1 className="mt-3 font-display text-[2rem] leading-[1] font-extrabold tracking-[-0.03em] text-balance">{c.title}</h1>
              <p className="mt-4 text-lg text-muted">{c.body}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-2" aria-hidden>
        {HOW_IT_WORKS.map((c, n) => (
          <span key={c.title} className={`h-2 w-2 rounded-full ${n === i ? "bg-ink" : "bg-rule"}`} />
        ))}
      </div>
      <button type="button" onClick={last ? go : advance} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-lg bg-ink font-semibold text-manila active:scale-[0.98]">
        {last ? "Done" : "Next"}
      </button>
    </div>
  );
}
