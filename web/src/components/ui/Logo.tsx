/**
 * The MauzoHalisi mark: a cart carrying a bag, with a tick where the goods are.
 * Mauzo in the cart, halisi in the tick.
 *
 * Drawn as SVG rather than shipped as the source PNG so it stays crisp at 20px
 * in the sidebar, carries no white box onto the neumorphic background, and can
 * be recoloured for dark grounds. Previously this artwork was hand-copied into
 * eight components; it lives here once now.
 */

export const BRAND = {
  name:    'MauzoHalisi',
  /** The name split for the two-weight lockup. */
  nameA:   'Mauzo',
  nameB:   'Halisi',
  tagline: 'Taarifa kwa Wakati. Faida Zaidi.',
  ochre:   '#B0682C',
  ink:     '#12100E',
} as const;

interface MarkProps {
  size?: number;
  /** On dark grounds the black cart disappears, so it is drawn in the ink token. */
  inkColor?: string;
  className?: string;
  /**
   * Force the reduced badge. Left unset, anything under 24px uses it
   * automatically — below that the cart, bag, tick and motion lines collapse
   * into an unreadable blob.
   */
  compact?: boolean;
}

/**
 * The reduced mark: ochre ground, bold tick. What is left of the logo when
 * there is no room for the rest of it — a favicon, a chat avatar, a menu icon.
 * It keeps the two things that carry the brand: the ochre and the tick.
 */
export function LogoBadge({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className}
         role="img" aria-label={BRAND.name}>
      <rect width="32" height="32" rx="7.5" fill={BRAND.ochre} />
      <path d="M8.5 16.5 13.5 21.5 24 10.5" stroke="#fff" strokeWidth="4.2" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The full mark — cart, bag, tick, motion. */
export function LogoMark({ size = 28, inkColor = BRAND.ink, className, compact }: MarkProps) {
  if (compact ?? size < 24) return <LogoBadge size={size} className={className} />;

  // 58 × 52 keeps the artwork's own proportions; height follows width.
  const h = Math.round((size * 52) / 58);
  return (
    <svg
      width={size} height={h} viewBox="0 0 58 52"
      fill="none" className={className} role="img" aria-label={BRAND.name}
    >
      {/* Motion lines — the cart is moving */}
      <g stroke={BRAND.ochre} strokeWidth="2.8" strokeLinecap="round">
        <path d="M1.5 29.9H13" />
        <path d="M4.4 34.8H13.8" />
        <path d="M8 39.1H14.4" />
      </g>

      {/* Cart first, so the bag sits inside it rather than across it */}
      <path
        d="M5 21.8h9.4l7 20.4h20.1L53 28.5"
        stroke={inkColor} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="23.9" cy="47.7" r="2.9" fill={inkColor} />
      <circle cx="39.6" cy="47.7" r="2.9" fill={inkColor} />

      {/* Bag handle */}
      <path d="M28 15.5a6.5 9.5 0 0 1 13 0" stroke={BRAND.ochre} strokeWidth="2.4" strokeLinecap="round" />

      {/* Bag body — stroked in its own colour so the corners round without extra path data */}
      <path
        d="M21 15h27l2 10-4.5 13.5H24L19.5 25z"
        fill={BRAND.ochre} stroke={BRAND.ochre} strokeWidth="2.6" strokeLinejoin="round"
      />

      {/* The tick — halisi */}
      <path
        d="M25.5 27.4l5.6 5.2 10.4-10.2"
        stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps extends MarkProps {
  /** Show the wordmark beside the mark. */
  showName?: boolean;
  /** Show the tagline under the wordmark. */
  showTagline?: boolean;
  /** Wordmark size in px; the mark is scaled from `size`. */
  nameSize?: number;
  /** Colour for the "Mauzo" half — the "Halisi" half is always ochre. */
  nameColor?: string;
}

/** Mark plus wordmark, optionally with the tagline beneath. */
export default function Logo({
  size = 28,
  nameSize = 17,
  inkColor = BRAND.ink,
  nameColor,
  showName = true,
  showTagline = false,
  className = '',
}: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} inkColor={inkColor} />
      {showName && (
        <div className="min-w-0">
          <div
            className="font-bold tracking-tight leading-none whitespace-nowrap"
            style={{ fontSize: nameSize, color: nameColor ?? inkColor }}
          >
            {BRAND.nameA}
            <span style={{ color: BRAND.ochre }}>{BRAND.nameB}</span>
          </div>
          {showTagline && (
            <div
              className="uppercase leading-none mt-1 truncate"
              style={{ fontSize: Math.max(8, nameSize * 0.42), letterSpacing: '0.09em', opacity: 0.55,
                       color: nameColor ?? inkColor }}
            >
              {BRAND.tagline}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
