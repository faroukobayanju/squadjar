"use client";

import { LANGS, LANG_NAMES, isLang, setLang, useLang, useT } from "@/lib/i18n";

/** One-row segmented control (welcome, profile), or a compact select for the landing header. */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  if (compact)
    return (
      <select
        aria-label={t("language")}
        value={lang}
        onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
        className="min-h-11 rounded-md bg-transparent px-1 text-sm font-semibold text-muted outline-none hover:text-ink focus:text-ink"
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    );
  return (
    <div role="group" aria-label={t("language")} className="flex rounded-full border-[1.5px] border-rule bg-paper">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-12 min-w-0 flex-1 rounded-full px-1 text-[13px] font-semibold whitespace-nowrap ${lang === l ? "bg-ink text-manila" : "text-muted hover:text-ink"}`}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
