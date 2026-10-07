"use client";

import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { SquadListSkeleton } from "@/components/skeleton";
import { useSquads } from "@/lib/data";
import { useT } from "@/lib/i18n";

export default function Squads() {
  const squads = useSquads();
  const t = useT();
  return (
    <AppShell>
      <h1 className="mb-6 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">{t("squads")}</h1>
      {squads ? <SquadList squads={squads} /> : <SquadListSkeleton />}
    </AppShell>
  );
}
