"use client";

import { useSyncExternalStore } from "react";

// Shared links (invites, pay reminders) point at the public site when set, even from a local dev server.
const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

/** Origin for links people share: NEXT_PUBLIC_APP_URL, else window.location.origin after hydration ("" on the server). */
export function useOrigin() {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  return PUBLIC_URL || origin;
}
