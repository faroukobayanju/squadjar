// The Squadjar stamp in stamp ink, so it follows the theme. Ink texture comes from the stamp masks.
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" role="img" aria-label="Squadjar" className={`ink ink-2 text-stamp ${className}`}>
      <defs>
        <path id="logo-ring" d="M512,512 m-300,0 a300,300 0 1,1 600,0 a300,300 0 1,1 -600,0" />
      </defs>
      <g transform="rotate(-7 512 512)" fill="none" stroke="currentColor">
        <circle cx="512" cy="512" r="388" strokeWidth="30" />
        <circle cx="512" cy="512" r="330" strokeWidth="8" />
        <text fontWeight="500" fontSize="44" letterSpacing="6" fill="currentColor" stroke="none" style={{ fontFamily: "var(--font-jetbrains)" }}>
          <textPath href="#logo-ring" textLength="1860" lengthAdjust="spacing">
            SQUADJAR · SAVE TOGETHER · NOBODY HOLDS THE JAR ·
          </textPath>
        </text>
        <text x="506" y="626" textAnchor="middle" fontWeight="800" fontSize="380" letterSpacing="-18" fill="currentColor" stroke="none" style={{ fontFamily: "var(--font-bricolage)" }}>
          sj
        </text>
      </g>
    </svg>
  );
}
