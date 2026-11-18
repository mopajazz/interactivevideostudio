// Decorative 24x24 line icons. Every use sits next to visible text, so all are aria-hidden.
import type { ReactNode } from 'react';

const Svg = ({ children, className = 'icon' }: { children: ReactNode; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconPlay = () => <Svg><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></Svg>;
export const IconCheck = () => <Svg><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconLock = () => <Svg><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconArrowRight = () => <Svg><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconArrowLeft = () => <Svg><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const IconAlert = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Svg>;
export const IconUpload = () => <Svg><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Svg>;
export const IconDownload = () => <Svg><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></Svg>;
export const IconPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const IconRefresh = () => <Svg><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" /></Svg>;
export const IconSpinner = () => <Svg className="icon spinner"><path d="M12 3a9 9 0 1 0 9 9" /></Svg>;

// The five interaction tools (used in Step 2; previewed on its placeholder card).
export const IconQuiz = () => <Svg><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></Svg>;
export const IconTrueFalse = () => <Svg><path d="M3.5 12l3 3 5-6" /><path d="M14.5 9l6 6M20.5 9l-6 6" /></Svg>;
export const IconText = () => <Svg><path d="M5 6h14M12 6v13M9 19h6" /></Svg>;
export const IconLink = () => <Svg><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const IconImage = () => <Svg><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.75" /><path d="M20.5 16l-5-5-8.5 8" /></Svg>;
