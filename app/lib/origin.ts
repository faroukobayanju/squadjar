"use client";

import { useSyncExternalStore } from "react";

/** window.location.origin after hydration, "" during server render and hydration (no mismatch). */
export function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
}
