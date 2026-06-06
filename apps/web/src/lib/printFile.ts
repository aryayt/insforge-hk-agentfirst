import { printAreaPixelSize, type PrintArea } from "@app/shared";
import type { Placement } from "../components/ShirtPreview";
import { insforge } from "./insforge";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load image"));
    img.src = src;
  });
}

/**
 * Render the print-ready file: the artwork positioned + scaled per `placement`
 * (and optional text) on a transparent canvas the exact size of the physical
 * print box. This BAKES the user's move/resize into the image — so when it's
 * handed to a renderer/printer that just "fills the print area" (e.g. Printful),
 * the placement is preserved instead of being re-centred. Returns a PNG data URL.
 *
 * Same maths as PrintReadyPanel, so the download, the on-shirt preview, and the
 * Printful mockup all agree.
 */
export async function compositePrintFile(opts: {
  imageUrl: string | null;
  printArea: PrintArea;
  placement: Placement;
  text?: string;
  textColor?: string;
}): Promise<string> {
  const { imageUrl, printArea, placement, text, textColor = "#111827" } = opts;
  const { width, height } = printAreaPixelSize(printArea);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.clearRect(0, 0, width, height);

  if (imageUrl) {
    const img = await loadImage(imageUrl);
    const fit = Math.min(width / img.width, height / img.height) * placement.scale;
    const w = img.width * fit;
    const h = img.height * fit;
    ctx.drawImage(img, placement.x * width - w / 2, placement.y * height - h / 2, w, h);
  }

  const label = text?.trim();
  if (label) {
    const fontSize = Math.min(height * 0.13, (width * 0.92) / Math.max(label.length * 0.5, 1));
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(label, width / 2, height * (imageUrl ? 0.9 : 0.5));
  }

  return canvas.toDataURL("image/png");
}

/** Persist a composited print file to Storage (via the upload path) → https URL. */
export async function uploadPrintFile(dataUrl: string): Promise<string> {
  const { data, error } = await insforge.functions.invoke("generate-design", {
    body: { source: "upload", imageBase64: dataUrl, label: "print file", agentSource: "web" },
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const url = (data as { design?: { imageUrl?: string }; error?: string })?.design?.imageUrl;
  if (!url) throw new Error("could not upload print file");
  return url;
}

/** Composite the placed artwork and upload it — the durable URL a printer fills with. */
export async function buildPlacedArtworkUrl(opts: {
  imageUrl: string;
  printArea: PrintArea;
  placement: Placement;
  text?: string;
  textColor?: string;
}): Promise<string> {
  return uploadPrintFile(await compositePrintFile(opts));
}

/** Stable signature for caching a placed-artwork result. */
export function placementSignature(
  imageUrl: string,
  placement: Placement,
  text?: string,
  textColor?: string,
): string {
  return `${imageUrl}|${placement.x.toFixed(3)},${placement.y.toFixed(3)},${placement.scale.toFixed(3)}|${text ?? ""}|${textColor ?? ""}`;
}
