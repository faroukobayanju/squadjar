"use client";

import { motion, useReducedMotion } from "motion/react";
import { initials, inkVariant, stampTilt } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Props = { memberId: string; name: string; round: number; fresh?: boolean; size?: "sm" | "md" | "lg" };

const SIZE = { sm: "size-7 text-[9px] border-2", md: "size-10 text-[11px] border-[2.5px]", lg: "size-16 text-base border-[3px]" };

/** A rubber-stamp mark in stamp-pad ink. `fresh` plays the one authored moment: the thunk. */
export function Stamp({ memberId, name, round, fresh, size = "sm" }: Props) {
  const reduce = useReducedMotion();
  const t = useT();
  const tilt = stampTilt(memberId, round);
  return (
    <motion.span
      role="img"
      aria-label={t("stampAria", { name, round })}
      className={`ink ${inkVariant(memberId, round)} inline-grid shrink-0 place-items-center rounded-full border-stamp font-mono font-medium text-stamp ${SIZE[size]}`}
      initial={fresh && !reduce ? { scale: 1.9, rotate: -24, opacity: 0 } : false}
      animate={{ scale: 1, rotate: tilt, opacity: 0.92 }}
      transition={fresh ? { type: "spring", stiffness: 520, damping: 22, mass: 0.9 } : { duration: 0 }}
    >
      {initials(name)}
    </motion.span>
  );
}

const BOX = { sm: "size-7", md: "size-10", lg: "size-16" };

/** An unstamped box on the card: a dashed square, dark enough to spot at a glance. */
export function EmptyBox({ size = "sm", label }: { size?: "sm" | "md" | "lg"; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 rounded-sm border-[1.5px] border-dashed border-muted/70 ${BOX[size]}`}
    />
  );
}

/** Rectangular mark across a collector's box. */
export function PaidOutMark({ label }: { label?: string }) {
  const t = useT();
  return (
    <span className="ink ink-3 inline-block -rotate-6 border-2 border-stamp px-1 py-px font-mono text-[8px] whitespace-nowrap font-medium tracking-wide text-stamp">
      {label ?? t("paidOut")}
    </span>
  );
}
