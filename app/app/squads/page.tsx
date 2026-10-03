"use client";

import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { SquadListSkeleton } from "@/components/skeleton";
import { useSquads } from "@/lib/data";

export default function Squads() {
  const squads = useSquads();
  return (
    <AppShell>
      <h1 className="mb-6 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">Squads</h1>
      {squads ? <SquadList squads={squads} /> : <SquadListSkeleton />}
    </AppShell>
  );
}
