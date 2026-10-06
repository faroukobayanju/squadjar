"use client";

import { LANGS, LANG_NAMES, isLang, setLang, useLang, useT } from "@/lib/i18n";

/** Five pills (welcome, profile), or a compact select for the landing header. */
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
    <div role="group" aria-label={t("language")} className="flex flex-wrap gap-2">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${lang === l ? "border-ink bg-ink text-manila" : "border-rule"}`}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
