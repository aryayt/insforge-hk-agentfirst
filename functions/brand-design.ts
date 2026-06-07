/**
 * brand-design - InsForge edge function (Deno).
 *
 * Given a company domain, scrape basic brand signals and return persisted,
 * transparent print concepts that are safe to place directly on merch.
 *
 * Deploy:
 *   bunx @insforge/cli functions deploy brand-design --file functions/brand-design.ts
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

type Brand = {
  name: string;
  domain: string;
  colors: string[];
  logoUrl: string | null;
};

type Design = {
  id: string;
  label: string;
  imageUrl: string;
  imageKey: string;
};

type Admin = ReturnType<typeof createAdminClient>;

function normalizeUrl(value: string): URL | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url.hostname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function htmlAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}=["']([^"']+)`, "i"));
  return m?.[1] ?? null;
}

function cleanupName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 64);
}

function pickName(html: string, url: URL): string {
  const site = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
  if (site?.[1]) return cleanupName(site[1]);
  const app = html.match(/<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)/i);
  if (app?.[1]) return cleanupName(app[1]);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) return cleanupName(title[1].split(/[|–—·]/)[0] ?? title[1]);
  return url.hostname.replace(/^www\./, "");
}

function pickLogo(html: string, base: string): string | null {
  const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]);
  for (const rel of ["apple-touch-icon", "mask-icon", "icon", "shortcut icon"]) {
    const tag = links.find((l) => htmlAttr(l, "rel")?.toLowerCase().includes(rel));
    const href = tag ? htmlAttr(tag, "href") : null;
    if (href) return absolute(href, base);
  }
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  if (og?.[1]) return absolute(og[1], base);
  return absolute("/favicon.ico", base);
}

function normalizeColor(hex: string): string {
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return hex.toLowerCase();
}

function isUsefulColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 242 && min > 242) return false;
  if (max < 26) return false;
  return max - min >= 20;
}

function pickColors(html: string): string[] {
  const found = new Map<string, number>();
  for (const m of html.matchAll(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})/gi)) {
    const hex = normalizeColor(m[1]!);
    if (isUsefulColor(hex)) found.set(hex, 1000);
  }
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const hex = normalizeColor(m[0]);
    if (isUsefulColor(hex)) found.set(hex, (found.get(hex) ?? 0) + 1);
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex);
}

async function scrape(url: URL): Promise<Brand> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentFirstShop/0.1)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Website returned ${res.status}`);
  const html = (await res.text()).slice(0, 700_000);
  const finalUrl = new URL(res.url || url.toString());
  const colors = pickColors(html);
  return {
    name: pickName(html, finalUrl),
    domain: finalUrl.hostname.replace(/^www\./, ""),
    colors: colors.length ? colors : ["#111827", "#14b8a6", "#f8fafc"],
    logoUrl: pickLogo(html, finalUrl.toString()),
  };
}

async function fetchLogo(logoUrl: string | null): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { headers: { "User-Agent": "AgentFirstShop/0.1" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(contentType)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 4_000_000) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initials(name: string): string {
  const parts = name.match(/[A-Za-z0-9]+/g) ?? [name];
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "AF";
}

function conceptSvg(brand: Brand, variant: "crest" | "signal" | "wordmark"): string {
  const primary = brand.colors[0] ?? "#111827";
  const accent = brand.colors[1] ?? "#14b8a6";
  const light = brand.colors[2] ?? "#f8fafc";
  const name = escapeXml(brand.name);
  const mark = escapeXml(initials(brand.name));

  if (variant === "signal") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">
      <rect width="1600" height="1600" fill="none"/>
      <circle cx="800" cy="800" r="510" fill="${primary}"/>
      <circle cx="800" cy="800" r="455" fill="none" stroke="${light}" stroke-width="36"/>
      <path d="M460 970c116-300 564-300 680 0" fill="none" stroke="${accent}" stroke-width="68" stroke-linecap="round"/>
      <path d="M585 970c72-174 358-174 430 0" fill="none" stroke="${light}" stroke-width="50" stroke-linecap="round" opacity=".95"/>
      <circle cx="800" cy="930" r="58" fill="${accent}"/>
      <text x="800" y="745" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="190" font-weight="900" fill="${light}" letter-spacing="4">${mark}</text>
    </svg>`;
  }

  if (variant === "wordmark") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1200" viewBox="0 0 2200 1200">
      <rect width="2200" height="1200" rx="160" fill="none"/>
      <rect x="150" y="250" width="1900" height="500" rx="96" fill="${primary}"/>
      <path d="M320 850h1560" stroke="${accent}" stroke-width="72" stroke-linecap="round"/>
      <text x="1100" y="575" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="178" font-weight="900" fill="${light}" letter-spacing="2">${name}</text>
      <text x="1100" y="930" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="800" fill="${primary}" letter-spacing="14">EVENT EDITION</text>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">
    <rect width="1600" height="1600" fill="none"/>
    <path d="M800 145 1290 330v410c0 330-195 555-490 715-295-160-490-385-490-715V330z" fill="${primary}"/>
    <path d="M800 235 1190 382v348c0 258-145 448-390 590-245-142-390-332-390-590V382z" fill="none" stroke="${accent}" stroke-width="46"/>
    <text x="800" y="770" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="360" font-weight="950" fill="${light}">${mark}</text>
    <path d="M565 960h470" stroke="${accent}" stroke-width="60" stroke-linecap="round"/>
    <text x="800" y="1118" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="850" fill="${light}" letter-spacing="10">${name.slice(0, 18)}</text>
  </svg>`;
}

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function extension(contentType: string): string {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

async function persist(
  admin: Admin,
  bytes: Uint8Array,
  contentType: string,
  meta: { source: "ai" | "upload"; label: string; prompt: string | null; sessionKey: string; agentSource: string },
): Promise<Design | null> {
  const key = `guest/${crypto.randomUUID()}.${extension(contentType)}`;
  const file = new File([bytes], key.split("/").pop()!, { type: contentType });
  const { data: up, error: upErr } = await admin.storage.from("designs").upload(key, file);
  if (upErr || !up?.url || !up?.key) {
    console.error("brand storage upload error", upErr);
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
    console.error("brand design row error", dbErr);
    return null;
  }
  const row = (rows as Array<{ id: string }>)[0];
  return row?.id ? { id: row.id, label: meta.label, imageUrl: up.url, imageKey: up.key } : null;
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

  const url = normalizeUrl(body.url ?? "");
  if (!url) return json(400, { error: "Enter a public http(s) company URL or domain." });

  let brand: Brand;
  try {
    brand = await scrape(url);
  } catch (e) {
    return json(502, {
      error: e instanceof Error ? `Couldn't read that website: ${e.message}` : "Couldn't read that website.",
    });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });
  const sessionKey = body.sessionKey ?? "web";
  const agentSource = body.agentSource ?? "web";
  const designs: Design[] = [];

  const logo = await fetchLogo(brand.logoUrl);
  if (logo) {
    const d = await persist(admin, logo.bytes, logo.contentType, {
      source: "upload",
      label: `${brand.name} logo`,
      prompt: null,
      sessionKey,
      agentSource,
    });
    if (d) designs.push(d);
  }

  for (const variant of ["crest", "signal", "wordmark"] as const) {
    const svg = conceptSvg(brand, variant);
    const d = await persist(admin, bytesFromString(svg), "image/svg+xml", {
      source: "ai",
      label: `${brand.name} ${variant}`,
      prompt: `Transparent ${variant} merch concept for ${brand.domain}`,
      sessionKey,
      agentSource,
    });
    if (d) designs.push(d);
  }

  if (!designs.length) return json(502, { error: "Couldn't save brand designs. Check storage/function logs." });
  return json(200, { brand, designs });
}
