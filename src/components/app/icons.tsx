'use client'

interface IconProps {
  className?: string
}

function base(props: IconProps): { className?: string } {
  return { className: props.className }
}

export function IconLibrary(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5" />
      <path d="M9.5 13h5M9.5 16h5" />
    </svg>
  )
}

export function IconProfile(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconPlay(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

export function IconPause(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  )
}

export function IconChevron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function IconBack(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function IconOutline(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M4 6h16M4 12h10M4 18h7" />
    </svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </svg>
  )
}

export function IconChat(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.1-2.5A8 8 0 1 1 21 12z" />
    </svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="2" />
      <rect x="17" y="14" width="4" height="6" rx="2" />
    </svg>
  )
}

export function IconMore(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCard(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  )
}

export function IconSparkle(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M12 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" />
      <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  )
}

export function IconGlobe(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.4 2.5 3.7 5.6 3.7 9S14.4 18.5 12 21c-2.4-2.5-3.7-5.6-3.7-9S9.6 5.5 12 3z" />
    </svg>
  )
}

export function IconCloud(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...base(props)}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
    </svg>
  )
}
