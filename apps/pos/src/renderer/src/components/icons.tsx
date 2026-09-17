import type { SVGProps } from 'react'

/** Small Feather-style line icons (24-unit viewBox) so the chrome looks like Petpooja's icon row. */
type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...rest }: P, children: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  )
}

export const Icon = {
  Menu: (p: P) => base(p, <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>),
  Search: (p: P) => base(p, <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>),
  Power: (p: P) => base(p, <><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /><line x1="12" y1="2" x2="12" y2="12" /></>),
  Store: (p: P) => base(p, <><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v11H3z" /><path d="M9 20v-6h6v6" /></>),
  Live: (p: P) => base(p, <><circle cx="12" cy="12" r="2.5" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M5 19a10 10 0 0 1 0-14" /><path d="M19 5a10 10 0 0 1 0 14" /></>),
  Orders: (p: P) => base(p, <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></>),
  Recent: (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>),
  Hold: (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><line x1="10" y1="9" x2="10" y2="15" /><line x1="14" y1="9" x2="14" y2="15" /></>),
  Bell: (p: P) => base(p, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  Logout: (p: P) => base(p, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>),
  User: (p: P) => base(p, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  Users: (p: P) => base(p, <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>),
  Percent: (p: P) => base(p, <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>),
  Note: (p: P) => base(p, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  Plus: (p: P) => base(p, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  X: (p: P) => base(p, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  XCircle: (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>),
  Plate: (p: P) => base(p, <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="5" /></>),
  Table: (p: P) => base(p, <><rect x="3" y="7" width="18" height="4" rx="1" /><line x1="6" y1="11" x2="6" y2="19" /><line x1="18" y1="11" x2="18" y2="19" /></>),
  Printer: (p: P) => base(p, <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>),
  Refresh: (p: P) => base(p, <><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></>),
  ChevronDown: (p: P) => base(p, <polyline points="6 9 12 15 18 9" />),
  ArrowLeft: (p: P) => base(p, <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
  Help: (p: P) => base(p, <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z" /></>)
}
