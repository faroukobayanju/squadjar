"use client";

import { WhatsappLogo } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { AutopayToggle } from "@/components/autopay-toggle";
import { naira } from "@/lib/format";
import { useOrigin } from "@/lib/origin";
import { ME, isLive, useActions, useInviteCode, useRecords, type Squad } from "@/lib/data";
import { useMyAccount } from "@/lib/live/account";
import { stoppedLine } from "@/lib/record-line";
import { useT } from "@/lib/i18n";
import { ConfirmButton, ErrorNote, GHOST_BTN, INK_BTN, SquadTitle, useRun } from "./ui";

/** Open, and I'm in it: invite, then the organizer starts (3+ members). */
export function OpenView({ squad }: { squad: Squad }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const t = useT();
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
  const text = t("inviteText", { name: squad.name, amount: naira(squad.contribution), period: t(`period${squad.period}`).toLowerCase(), count: squad.maxMembers, link: link ?? "" });
  const invite = link && seatsLeft > 0 && `https://wa.me/?text=${encodeURIComponent(text)}`;

  const noLink = isLive && code === null;

  const action = canStart ? (
    <ConfirmButton
      label={t("startSquadBtn")}
      busyLabel={t("starting")}
      body={t("startBody")}
      busy={busy}
      className={INK_BTN}
      onConfirm={() => run(() => actions.start(squad.slug))}
    />
  ) : invite ? (
    <a href={invite} target="_blank" rel="noreferrer" className={`${INK_BTN} gap-2`}>
      <WhatsappLogo size={22} weight="fill" aria-hidden />
      {t("inviteWhatsApp")}
    </a>
  ) : null;

  return (
    <AppShell action={action}>
      <h1 className="font-display text-[2.1rem] leading-none font-extrabold tracking-[-0.03em] text-balance">{squad.name}</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        {t("metaOpenJoined", { amount: naira(squad.contribution), period: t(`period${squad.period}`), count: squad.members.length, max: squad.maxMembers })}
      </p>
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {short > 0 ? t("inviteMore", { n: short }) : organizer ? t("readyWhenYouAre") : t("waitingOrganizer")}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        {t("turnsSetBody")}
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        {squad.members.map((m) => (
          <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0">
              <span className="block font-semibold">
                {m.id === ME ? (m.id === squad.organizerId ? t("youOrganizer") : t("you")) : m.id === squad.organizerId ? t("nameOrganizer", { name: m.name }) : m.name}
              </span>
              <StoppedNote line={stoppedLine(records?.[idOf(m.id)], t)} />
            </span>
            <span className="shrink-0 font-mono text-xs text-stamp">{t(`tier${m.tier}`)}</span>
          </li>
        ))}
        {Array.from({ length: seatsLeft }, (_, i) => (
          <li key={`empty-${i}`} className="flex min-h-12 items-center px-4 text-muted">
            {t("openSeat")}
          </li>
        ))}
      </ul>

      {noLink && <p className="mt-5 text-sm text-muted">{t("linkNotReady")}</p>}

      {canStart && invite && (
        <a
          href={invite}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-12 items-center gap-2 font-semibold text-ink underline decoration-rule decoration-2 hover:decoration-ink"
        >
          <WhatsappLogo size={20} aria-hidden />
          {t("inviteMoreWhatsApp")}
        </a>
      )}

      <AutopayToggle squad={squad} />

      {isLive && (
        <div className="mt-10">
          <ErrorNote error={error} />
          {organizer ? (
            <ConfirmButton
              label={t("cancelSquad")}
              busyLabel={t("cancelling")}
              body={t("cancelBodyOpen")}
              busy={busy}
              className={GHOST_BTN}
              onConfirm={() => run(() => actions.cancel(squad.slug))}
            />
          ) : (
            <ConfirmButton
              label={t("leaveSquad")}
              busyLabel={t("leaving")}
              body={t("leaveBody")}
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
  const t = useT();
  const seatsLeft = squad.maxMembers - squad.members.length;
  const blocked = !code ? t("errBadInvite") : seatsLeft <= 0 ? t("errFull") : null;

  return (
    <AppShell
      action={
        !blocked && (
          <button type="button" disabled={busy} onClick={() => run(() => actions.join(squad.slug, code!))} className={INK_BTN}>
            {busy ? t("joining") : error ? t("retry") : t("joinSquad")}
          </button>
        )
      }
    >
      <SquadTitle squad={squad} meta={t("metaOpen")} />
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {seatsLeft > 0 ? t(seatsLeft === 1 ? "seatsLeftOne" : "seatsLeftMany", { n: seatsLeft, max: squad.maxMembers }) : t("everySeatTaken")}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        {t("joinBody", { amount: naira(squad.contribution), payout: naira(squad.contribution * squad.maxMembers) })}
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
