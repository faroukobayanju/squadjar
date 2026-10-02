"use client";

import { motion, useReducedMotion } from "motion/react";
import { initials, stampTilt } from "@/lib/format";

type Props = { memberId: string; name: string; round: number; fresh?: boolean; size?: "sm" | "md" | "lg" };

const SIZE = { sm: "size-7 text-[9px] border-2", md: "size-10 text-[11px] border-[2.5px]", lg: "size-16 text-base border-[3px]" };

/** A rubber-stamp mark in stamp-pad ink. `fresh` plays the one authored moment: the thunk. */
export function Stamp({ memberId, name, round, fresh, size = "sm" }: Props) {
  const reduce = useReducedMotion();
  const tilt = stampTilt(memberId, round);
  return (
    <motion.span
      role="img"
      aria-label={`${name} paid round ${round}`}
      className={`ink inline-grid shrink-0 place-items-center rounded-full border-stamp font-mono font-medium text-stamp ${SIZE[size]}`}
      initial={fresh && !reduce ? { scale: 1.9, rotate: -24, opacity: 0 } : false}
      animate={{ scale: 1, rotate: tilt, opacity: 0.92 }}
      transition={fresh ? { type: "spring", stiffness: 520, damping: 22, mass: 0.9 } : { duration: 0 }}
    >
      {initials(name)}
    </motion.span>
  );
}

export function EmptyBox({ size = "sm", label }: { size?: "sm" | "md"; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-rule ${size === "sm" ? "size-7" : "size-10"}`}
    />
  );
}

/** Rectangular mark across a collector's box. */
export function PaidOutMark({ label = "PAID OUT" }: { label?: string }) {
  return (
    <span className="inline-block -rotate-6 border-2 border-stamp px-1 py-px font-mono text-[8px] whitespace-nowrap font-medium tracking-wide text-stamp">
      {label}
    </span>
  );
}
