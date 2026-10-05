/** A same-site path from a `next` query param; anything else (//evil, /\\evil, absolute URLs) falls back. */
export const safeNext = (s: string | undefined, fallback = "/home") => (s && /^\/(?![\/\\])/.test(s) ? s : fallback);
