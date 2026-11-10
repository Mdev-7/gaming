import type { CSSProperties } from 'react';
export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    crosshair: <><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m2 9v-3a5 5 0 0 0-3-4"/></>,
    link: <><path d="m10 13 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/></>,
    volume: <><path d="m11 4-6 5H2v6h3l6 5V4m4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    mute: <><path d="m11 4-6 5H2v6h3l6 5V4m5 5 6 6m0-6-6 6"/></>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0V3m0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v6m-5 1h10"/></>,
    skull: <><path d="M5 15a9 9 0 1 1 14 0v5H5v-5m4 5v-3m6 3v-3"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    check: <path d="m5 12 4 4L20 5"/>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
    exit: <><path d="M9 3H3v18h6m6-15 6 6-6 6m-8-6h14"/></>,
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">{paths[name] || paths.crosshair}</svg>;
}
export function GunIcon({ weapon = 0, size = 88 }: { weapon?: number; size?: number }) {
  return <svg viewBox="0 0 120 48" width={size} height={size * 0.4} fill="currentColor" aria-hidden="true">
    {weapon === 0 ? <path d="M5 19h14l7-8h41v5h14v3h30v5H80l-5 7H58l-5 12H43l2-14H31l-8 8H12l4-12H5zm35-12h22v3H40zm-13 9h9v9h-9z"/> : weapon === 1 ? <path d="M4 18h67v3h43v5H76l-9 5H42L27 42H13l9-16H4zm42 8h24v10H46zm-5-13h28v4H41z"/> : <path d="M4 21h32l7-6h24v5h48v4H72l-6 7H54l-7 12H37l2-13H25L13 38H4l10-12H4zm40-13h24v6H44zm10-4h5v4h-5zm33 18h3v21h-4z"/>}
  </svg>;
}
