// SSRF-hardened fetch for URLs the USER supplies (web-article extraction,
// remote PDF imports, quick-capture). These are the only places in the code
// where the server reaches out to a caller-chosen host, so every hop —
// including redirects — must pass the same private-network checks.
//
// What gets blocked:
//   - non-http(s) schemes
//   - credentials embedded in the URL (user:pass@host)
//   - loopback / private / link-local / CGNAT / reserved IP literals (v4+v6,
//     incl. IPv6-mapped IPv4 like ::ffff:10.0.0.1 and hex/octal IPv4 forms)
//   - localhost-style and internal-looking hostnames (.local, .internal,
//     metadata endpoints), whatever they resolve to
//   - public-looking hostnames that DNS-resolve to a private address
//     (resolves ALL addresses the OS returns, not just the first)
//   - redirect chains that try to hop to any of the above (followed manually
//     so every hop is re-checked — redirect:'follow' would bypass this)
//
// Callers treat a thrown SafeFetchError like any network failure — every
// existing call site already wraps these fetches in try/catch.

import { lookup } from 'dns/promises'

export class SafeFetchError extends Error {}

// Private / reserved IPv4 ranges (base, mask) — metadata services included
// via 169.254.0.0/16.
const V4_BLOCKS: Array<[number, number]> = (
  [
    ['0.0.0.0', 0xff000000], // "this network"
    ['10.0.0.0', 0xff000000], // private
    ['100.64.0.0', 0xffc00000], // CGNAT
    ['127.0.0.0', 0xff000000], // loopback
    ['169.254.0.0', 0xffff0000], // link-local + cloud metadata
    ['172.16.0.0', 0xfff00000], // private
    ['192.0.0.0', 0xffffff00], // IETF protocol assignments
    ['192.0.2.0', 0xffffff00], // TEST-NET-1
    ['192.168.0.0', 0xffff0000], // private
    ['198.18.0.0', 0xfffe0000], // benchmarking
    ['198.51.100.0', 0xffffff00], // TEST-NET-2
    ['203.0.113.0', 0xffffff00], // TEST-NET-3
    ['224.0.0.0', 0xf0000000], // multicast
    ['240.0.0.0', 0xf0000000], // reserved
  ] as Array<[string, number]>
).map(([base, mask]) => [ip4ToInt(base), mask])

function ip4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/** Accepts dotted-quad, hex (0x7f.0.0.1) and octal (0177.0.0.1) IPv4 forms. */
function parseIpv4Literal(host: string): number | null {
  const parts = host.split('.')
  if (parts.length < 1 || parts.length > 4) return null
  let value = 0
  const nums: number[] = []
  for (const part of parts) {
    if (!/^(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)$/.test(part)) return null
    const n = part.toLowerCase().startsWith('0x')
      ? Number.parseInt(part.slice(2), 16)
      : /^0/.test(part) && part.length > 1
        ? Number.parseInt(part.slice(1), 8)
        : Number.parseInt(part, 10)
    if (!Number.isFinite(n) || n > 255) return null
    nums.push(n)
  }
  if (nums.length === 4) {
    value = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]
  } else if (nums.length === 1) {
    value = nums[0] // 2130706433 form
  } else {
    return null // a.b.c / a.b shorthand — ambiguous, reject
  }
  return value >>> 0
}

function isPrivateIpv4(int32: number): boolean {
  return V4_BLOCKS.some(([base, mask]) => (int32 & mask) >>> 0 === base)
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  // IPv4-mapped / IPv4-compatible (::ffff:a.b.c.d)
  const mapped = h.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) {
    const v4 = parseIpv4Literal(mapped[1])
    return v4 === null || isPrivateIpv4(v4)
  }
  if (h === '::' || h === '::1') return true
  const first = h.split(':')[0] || ''
  if (/^f[de]/.test(first)) return true // fc00::/7 unique-local, fe80::/10 link-local
  if (/^2001:db8:/i.test(h)) return true // documentation range
  return false
}

const SUSPECT_HOSTNAME =
  /^(localhost|host\.docker\.internal|metadata\.google\.internal|metadata|instance-data)$/i

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/\.+$/, '').toLowerCase() // strip trailing dot(s)
  if (!host) return true
  if (SUSPECT_HOSTNAME.test(host)) return true
  if (/\.(local|internal|home|lan|intranet|localdomain|socket)$/.test(host)) return true
  if (host.endsWith('.localhost') || host === 'localhost') return true
  if (host.includes(':')) return isPrivateIpv6(host)
  const v4 = parseIpv4Literal(host)
  if (v4 !== null) return isPrivateIpv4(v4) // covers 127.1 / 0x7f000001 style too
  return false // ordinary public name — the DNS check below still guards it
}

/** Resolve a public-looking hostname and make sure every address is public. */
async function resolvesToPublicHost(hostname: string): Promise<boolean> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    if (!records.length) return false
    for (const { address, family } of records) {
      if (family === 4) {
        const v4 = parseIpv4Literal(address)
        if (v4 === null || isPrivateIpv4(v4)) return false
      } else if (isPrivateIpv6(address)) {
        return false
      }
    }
    return true
  } catch {
    return false // unresolvable — let the caller's fetch surface the error
  }
}

async function assertSafeTarget(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SafeFetchError('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('Only http(s) URLs are supported')
  }
  if (url.username || url.password) {
    throw new SafeFetchError('URLs with embedded credentials are not allowed')
  }
  if (isPrivateHostname(url.hostname)) {
    throw new SafeFetchError('That host is not reachable from the reader')
  }
  // Public-looking names get a DNS sanity check (also catches rebinding to
  // private space at request time).
  if (!parseIpv4Literal(url.hostname) && !url.hostname.includes(':')) {
    if (!(await resolvesToPublicHost(url.hostname))) {
      throw new SafeFetchError('That host is not reachable from the reader')
    }
  }
  return url
}

export interface SafeFetchInit {
  headers?: Record<string, string>
  timeoutMs?: number
  maxRedirects?: number
  method?: 'GET' | 'HEAD'
}

/**
 * Fetch a user-supplied URL with SSRF checks on every hop. Throws
 * SafeFetchError (a normal Error) on any policy violation; network failures
 * propagate as usual so existing try/catch call sites keep working.
 */
export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 12_000, maxRedirects = 3, method = 'GET' } = init

  let current = await assertSafeTarget(rawUrl)
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response
    try {
      res = await fetch(current, {
        method,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CortexReader/1.0)', ...headers },
        redirect: 'manual', // every hop re-validated below
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      })
    } catch (e) {
      if (e instanceof SafeFetchError) throw e
      throw new SafeFetchError(e instanceof Error ? e.message : 'Fetch failed')
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      res.body?.cancel().catch(() => {})
      if (!location) throw new SafeFetchError(`Redirect without a destination (${res.status})`)
      if (hop === maxRedirects) throw new SafeFetchError('Too many redirects')
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        throw new SafeFetchError('Invalid redirect target')
      }
      current = await assertSafeTarget(next.toString())
      continue
    }
    return res
  }
  throw new SafeFetchError('Too many redirects') // unreachable; loop returns or throws
}
