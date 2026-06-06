/**
 * brand-design — InsForge edge function (Deno).
 *
 * Given a website URL, it extracts the brand's identity and turns it into tee
 * designs:
 *   1. Scrape the page for name, colour palette (theme-color / inline hex), and
 *      a logo (apple-touch-icon / og:image / icon link / favicon).
 *   2. Return the logo itself as a placeable design (when it's a raster image).
 *   3. Generate original, print-ready artwork in the brand's palette (Gemini),
 *      using the logo as a style reference — NOT copied (trademark-safe).
 * Each result is persisted (Storage + a guest `designs` row) like generate-design.
 *
 * Deploy:  bunx @insforge/cli functions deploy brand-design --file functions/brand-design.ts
 * Invoke:  insforge.functions.invoke('brand-design', { body: { url, sessionKey?, agentSource? } })
 */
import { createAdminClient } from "npm:@insforge/sdk";

declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ── Scrape ────────────────────────────────────────────────────────────────────
type Brand = { name: string; colors: string[]; logoUrl: string | null };

function abs(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function pickColors(html: string): string[] {
  const found = new Map<string, number>();
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})/i);
  if (theme?.[1]) found.set(theme[1].toLowerCase(), 100);
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Skip near-white, near-black, and low-saturation grays — keep brand accents.
    if (max > 240 && min > 240) continue;
    if (max < 30) continue;
    if (max - min < 24) continue;
    found.set(hex, (found.get(hex) ?? 0) + 1);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
}

function pickLogo(html: string, base: string): string | null {
  const apple = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)/i);
  if (apple?.[1]) return abs(apple[1], base);
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  if (og?.[1]) return abs(og[1], base);
  const icon = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)/i);
  if (icon?.[1]) return abs(icon[1], base);
  return abs("/favicon.ico", base);
}

function pickName(html: string, url: string): string {
  const site = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
  if (site?.[1]) return site[1].trim().slice(0, 60);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) return title[1].split(/[|\-–—·]/)[0].trim().slice(0, 60);
  return new URL(url).hostname.replace(/^www\./, "");
}

async function scrape(url: string): Promise<Brand> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentShopBot/1.0)" },
    redirect: "follow",
  });
  const html = (await res.text()).slice(0, 600_000);
  const base = res.url || url;
  return { name: pickName(html, url), colors: pickColors(html), logoUrl: pickLogo(html, base) };
}

async function fetchRasterLogo(
  logoUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { headers: { "User-Agent": "AgentShopBot/1.0" } });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!/image\/(png|jpe?g|webp)/.test(mime)) return null; // raster only (no svg/ico)
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 8_000_000) return null;
    return { bytes, mime };
  } catch {
    return null;
  }
}

// ── Generate themed art (Gemini) ───────────────────────────────────────────────
async function generateThemed(
  brand: Brand,
  logo: { bytes: Uint8Array; mime: string } | null,
  variant: string,
): Promise<Uint8Array | null> {
  const key = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("GOOGLE_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
  const palette = brand.colors.length ? brand.colors.join(", ") : "the brand's colours";
  const prompt =
    `Create an ORIGINAL, print-ready t-shirt graphic inspired by the brand "${brand.name}". ${variant} ` +
    `Use this colour palette: ${palette}. Bold, high-contrast, limited palette, single centered subject. ` +
    `Place it on a plain solid pure-white (#FFFFFF) background — no transparency checkerboard, no grid, no pattern. ` +
    `Do NOT reproduce, trace, or include the actual logo, brand name, or any text; make a fresh emblem that simply evokes the brand's vibe and colours.`;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (logo) {
    parts.push({ inlineData: { mimeType: logo.mime, data: bytesToB64(logo.bytes) } });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );
  if (!res.ok) {
    console.error("gemini error", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const out = await res.json();
  const ps: Array<{ inlineData?: { data?: string } }> = out?.candidates?.[0]?.content?.parts ?? [];
  const b64 = ps.find((p) => p.inlineData?.data)?.inlineData?.data;
  return b64 ? b64ToBytes(b64) : null;
}

// ── Persist ─────────────────────────────────────────────────────────────────
type Admin = ReturnType<typeof createAdminClient>;
type Design = { id: string; label: string; imageUrl: string; imageKey: string };

async function persist(
  admin: Admin,
  bytes: Uint8Array,
  meta: { source: string; label: string; prompt: string | null; sessionKey: string; agentSource: string },
): Promise<Design | null> {
  const key = `guest/${crypto.randomUUID()}.png`;
  const file = new File([bytes], key.split("/").pop()!, { type: "image/png" });
  const { data: up, error: upErr } = await admin.storage.from("designs").upload(key, file);
  if (upErr || !up?.url || !up?.key) {
    console.error("upload error", upErr);
    return null;
  }
  const { data: rows, error: dbErr } = await admin.database
    .from("designs")
    .insert([
      {
        user_id: null,
        source: meta.source,
        prompt: meta.prompt,
        image_url: up.url,
        image_key: up.key,
        label: meta.label,
        session_key: meta.sessionKey,
        agent_source: meta.agentSource,
      },
    ])
    .select();
  if (dbErr) {
    console.error("designs insert error", dbErr);
    return null;
  }
  const row = (rows as Array<{ id: string }>)[0];
  return { id: row?.id, label: meta.label, imageUrl: up.url, imageKey: up.key };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: { url?: string; sessionKey?: string; agentSource?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }
  let raw = body.url?.trim();
  if (!raw) return json(400, { error: "url required" });
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: string;
  try {
    url = new URL(raw).toString();
  } catch {
    return json(400, { error: "invalid url" });
  }

  let brand: Brand;
  try {
    brand = await scrape(url);
  } catch (e) {
    console.error("scrape failed", e);
    return json(502, { error: "Couldn't read that website. Check the URL and try again." });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });
  const sessionKey = body.sessionKey ?? "web";
  const agentSource = body.agentSource ?? "web";
  const logo = await fetchRasterLogo(brand.logoUrl);

  // Themed art (2 variations, in parallel) + the logo as a placeable design.
  const [t1, t2] = await Promise.all([
    generateThemed(brand, logo, "Clean iconic emblem."),
    generateThemed(brand, logo, "Modern badge / crest style."),
  ]);

  const designs: Design[] = [];
  if (logo) {
    const d = await persist(admin, logo.bytes, {
      source: "upload",
      label: `${brand.name} logo`,
      prompt: null,
      sessionKey,
      agentSource,
    });
    if (d) designs.push(d);
  }
  for (const bytes of [t1, t2]) {
    if (!bytes) continue;
    const d = await persist(admin, bytes, {
      source: "ai",
      label: `${brand.name} design`,
      prompt: `brand design for ${url}`,
      sessionKey,
      agentSource,
    });
    if (d) designs.push(d);
  }

  if (!designs.length) {
    return json(502, { error: "Couldn't build a design from that site. Try another URL." });
  }
  return json(200, { brand, designs });
}
