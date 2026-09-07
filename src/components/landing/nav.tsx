'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { CortexMark } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useTheme } from 'next-themes'
import { ArrowUpRight, Menu, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#copilot', label: 'Copilot' },
  { href: '#faq', label: 'FAQ' },
]

// No-op store for the hydration check — server snapshot false, client true.
const subscribeNever = () => () => {}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false)

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  )
}

export function LandingNav({ authed }: { authed: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-border/80 bg-background/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <Link href="/" aria-label="Cortex home" className="flex shrink-0 items-center gap-2">
          <CortexMark size={20} />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Cortex
          </span>
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {authed ? (
            <Button asChild size="sm" className="h-8 rounded-lg px-3.5 text-[13px]">
              <Link href="/app">
                Open app <ArrowUpRight className="ml-0.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden h-8 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="sheen h-8 rounded-lg px-3.5 text-[13px]">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </SheetTrigger>
            <SheetContent side="top" className="md:hidden">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <CortexMark size={18} />
                  <span className="text-sm font-semibold">Cortex</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-0.5 px-4 pb-6">
                {LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                  {authed ? (
                    <Button asChild className="w-full rounded-lg">
                      <Link href="/app">Open app</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild className="w-full rounded-lg">
                        <Link href="/signup">Get started free</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full rounded-lg">
                        <Link href="/login">Sign in</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
