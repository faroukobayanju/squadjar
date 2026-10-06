"use client";

import { WhatsappLogo } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { AutopayToggle } from "@/components/autopay-toggle";
import { KNOWN } from "@/lib/errors";
import { MIN_TIER_LABEL, naira } from "@/lib/format";
import { TIERS } from "@/lib/chain-map";
import { useOrigin } from "@/lib/origin";
import { ME, isLive, useActions, useInviteCode, useJoinRequests, useMe, useRecords, type PublicTerms, type Squad } from "@/lib/data";
import { useMyAccount } from "@/lib/live/account";
import { RECORD_BLOCKED, blockedByRecord, recordLine, stoppedLine } from "@/lib/record-line";
import { ConfirmButton, DEPOSIT_WINDOW, ErrorNote, GHOST_BTN, INK_BTN, PAID_LABEL, SquadTitle, useRun } from "./ui";

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
  const { address: myAddr } = useMyAccount();
  const idOf = (id: string) => (id === ME ? (myAddr ?? ME) : id).toLowerCase();
  const records = useRecords(squad.members.map((m) => idOf(m.id)));

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
          <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0">
              <span className="block font-semibold">
                {m.id === ME ? (m.id === squad.organizerId ? "You (organizer)" : "You") : m.id === squad.organizerId ? `${m.name} (organizer)` : m.name}
              </span>
              <StoppedNote line={stoppedLine(records?.[idOf(m.id)])} />
            </span>
            <span className="shrink-0 font-mono text-xs text-stamp">{m.tier}</span>
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

      {isLive && organizer && squad.pub?.approval && <JoinRequestList slug={squad.slug} />}

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

/** The red "Stopped paying in N squads" line; nothing when they never stopped. */
function StoppedNote({ line }: { line: string | null }) {
  return line ? <span className="block text-sm font-semibold text-bad">{line}</span> : null;
}

const PILL_BTN = "min-h-11 rounded-full border-[1.5px] border-ink px-4 text-sm font-semibold disabled:opacity-40";

/** Organizer of a public squad that approves each person: accept or decline, polled. */
function JoinRequestList({ slug }: { slug: string }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const requests = useJoinRequests(slug, true)?.requests;
  if (!requests) return null;
  return (
    <section aria-labelledby="requests" className="mt-8">
      <h2 id="requests" className="font-semibold">
        Join requests
      </h2>
      <ErrorNote error={error} />
      {requests.length ? (
        <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper">
          {requests.map((r) => (
            <li key={r.member} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{r.name}</span>
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full border-[1.5px] border-rule px-2 font-mono text-xs text-muted">
                    {TIERS[r.tier] ?? "New"}
                  </span>
                </span>
                <span className="block font-mono text-xs text-muted tnum">{recordLine(r.record)}</span>
                <StoppedNote line={stoppedLine(r.record)} />
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => actions.decideRequest(slug, r.member, "declined"))} className={PILL_BTN}>
                  Decline
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => actions.decideRequest(slug, r.member, "accepted"))}
                  className={`${PILL_BTN} bg-ink text-manila`}
                >
                  Accept
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No requests waiting.</p>
      )}
    </section>
  );
}

/** Open public squad, I'm not in it and came without a code: its terms, then join, request, or why not. */
export function PublicJoinView({ squad, pub }: { squad: Squad; pub: PublicTerms }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const me = useMe();
  const status = useJoinRequests(squad.slug, pub.approval)?.status;
  const seatsLeft = squad.maxMembers - squad.members.length;
  const tooLow = me ? TIERS.indexOf(me.tier) < pub.minTier : false;
  const { address: myAddr } = useMyAccount();
  const mine = useRecords(myAddr ? [myAddr] : [])?.[myAddr?.toLowerCase() ?? ""];
  const closed = !!mine && blockedByRecord(mine);
  const join = (label: string) => (
    <button type="button" disabled={busy} onClick={() => run(() => actions.joinPublic(squad.slug))} className={INK_BTN}>
      {busy ? (label === "Join squad" ? "Joining…" : "Sending…") : error ? "Retry" : label}
    </button>
  );

  const action =
    seatsLeft <= 0 || !me || tooLow || closed ? null : !pub.approval || status === "accepted" ? (
      join("Join squad")
    ) : status === null ? (
      join("Request to join")
    ) : status === "pending" ? (
      <p className={PAID_LABEL}>Request sent</p>
    ) : status === "declined" ? (
      <p className={PAID_LABEL}>Not accepted</p>
    ) : null;

  const who = pub.minTier === 0 ? "Open to anyone." : pub.minTier === 1 ? "For Building members and up." : "For Reliable members only.";

  return (
    <AppShell action={action}>
      <SquadTitle squad={squad} meta="Open" />
      {pub.description && <p className="mt-4 max-w-[38ch]">{pub.description}</p>}
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left of ${squad.maxMembers}.` : "Every seat is taken."}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        Each round everyone pays {naira(squad.contribution)} into the jar and one person collects {naira(squad.contribution * squad.maxMembers)}.
        When the squad starts you lock a refundable deposit.
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        <li className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span className="font-semibold">Minimum tier</span>
          <span className="font-mono text-xs">{MIN_TIER_LABEL[pub.minTier]}</span>
        </li>
        <li className="flex min-h-12 items-center px-4 text-sm text-muted">
          {who} {pub.approval ? "The organizer approves each person." : "Join straight away."}
        </li>
      </ul>
      <div className="mt-8">
        {seatsLeft <= 0 ? (
          <p role="status" className="rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {KNOWN.Full}
          </p>
        ) : closed ? (
          <p role="status" className="rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {RECORD_BLOCKED}
          </p>
        ) : tooLow ? (
          <p role="status" className="rounded-md border border-rule bg-paper px-4 py-3 text-sm">
            This squad is for {pub.minTier === 1 ? "Building members and up" : "Reliable members"}. Pay on time in your squads to grow your trust score.
          </p>
        ) : (
          <ErrorNote error={error} />
        )}
      </div>
    </AppShell>
  );
}
