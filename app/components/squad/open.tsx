"use client";

import { WhatsappLogo } from "@phosphor-icons/react";
import { AppShell } from "@/components/shell";
import { AutopayToggle } from "@/components/autopay-toggle";
import { MIN_TIER_KEY, naira } from "@/lib/format";
import { TIERS } from "@/lib/chain-map";
import { useOrigin } from "@/lib/origin";
import { ME, isLive, useActions, useInviteCode, useJoinRequests, useMe, useRecords, type PublicTerms, type Squad } from "@/lib/data";
import { useMyAccount } from "@/lib/live/account";
import { blockedByRecord, recordLine, stoppedLine } from "@/lib/record-line";
import { useT } from "@/lib/i18n";
import { ConfirmButton, DEPOSIT_WINDOW, ErrorNote, GHOST_BTN, INK_BTN, PAID_LABEL, SquadTitle, useRun } from "./ui";

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
      body={t("startBody", { window: t(DEPOSIT_WINDOW[squad.period]) })}
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

      {isLive && organizer && squad.pub?.approval && <JoinRequestList slug={squad.slug} />}

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

const PILL_BTN = "min-h-11 rounded-full border-[1.5px] border-ink px-4 text-sm font-semibold disabled:opacity-40";

/** Organizer of a public squad that approves each person: accept or decline, polled. */
function JoinRequestList({ slug }: { slug: string }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const requests = useJoinRequests(slug, true)?.requests;
  const t = useT();
  if (!requests) return null;
  return (
    <section aria-labelledby="requests" className="mt-8">
      <h2 id="requests" className="font-semibold">
        {t("joinRequests")}
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
                    {t(`tier${TIERS[r.tier] ?? "New"}`)}
                  </span>
                </span>
                <span className="block font-mono text-xs text-muted tnum">{recordLine(r.record, t)}</span>
                <StoppedNote line={stoppedLine(r.record, t)} />
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => actions.decideRequest(slug, r.member, "declined"))} className={PILL_BTN}>
                  {t("decline")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => actions.decideRequest(slug, r.member, "accepted"))}
                  className={`${PILL_BTN} bg-ink text-manila`}
                >
                  {t("accept")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("noRequests")}</p>
      )}
    </section>
  );
}

/** Open public squad, I'm not in it and came without a code: its terms, then join, request, or why not. */
export function PublicJoinView({ squad, pub }: { squad: Squad; pub: PublicTerms }) {
  const actions = useActions();
  const { run, busy, error } = useRun("other");
  const me = useMe();
  const t = useT();
  const status = useJoinRequests(squad.slug, pub.approval)?.status;
  const seatsLeft = squad.maxMembers - squad.members.length;
  const tooLow = me ? TIERS.indexOf(me.tier) < pub.minTier : false;
  const { address: myAddr } = useMyAccount();
  const mine = useRecords(myAddr ? [myAddr] : [])?.[myAddr?.toLowerCase() ?? ""];
  const closed = !!mine && blockedByRecord(mine);
  const join = (label: string, busyLabel: string) => (
    <button type="button" disabled={busy} onClick={() => run(() => actions.joinPublic(squad.slug))} className={INK_BTN}>
      {busy ? busyLabel : error ? t("retry") : label}
    </button>
  );

  const action =
    seatsLeft <= 0 || !me || tooLow || closed ? null : !pub.approval || status === "accepted" ? (
      join(t("joinSquad"), t("joining"))
    ) : status === null ? (
      join(t("requestToJoin"), t("sending"))
    ) : status === "pending" ? (
      <p className={PAID_LABEL}>{t("requestSent")}</p>
    ) : status === "declined" ? (
      <p className={PAID_LABEL}>{t("notAccepted")}</p>
    ) : null;

  const who = t(pub.minTier === 0 ? "whoAnyone" : pub.minTier === 1 ? "whoBuilding" : "whoReliable");

  return (
    <AppShell action={action}>
      <SquadTitle squad={squad} meta={t("metaOpen")} />
      {pub.description && <p className="mt-4 max-w-[38ch]">{pub.description}</p>}
      <p className="mt-8 font-display text-2xl leading-tight font-extrabold tracking-[-0.02em]">
        {seatsLeft > 0 ? t(seatsLeft === 1 ? "seatsLeftOne" : "seatsLeftMany", { n: seatsLeft, max: squad.maxMembers }) : t("everySeatTaken")}
      </p>
      <p className="mt-2 max-w-[38ch] text-muted">
        {t("joinBody", { amount: naira(squad.contribution), payout: naira(squad.contribution * squad.maxMembers) })}
      </p>
      <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-paper">
        <li className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span className="font-semibold">{t("minTier")}</span>
          <span className="font-mono text-xs">{t(MIN_TIER_KEY[pub.minTier])}</span>
        </li>
        <li className="flex min-h-12 items-center px-4 text-sm text-muted">
          {who} {t(pub.approval ? "organizerApproves" : "joinStraight")}
        </li>
      </ul>
      <div className="mt-8">
        {seatsLeft <= 0 ? (
          <p role="status" className="rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {t("errFull")}
          </p>
        ) : closed ? (
          <p role="status" className="rounded-md border border-bad/40 bg-bad/8 px-4 py-3 text-sm">
            {t("recordBlocked")}
          </p>
        ) : tooLow ? (
          <p role="status" className="rounded-md border border-rule bg-paper px-4 py-3 text-sm">
            {t(pub.minTier === 1 ? "tooLowBuilding" : "tooLowReliable")}
          </p>
        ) : (
          <ErrorNote error={error} />
        )}
      </div>
    </AppShell>
  );
}
