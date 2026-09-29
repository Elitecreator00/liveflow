/**
 * Inline SVG nav icons for the sidebar.
 * Kept minimal: 20x20 viewBox, currentColor fill/stroke.
 */
import React from "react";

type IconProps = React.SVGAttributes<SVGElement>;

export function IconOverview(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconMonitoring(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 10l2.5-3 2 2.5 2-3 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconStudio(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 8.5l4-2v7l-4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="8.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconAdmin(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="5" r="2.5" fill="var(--lf-primary)" />
      <path d="M15 5h2M16 4v2" stroke="white" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function IconChat(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAnalytics(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M2 16l4-5 4 2 4-6 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconUser(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconLogout(p: IconProps): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...p}>
      <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3H5a2 2 0 00-2 2v10a2 2 0 002 2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
