import type { PropsWithChildren, ReactNode } from "react";
import { McpUseProvider, useWidgetTheme } from "mcp-use/react";

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function totalLines(
  lines: Array<{
    qty: number;
    unitPriceCents: number;
  }>,
): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
}

type ShellProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: ReactNode;
}>;

export function WidgetShell({
  eyebrow,
  title,
  subtitle,
  badge,
  children,
}: ShellProps) {
  const theme = useWidgetTheme();

  return (
    <McpUseProvider autoSize>
      <section className="widget-shell" data-theme={theme}>
        <div className="widget-content">
          <header className="widget-header">
            <div className="widget-header-main">
              <div className="widget-stack">
                <span className="widget-eyebrow">{eyebrow}</span>
                <h1 className="widget-title">{title}</h1>
              </div>
              {badge}
            </div>
            <p className="widget-subtitle">{subtitle}</p>
          </header>
          {children}
        </div>
      </section>
    </McpUseProvider>
  );
}

type PendingProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function PendingWidget({ eyebrow, title, subtitle }: PendingProps) {
  return (
    <WidgetShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <div className="widget-grid two-up">
        <div className="widget-card widget-stack">
          <div className="pending-pulse" style={{ width: "34%" }} />
          <div className="pending-pulse" style={{ width: "88%", height: 16 }} />
          <div className="pending-pulse" style={{ width: "72%" }} />
        </div>
        <div className="preview-stage">
          <div className="pending-pulse" style={{ width: 180, height: 180, borderRadius: 24 }} />
        </div>
      </div>
    </WidgetShell>
  );
}

export function PriceTag({ cents }: { cents: number }) {
  return <div className="price-tag">From {formatMoney(cents)}</div>;
}

export function Pill({
  children,
  strong = false,
}: PropsWithChildren<{ strong?: boolean }>) {
  return <span className={`widget-pill${strong ? " strong" : ""}`}>{children}</span>;
}

export function ProductIllustration({
  type,
}: {
  type: "tshirt" | "mug" | "cap";
}) {
  if (type === "mug") {
    return (
      <svg width="132" height="132" viewBox="0 0 132 132" fill="none" aria-hidden="true">
        <rect x="27" y="26" width="58" height="72" rx="16" fill="var(--widget-card)" stroke="var(--widget-card-border)" />
        <path d="M86 41H94C103.389 41 111 48.6112 111 58V66C111 75.3888 103.389 83 94 83H86" stroke="var(--widget-accent)" strokeWidth="8" strokeLinecap="round" />
        <path d="M39 48H73" stroke="var(--widget-accent-alt)" strokeWidth="8" strokeLinecap="round" opacity="0.7" />
        <path d="M39 64H66" stroke="var(--widget-accent)" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }

  if (type === "cap") {
    return (
      <svg width="132" height="132" viewBox="0 0 132 132" fill="none" aria-hidden="true">
        <path d="M28 72C28 48.804 46.804 30 70 30C90.573 30 107 46.427 107 67V73H28Z" fill="var(--widget-card)" stroke="var(--widget-card-border)" />
        <path d="M107 72C107 85.255 96.255 96 83 96H58C46.402 96 37 86.598 37 75V72H107Z" fill="color-mix(in srgb, var(--widget-accent) 26%, var(--widget-card))" />
        <path d="M34 72C31.53 72 29.319 73.522 28.433 75.828L24.651 85.658C23.159 89.539 26.026 93.75 30.184 93.75H69.5" stroke="var(--widget-accent-alt)" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="132" height="132" viewBox="0 0 132 132" fill="none" aria-hidden="true">
      <path d="M40 33L53 22H79L92 33L110 44L99 60V108H33V60L22 44L40 33Z" fill="var(--widget-card)" stroke="var(--widget-card-border)" />
      <path d="M40 33L54 52H78L92 33" stroke="var(--widget-accent)" strokeWidth="8" strokeLinecap="round" />
      <path d="M53 22L66 33L79 22" stroke="var(--widget-accent-alt)" strokeWidth="8" strokeLinecap="round" opacity="0.72" />
      <rect x="48" y="58" width="36" height="28" rx="10" fill="color-mix(in srgb, var(--widget-accent) 20%, transparent)" />
    </svg>
  );
}

export function colorToken(color: string): string {
  const normalized = color.trim().toLowerCase();
  const palette: Record<string, string> = {
    black: "#2a2522",
    white: "#f3efe8",
    ivory: "#efe4d0",
    cream: "#ecd9ba",
    natural: "#d9c6a3",
    navy: "#2d4263",
    blue: "#4f6fa5",
    red: "#c7573b",
    maroon: "#7f3535",
    green: "#3f7658",
    forest: "#345844",
    yellow: "#d4a63a",
    gold: "#c9962f",
    orange: "#d4793f",
    pink: "#d98da4",
    gray: "#8b8781",
    grey: "#8b8781",
    silver: "#b7babd",
    brown: "#7f5a42",
    khaki: "#92805f",
    beige: "#cfba98",
    purple: "#7b63a5",
  };

  return palette[normalized] ?? "#8b8781";
}
