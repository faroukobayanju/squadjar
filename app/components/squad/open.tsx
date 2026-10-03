"use client";

import { WhatsappLogo } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { AutopayToggle } from "@/components/autopay-toggle";
import { KNOWN } from "@/lib/errors";
import { naira } from "@/lib/format";
import { useOrigin } from "@/lib/origin";
import { ME, isLive, useActions, useInviteCode, type Squad } from "@/lib/data";
import { ConfirmButton, DEPOSIT_WINDOW, ErrorNote, GHOST_BTN, INK_BTN, SquadTitle, useRun } from "./ui";

/** Open, and I'm in it: invite, then the organizer starts (3+ members). */
export function OpenView({ squad }: { squad: Squad }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const code = useInviteCode(squad.slug, true);
  const origin = useOrigin();
  const organizer = squad.organizerId === ME;
  const canStart = isLive && organizer && squad.members.length >= 3;
  const short = Math.max(0, 3 - squad.members.length);
  const seatsLeft = squad.maxMembers - squad.members.length;

  // Live invites carry the code; without it the link would only show "this invite doesn't work".
  const link = isLive ? (code ? `${origin}/s/${squad.slug}?code=${code}` : null) : `${origin}/s/${squad.slug}`;
  const text = `Join "${squad.name}" on Squadjar: ${naira(squad.contribution)} each ${squad.period.toLowerCase()}, ${squad.maxMembers} of us. Nobody holds the jar. ${link}`;
  const invite = link && seatsLeft > 0 && `https://wa.me/?text=${encodeURIComponent(text)}`;

  const noLink = isLive && code === null;

  const action = canStart ? (
    <ConfirmButton
      label="Start squad"
      busyLabel="Starting…"
      body={`Turns get fixed now. Everyone then has ${DEPOSIT_WINDOW[squad.period]} to lock their deposit.`}
      busy={busy}
      className={INK_BTN}
      onConfirm={() => run(() => actions.start(squad.slug))}
    />
  ) : invite ? (
    <a href={invite} target="_blank" rel="noreferrer" className={`${INK_BTN} gap-2`}>
      <WhatsappLogo size={22} weight="fill" aria-hidden />
      Invite on WhatsApp
    </a>
  ) : null;

  return (
    <AppShell action={action}>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        Open · {naira(squad.contribution)} each · {squad.period} · {squad.members.length} of {squad.maxMembers} joined
      </p>
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {short > 0 ? `Invite ${short} more to start.` : organizer ? "Ready when you are." : "Waiting for the organizer to start."}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        Turns are set when you start: people with the best payment record go first. Everyone then locks a refundable deposit.
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {squad.members.map((m) => (
          <li key={m.id} className="flex min-h-12 items-center justify-between px-4">
            <span className="font-semibold">
              {m.id === ME ? (m.id === squad.organizerId ? "You (organizer)" : "You") : m.id === squad.organizerId ? `${m.name} (organizer)` : m.name}
            </span>
            <span className="font-mono text-xs text-stamp">{m.tier}</span>
          </li>
        ))}
        {Array.from({ length: seatsLeft }, (_, i) => (
          <li key={`empty-${i}`} className="flex min-h-12 items-center px-4 text-muted">
            Open seat
          </li>
        ))}
      </ul>

      {noLink && <p className="mt-5 text-sm text-muted">Invite link isn&apos;t ready yet. Try again in a moment.</p>}

      {canStart && invite && (
        <a
          href={invite}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-12 items-center gap-2 font-semibold text-ink underline decoration-rule decoration-2 hover:decoration-ink"
        >
          <WhatsappLogo size={20} aria-hidden />
          Invite more on WhatsApp
        </a>
      )}

      <AutopayToggle squad={squad} />

      {isLive && (
        <div className="mt-10">
          <ErrorNote error={error} />
          {organizer ? (
            <ConfirmButton
              label="Cancel squad"
              busyLabel="Cancelling…"
              body="The squad closes for everyone. Nobody has paid in yet."
              busy={busy}
              className={GHOST_BTN}
              onConfirm={() => run(() => actions.cancel(squad.slug))}
            />
          ) : (
            <ConfirmButton
              label="Leave squad"
              busyLabel="Leaving…"
              body="You can leave any time before the squad starts. It doesn't affect your trust score."
              busy={busy}
              className={GHOST_BTN}
              onConfirm={() => run(() => actions.leave(squad.slug))}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

/** Open, and I'm not in it yet: join with the code from the invite link. */
export function JoinView({ squad, code }: { squad: Squad; code?: string }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const seatsLeft = squad.maxMembers - squad.members.length;
  const blocked = !code ? KNOWN.BadInvite : seatsLeft <= 0 ? KNOWN.Full : null;

  return (
    <AppShell
      action={
        !blocked && (
          <button type="button" disabled={busy} onClick={() => run(() => actions.join(squad.slug, code!))} className={INK_BTN}>
            {busy ? "Joining…" : error ? "Retry" : "Join squad"}
          </button>
        )
      }
    >
      <SquadTitle squad={squad} meta="Open" />
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left of ${squad.maxMembers}.` : "Every seat is taken."}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        Each round everyone pays {naira(squad.contribution)} into the jar and one person collects {naira(squad.contribution * squad.maxMembers)}.
        When the squad starts you lock a refundable deposit.
      </p>
      <div className="mt-8">
        {blocked ? (
          <p role="status" className="rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {blocked}
          </p>
        ) : (
          <ErrorNote error={error} />
        )}
      </div>
    </AppShell>
  );
}
