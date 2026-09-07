'use client'

import { FaBookOpen, FaBriefcase, FaBullseye, FaCalendarWeek, FaDownload, FaFileLines, FaLink, FaListCheck, FaMicrophone, FaMoon, FaNewspaper, FaPlus, FaRotate, FaSun } from 'react-icons/fa6'
import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import { useUI, NAV_ITEMS, type ViewKey } from '@/lib/nav-config'
import { api } from '@/lib/client'
import type { SearchResults } from '@/lib/types'
import { useTheme } from 'next-themes'

export function CommandBar() {
  const commandOpen = useUI((s) => s.commandOpen)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const setView = useUI((s) => s.setView)
  const setCaptureOpen = useUI((s) => s.setCaptureOpen)
  const openReader = useUI((s) => s.openReader)
  const { resolvedTheme, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [rawResults, setRawResults] = useState<SearchResults | null>(null)
  const results = query.trim() ? rawResults : null

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuery('')
      setRawResults(null)
    }
    setCommandOpen(open)
  }

  // debounced universal search
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const t = setTimeout(() => {
      api.get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(setRawResults)
        .catch(() => {})
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  const go = useCallback((v: ViewKey) => {
    setView(v)
    setCommandOpen(false)
  }, [setView, setCommandOpen])

  const hasResults =
    results && (results.documents.length || results.notes.length || results.tasks.length || results.goals.length || results.plans.length || results.news.length || results.opportunities.length)

  return (
    <Dialog open={commandOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="top-[22%] translate-y-0 overflow-hidden rounded-xl border bg-popover p-0 sm:max-w-xl [&_[cmdk-input]]:h-12">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Universal search and quick actions</DialogDescription>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-item]_svg]:h-4.5 [&_[cmdk-item]_svg]:w-4.5">
      <CommandInput placeholder="Search documents, notes, tasks, goals, news… or run a quick action" value={query} onValueChange={setQuery} />
      <CommandList className="scroll-thin min-h-[280px]">
        {query.trim() === '' && (
          <>
            <CommandGroup heading="Quick actions">
              <CommandItem onSelect={() => { setCommandOpen(false); setCaptureOpen(true, 'note') }}>
                <FaPlus /> Quick capture — note
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); setCaptureOpen(true, 'task') }}>
                <FaListCheck /> Add task
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); setCaptureOpen(true, 'voice') }}>
                <FaMicrophone /> Voice memo
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); setCaptureOpen(true, 'url') }}>
                <FaLink /> Save URL to read later
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); setView('library') }}>
                <FaBookOpen /> Import a document
              </CommandItem>
              <CommandItem onSelect={async () => { setCommandOpen(false); try { await api.post('/api/news/fetch') } catch {} setView('news') }}>
                <FaRotate /> Fetch latest AI news
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); window.location.href = '/api/export?format=json' }}>
                <FaDownload /> Export all data (JSON)
              </CommandItem>
              <CommandItem onSelect={() => { setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'); setCommandOpen(false) }}>
                {resolvedTheme === 'dark' ? <FaSun /> : <FaMoon />} Toggle theme
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.key} onSelect={() => go(item.key)}>
                  {item.icon} {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {query.trim() !== '' && !hasResults && (
          <CommandEmpty>No matches for “{query}”.</CommandEmpty>
        )}

        {results?.documents.length ? (
          <CommandGroup heading="Documents">
            {results.documents.map((d) => (
              <CommandItem key={d.id} onSelect={() => { openReader(d.id); setCommandOpen(false) }}>
                <FaFileLines /> {d.title} <span className="ml-auto text-xs text-muted-foreground">{d.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.notes.length ? (
          <CommandGroup heading="Notes">
            {results.notes.map((n) => (
              <CommandItem key={n.id} onSelect={() => go('library')}>
                <FaFileLines /> {n.title ?? n.content.slice(0, 60)}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.tasks.length ? (
          <CommandGroup heading="Tasks">
            {results.tasks.map((t) => (
              <CommandItem key={t.id} onSelect={() => go('plans')}>
                <FaListCheck /> {t.title} <span className="ml-auto text-xs text-muted-foreground">{t.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.goals.length ? (
          <CommandGroup heading="Goals">
            {results.goals.map((g) => (
              <CommandItem key={g.id} onSelect={() => go('goals')}>
                <FaBullseye /> {g.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.plans.length ? (
          <CommandGroup heading="Plans">
            {results.plans.map((p) => (
              <CommandItem key={p.id} onSelect={() => go('plans')}>
                <FaCalendarWeek /> [{p.timeframe}] {p.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.news.length ? (
          <CommandGroup heading="AI News">
            {results.news.map((n) => (
              <CommandItem key={n.id} onSelect={() => { window.open(n.url, '_blank'); setCommandOpen(false) }}>
                <FaNewspaper /> {n.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.opportunities.length ? (
          <CommandGroup heading="Career">
            {results.opportunities.map((o) => (
              <CommandItem key={o.id} onSelect={() => go('career')}>
                <FaBriefcase /> {o.company} — {o.role} <span className="ml-auto text-xs text-muted-foreground">{o.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
