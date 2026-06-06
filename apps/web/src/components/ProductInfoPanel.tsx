import { useEffect, useState } from "react";
import type { PrintArea } from "@app/shared";
import { type PrintfulCatalog, fetchPrintfulCatalog } from "../lib/mockup";
import { money } from "../lib/catalog";

type Props = {
  printArea: PrintArea;
  /** Printful catalog product id, for the per-variant fulfillment cost (PRINTFUL_PRODUCT_BY_SLUG). */
  printfulProductId: number | null;
  /** Our retail unit price for the selected variant. */
  retailCents: number | null;
  /** Selected color/size, to match the Printful per-variant cost. */
  color: string;
  size: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Print area + a price breakdown (our retail vs Printful's fulfillment cost → margin). */
export function ProductInfoPanel({ printArea, printfulProductId, retailCents, color, size }: Props) {
  const [cat, setCat] = useState<PrintfulCatalog | null>(null);

  useEffect(() => {
    if (!printfulProductId) return;
    let cancelled = false;
    fetchPrintfulCatalog(printfulProductId)
      .then((c) => !cancelled && setCat(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [printfulProductId]);

  const costCents =
    cat?.variants.find((v) => norm(v.color) === norm(color) && norm(v.size) === norm(size))?.costCents ??
    null;
  const marginCents = retailCents != null && costCents != null ? retailCents - costCents : null;

  return (
    <div className="space-y-5 text-sm">
      <Section title="Print specs">
        <Row label="Print area" value={`${printArea.widthCm}×${printArea.heightCm} cm`} />
      </Section>

      <Section title="Price breakdown">
        <Row label="Your price" value={retailCents != null ? money(retailCents) : "—"} strong />
        <Row label="Printful cost" value={costCents != null ? money(costCents) : "—"} />
        <Row
          label="Margin"
          value={marginCents != null ? money(marginCents) : "—"}
          tone={marginCents != null && marginCents < 0 ? "warn" : "ok"}
        />
        <p className="text-xs text-zinc-400">Per item, before shipping &amp; Stripe fees.</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "ok" | "warn";
}) {
  const valueCls =
    tone === "warn" ? "text-red-600" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className={`${strong ? "font-semibold " : ""}${valueCls} tabular-nums`}>{value}</span>
    </div>
  );
}
