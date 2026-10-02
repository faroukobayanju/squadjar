"use client";

import { AppShell } from "@/components/shell";
import { SquadList } from "@/components/squad-list";
import { useStore } from "@/lib/store";

export default function Squads() {
  const squads = useStore((s) => s.squads);
  return (
    <AppShell>
      <h1 className="mb-6 font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em]">Squads</h1>
      <SquadList squads={squads} />
    </AppShell>
  );
}
