"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMyAccount } from "@/lib/live/account";
import { hasPrivy } from "@/lib/live/chain";
import { ArrowLeft, House, UsersThree, UserCircle } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";

const TABS = [
  { href: "/home", label: "home", icon: House },
  { href: "/squads", label: "squads", icon: UsersThree },
  { href: "/profile", label: "profile", icon: UserCircle },
] as const;

/** Redirects through /login when signed out (Privy mode only). Returns true while the page should render nothing. */
export function useRequireLogin(): boolean {
  const path = usePathname();
  const router = useRouter();
  const { ready, authenticated } = useMyAccount();
  const signedOut = hasPrivy && ready && !authenticated;
  useEffect(() => {
    if (!signedOut) return;
    // Keep ?code= on invite links so the same URL is restored after login.
    router.replace("/login?next=" + encodeURIComponent(path + window.location.search));
  }, [signedOut, path, router]);
  return hasPrivy && (!ready || !authenticated);
}

/** Phone-width column with the bottom tab bar. `action` docks above the tabs. */
export function AppShell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const path = usePathname();
  const t = useT();
  if (useRequireLogin()) return null;
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <main className="flex-1 px-4 pt-6 pb-6">{children}</main>
      <div className="sticky bottom-0 z-20 bg-manila pb-[env(safe-area-inset-bottom)]">
        {action && <div className="px-4 pt-3">{action}</div>}
        <nav aria-label={t("navMain")} className="mt-3 grid grid-cols-3 border-t border-rule">
          {TABS.map(({ href, label, icon: Icon }) => {
            const on = path === href || (href === "/squads" && path.startsWith("/s/"));
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${on ? "text-ink" : "text-muted"}`}
              >
                <Icon size={22} weight={on ? "fill" : "regular"} aria-hidden />
                {t(label)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-12 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
      <ArrowLeft size={18} aria-hidden />
      {label}
    </Link>
  );
}
