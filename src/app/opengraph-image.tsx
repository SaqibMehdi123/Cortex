import { ImageResponse } from 'next/og'
import { SITE_TAGLINE } from '@/lib/site'

export const alt = 'Cortex — Knowledge work, without the chaos'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Open Graph / social share card, generated at request time with the same
 * warm-ink + sage palette as the product's dark theme. Rendered as a route
 * (never at build time), so no font fetches are needed — satori's default
 * sans keeps it robust across regions.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#14120f',
          backgroundImage:
            'radial-gradient(circle at 50% -10%, rgba(133,179,160,0.22), rgba(133,179,160,0) 55%), radial-gradient(circle at 85% 110%, rgba(217,169,78,0.14), rgba(217,169,78,0) 45%)',
          color: '#ece7dc',
          fontFamily: 'sans-serif',
        }}
      >
        {/* wordmark row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #85b3a0, #d9a94e)',
              color: '#14120f',
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -3 }}>Cortex</div>
        </div>

        {/* tagline */}
        <div
          style={{
            marginTop: 28,
            fontSize: 40,
            color: 'rgba(236,231,220,0.72)',
            letterSpacing: -0.5,
          }}
        >
          {SITE_TAGLINE}
        </div>

        {/* module chips */}
        <div style={{ display: 'flex', gap: 14, marginTop: 52 }}>
          {['Library', 'Radar', 'Copilot', 'Cards', 'Maps', 'Goals'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                padding: '12px 26px',
                borderRadius: 999,
                border: '1px solid rgba(236,231,220,0.22)',
                background: 'rgba(236,231,220,0.06)',
                fontSize: 24,
                color: 'rgba(236,231,220,0.85)',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* domain footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 42,
            display: 'flex',
            fontSize: 22,
            letterSpacing: 3,
            color: 'rgba(236,231,220,0.42)',
            textTransform: 'uppercase',
          }}
        >
          cortexdot.scrutinies.dev · free in beta
        </div>
      </div>
    ),
    { ...size }
  )
}
