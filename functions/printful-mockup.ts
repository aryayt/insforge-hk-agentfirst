/**
 * printful-mockup — InsForge edge function (Deno). Renders a design on a product
 * using Printful's Mockup Generator (the `printful` MockupRenderer source from
 * packages/shared/src/mockup.ts). The web studio shows this photoreal mockup
 * beside the instant local preview.
 *
 * Flow: (1) optionally upload a bg-removed data-URL artwork to the public `designs`
 * bucket so Printful has a fetchable https URL, (2) resolve the catalog product_id
 * from the variant id, (3) POST create-task, (4) poll until completed, (5) return
 * the mockup image URL(s). Shape matches `MockupResult`.
 *
 * Secret: PRINTFUL_API_KEY. Auto-injected: API_KEY, INSFORGE_BASE_URL.
 *
 * Deploy:  bunx @insforge/cli functions deploy printful-mockup --file functions/printful-mockup.ts
 * Invoke:  insforge.functions.invoke('printful-mockup', { body: {
 *            variantId, productId?, imageUrl?, imageBase64?, placement?, taskKey?
 *          }})
 */
import { createAdminClient } from "npm:@insforge/sdk";

declare const Deno: { env: { get(name: string): string | undefined } };

const PRINTFUL_BASE_URL = "https://api.printful.com";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pfHeaders(): Record<string, string> {
  const token = Deno.env.get("PRINTFUL_API_KEY");
  if (!token) throw new Error("PRINTFUL_API_KEY secret is not set");
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const storeId = Deno.env.get("PRINTFUL_STORE_ID");
  if (storeId) h["X-PF-Store-Id"] = storeId;
  return h;
}

/** Resolve the catalog product id for a variant id (create-task is keyed by product). */
async function productIdForVariant(variantId: number): Promise<number> {
  const res = await fetch(`${PRINTFUL_BASE_URL}/products/variant/${variantId}`, {
    headers: pfHeaders(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Printful variant lookup failed (${res.status}): ${j?.error?.message ?? "unknown"}`);
  }
  const pid = j?.result?.variant?.product_id;
  if (!pid) throw new Error("Printful variant lookup returned no product_id");
  return pid;
}

/**
 * The print-area dimensions for a placement (Printful requires `files[].position`).
 * Pulled from the product's printfiles so we fill the real print box; our designs
 * are generated at the box aspect, so filling preserves their aspect.
 */
async function printArea(
  productId: number,
  variantId: number,
  placement: string,
): Promise<{ width: number; height: number }> {
  const res = await fetch(`${PRINTFUL_BASE_URL}/mockup-generator/printfiles/${productId}`, {
    headers: pfHeaders(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Printful printfiles failed (${res.status}): ${j?.error?.message ?? "unknown"}`);
  }
  const printfiles: Array<{ printfile_id: number; width: number; height: number }> =
    j?.result?.printfiles ?? [];
  const vp = (j?.result?.variant_printfiles ?? []).find(
    (v: { variant_id: number }) => v.variant_id === variantId,
  );
  const printfileId = vp?.placements?.[placement];
  const pf =
    printfiles.find((p) => p.printfile_id === printfileId) ?? printfiles[0];
  if (!pf?.width || !pf?.height) throw new Error(`No printfile dimensions for placement "${placement}"`);
  return { width: pf.width, height: pf.height };
}

/** Upload a data-URL/base64 PNG to the public designs bucket; return its https url. */
async function uploadArtwork(imageBase64: string): Promise<string> {
  const admin = createAdminClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    apiKey: Deno.env.get("API_KEY"),
  });
  const bytes = b64ToBytes(imageBase64);
  if (bytes.length > 12_000_000) throw new Error("artwork too large (max ~12MB)");
  const key = `mockups/${crypto.randomUUID()}.png`;
  const file = new File([bytes], key.split("/").pop()!, { type: "image/png" });
  const { data, error } = await admin.storage.from("designs").upload(key, file);
  if (error || !data?.url) throw new Error("Storage upload failed for mockup artwork");
  return data.url;
}

type Mockup = { variant_id?: number; mockup_url?: string; url?: string; extra?: Array<{ url?: string }> };

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: {
    variantId?: number;
    productId?: number;
    imageUrl?: string;
    imageBase64?: string;
    placement?: string;
    taskKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "JSON body required" });
  }

  const started = Date.now();
  const placement = body.placement ?? "front";

  try {
    // Re-poll path: client already has a task_key from a prior pending response.
    if (body.taskKey) {
      const result = await pollTask(body.taskKey, 24_000);
      return json(200, { ...result, elapsedMs: Date.now() - started });
    }

    if (!body.variantId) return json(400, { error: "variantId required" });

    // Printful needs a fetchable https URL. Upload bg-removed data URLs first.
    let imageUrl = body.imageUrl;
    if (body.imageBase64) imageUrl = await uploadArtwork(body.imageBase64);
    if (!imageUrl) return json(400, { error: "imageUrl or imageBase64 required" });

    const productId = body.productId ?? (await productIdForVariant(body.variantId));
    const area = await printArea(productId, body.variantId, placement);

    const createRes = await fetch(`${PRINTFUL_BASE_URL}/mockup-generator/create-task/${productId}`, {
      method: "POST",
      headers: pfHeaders(),
      body: JSON.stringify({
        variant_ids: [body.variantId],
        format: "png",
        files: [
          {
            placement,
            image_url: imageUrl,
            // Fill the print area; our artwork is generated at the box aspect.
            position: {
              area_width: area.width,
              area_height: area.height,
              width: area.width,
              height: area.height,
              top: 0,
              left: 0,
            },
          },
        ],
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      return json(502, {
        error: `Printful create-task failed (${createRes.status}): ${createJson?.error?.message ?? "unknown"}`,
      });
    }
    const taskKey = createJson?.result?.task_key;
    if (!taskKey) return json(502, { error: "Printful create-task returned no task_key" });

    const result = await pollTask(taskKey, 24_000);
    return json(200, { ...result, variantId: String(body.variantId), elapsedMs: Date.now() - started });
  } catch (e) {
    console.error("printful-mockup error", e);
    return json(502, { error: e instanceof Error ? e.message : "mockup generation failed" });
  }
}

/**
 * Poll the task until completed or the time budget runs out. On timeout returns
 * { status:'pending', taskKey } so the client can re-poll without re-creating.
 */
async function pollTask(
  taskKey: string,
  budgetMs: number,
): Promise<{ source: "printful"; status: string; imageUrl?: string; extraImageUrls?: string[]; taskKey?: string }> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${PRINTFUL_BASE_URL}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`,
      { headers: pfHeaders() },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Printful task poll failed (${res.status}): ${j?.error?.message ?? "unknown"}`);
    const status: string = j?.result?.status ?? "unknown";
    if (status === "completed") {
      const mockups: Mockup[] = j?.result?.mockups ?? [];
      const first = mockups[0];
      const imageUrl = first?.mockup_url ?? first?.url;
      const extraImageUrls = [
        ...mockups.slice(1).map((m) => m.mockup_url ?? m.url),
        ...(first?.extra ?? []).map((e) => e.url),
      ].filter((u): u is string => !!u);
      return { source: "printful", status, imageUrl, extraImageUrls };
    }
    if (status === "failed") throw new Error("Printful mockup task failed");
    await sleep(2000);
  }
  return { source: "printful", status: "pending", taskKey };
}
