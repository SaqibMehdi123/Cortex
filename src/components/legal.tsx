import Link from 'next/link'
import type { Metadata } from 'next'
import { CortexMark } from '@/components/logo'
import { SITE_URL } from '@/lib/site'

/**
 * Shared shell for the public legal pages (/privacy, /terms, /refund).
 * Server-rendered, zero client JS — fully crawlable, fast, and consistent
 * with the landing's quiet editorial identity (hairlines, mono labels,
 * generous whitespace). Each page cross-links its siblings so the trio is
 * always one click away, and the footer carries the same links for crawlers.
 */

export const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/refund', label: 'Refund Policy' },
] as const

export function legalMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title: `${title} · Cortex`,
      description,
      url: `${SITE_URL}${path}`,
      type: 'article',
    },
  }
}

function LegalFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/30">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[13px] text-foreground/75 transition-colors hover:text-foreground">
          <CortexMark size={14} />
          <span>← Back to cortex.scrutinies.dev</span>
        </Link>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[13px] text-foreground/75 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}

export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string
  updated: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <CortexMark size={18} />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Cortex</span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Legal
          </span>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 pb-20 pt-14 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Last updated · {updated}
          </p>
          <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3rem)] font-medium leading-[1.08] tracking-[-0.025em]">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">{intro}</p>

          <div className="mt-12 flex flex-col gap-10">{children}</div>
        </article>
      </main>

      <LegalFooter />
    </div>
  )
}

/** Numbered section heading + body, the repeating unit of every legal page. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{n}</span>
        <h2 className="font-display text-[21px] font-medium tracking-[-0.015em]">{title}</h2>
      </div>
      <div className="mt-4 flex flex-col gap-3 pl-0 text-[14.5px] leading-relaxed text-foreground/85 sm:pl-7">
        {children}
      </div>
    </section>
  )
}

/** Quiet bulleted list used inside sections — left aligned, never justified. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 text-left">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span className="text-[14px] leading-relaxed text-foreground/80">{it}</span>
        </li>
      ))}
    </ul>
  )
}
