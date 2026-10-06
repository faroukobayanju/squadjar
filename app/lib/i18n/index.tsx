"use client";

// The current language: this device's choice (localStorage), else the signed-in user's saved one, else English.
// Server render and hydration always use English (useSyncExternalStore's server snapshot), then the real choice renders.
import { Fragment, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { hasPrivy } from "@/lib/live/chain";
import { fmt, isLang, type Key, type Lang, type T, type Vars } from "./core";
import { en } from "./en";
import { pcm } from "./pcm";
import { yo } from "./yo";
import { ig } from "./ig";
import { ha } from "./ha";

export { LANGS, isLang, type Key, type Lang, type T, type Vars } from "./core";

const DICTS: Record<Lang, Record<Key, string>> = { en, pcm, yo, ig, ha };

/** Each language in its own name, for the picker. */
export const LANG_NAMES: Record<Lang, string> = { en: "English", pcm: "Pidgin", yo: "Yorùbá", ig: "Igbo", ha: "Hausa" };

const KEY = "squadjar-lang";
let current: Lang | null = null;
let stored = false; // this device has a choice, so the account's saved language doesn't override it
let fetched = false; // asked the account once this session
let remote: ((l: Lang) => Promise<unknown>) | null = null; // saves to the account while signed in
const subs = new Set<() => void>();

function get(): Lang {
  if (current) return current;
  let v: string | null = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {}
  stored = isLang(v);
  current = isLang(v) ? v : "en";
  return current;
}

function apply(l: Lang) {
  current = l;
  stored = true;
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  subs.forEach((f) => f());
}

const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));

/** Switch language on this device and, when signed in, on the account. */
export function setLang(l: Lang) {
  apply(l);
  remote?.(l).catch((e) => console.error("[language save]", e));
}

export const useLang = (): Lang => useSyncExternalStore(subscribe, get, () => "en");

export function useT(): T {
  const lang = useLang();
  return useMemo(() => (k: Key, v?: Vars) => fmt(DICTS[lang][k], v), [lang]);
}

/** Like fmt, but placeholders can be elements: rich(t("homeBalance"), { amount: <b>₦5,000</b> }). */
export function rich(s: string, vars: Record<string, ReactNode>): ReactNode {
  return s.split(/\{(\w+)\}/).map((part, i) => <Fragment key={i}>{i % 2 ? (part in vars ? vars[part] : `{${part}}`) : part}</Fragment>);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <>
      {hasPrivy && <AccountLanguage />}
      {children}
    </>
  );
}

// hasPrivy is a build-time constant, so this only mounts inside PrivyProvider.
function AccountLanguage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  useEffect(() => {
    if (!ready || !authenticated) {
      remote = null;
      return;
    }
    const call = async (init?: RequestInit) => {
      const r = await fetch("/api/users/language", {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
      });
      if (!r.ok) throw new Error(`language ${r.status}`);
      return r.json();
    };
    remote = (l) => call({ method: "POST", body: JSON.stringify({ language: l }) });
    get();
    if (stored || fetched) return;
    fetched = true;
    call()
      .then(({ language }) => {
        if (!stored && isLang(language) && language !== "en") apply(language);
      })
      .catch(() => {}); // no database (503) or no account row yet: stay on English
  }, [ready, authenticated, getAccessToken]);
  return null;
}
