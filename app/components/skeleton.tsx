"use client";

import { useT } from "@/lib/i18n";

/** Static placeholder block in rule tone. No shimmer: the stamp thunk is the app's only authored motion (DESIGN.md). */
export function Bar({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-md bg-rule ${className}`} />;
}

/** Placeholder rows shaped like SquadList rows. */
export function SquadListSkeleton({ rows = 2 }: { rows?: number }) {
  const t = useT();
  return (
    <ul className="grid gap-3" aria-busy="true" aria-label={t("loadingSquads")}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="rounded-lg border border-rule bg-paper px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <Bar className="h-6 w-40" />
            <Bar className="h-6 w-16" />
          </div>
          <Bar className="mt-3 h-4 w-32" />
          <Bar className="mt-3 h-3 w-full" />
        </li>
      ))}
    </ul>
  );
}
