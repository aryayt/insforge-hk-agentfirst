/**
 * Printful trial CLI — exercise the real API end-to-end once PRINTFUL_API_KEY is
 * set in .env.local (Bun auto-loads it). SERVER-SIDE ONLY.
 *
 *   bun run printful:check                         # verify the token (GET /store)
 *   bun run printful:discover "t-shirt"            # find catalog product ids by keyword
 *   bun run printful:variants 71                   # list a product's variant ids (color/size → id)
 *   bun run printful:mockup --product tshirt --color black --size M --art <https-url>
 *   bun run printful:mockup --product-id 71 --variant-id 4012 --art <https-url>   # raw ids, skips the map
 *
 * The `mockup` command prints the hosted mockup URL and the wall-clock time, so you
 * can compare it against the instant local SVG preview.
 */
import { readFileSync } from "node:fs";
import { PrintfulClient, type CreateOrderRequest, type OrderCosts } from "./client";
import { PrintfulRenderer } from "./renderer";
import { resolvePrintfulVariant } from "./catalog-map";
import { generateDesign } from "./design";
import { ProductType } from "@app/shared";

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function requireClient(): PrintfulClient {
  const client = PrintfulClient.fromEnv();
  if (!client) {
    console.error("✗ PRINTFUL_API_KEY is not set. Add it to .env.local (see .env.example line 28).");
    process.exit(1);
  }
  return client;
}

async function cmdCheck() {
  const client = requireClient();
  const store = await client.store();
  console.log("✓ Token works. Store:");
  console.log(JSON.stringify(store, null, 2));
}

async function cmdDiscover(query: string) {
  const client = requireClient();
  const products = await client.listProducts();
  const q = query.toLowerCase();
  const hits = q ? products.filter((p) => `${p.title} ${p.type_name} ${p.brand ?? ""} ${p.model ?? ""}`.toLowerCase().includes(q)) : products;
  console.log(`Found ${hits.length} catalog product(s)${q ? ` matching "${query}"` : ""}:`);
  for (const p of hits.slice(0, 40)) {
    console.log(`  id=${p.id}  ${p.title}  (${p.type_name}, ${p.variant_count} variants${p.brand ? `, ${p.brand}` : ""})`);
  }
  console.log("\nNext: bun run printful:variants <id>  →  fill scripts/printful/catalog-map.ts");
}

async function cmdVariants(productIdRaw: string) {
  const client = requireClient();
  const productId = Number(productIdRaw);
  if (!Number.isFinite(productId)) {
    console.error("✗ Pass a numeric product id, e.g. bun run printful:variants 71");
    process.exit(1);
  }
  const { product, variants } = await client.getProduct(productId);
  console.log(`${product.title} (id=${product.id}) — ${variants.length} variants:`);
  for (const v of variants) {
    console.log(`  variant_id=${v.id}  color="${v.color}"  size="${v.size}"  $${v.price}`);
  }
}

async function cmdMockup(flags: Record<string, string>) {
  const art = flags.art;
  if (!art || art.startsWith("data:")) {
    console.error("✗ --art must be a public https URL (Printful fetches it; data: URLs are rejected).");
    process.exit(1);
  }

  // Two modes: high-level (--product/--color/--size via the map) or raw (--product-id/--variant-id).
  if (flags["product-id"] && flags["variant-id"]) {
    const client = requireClient();
    const productId = Number(flags["product-id"]);
    const variantId = Number(flags["variant-id"]);
    const placement = flags.placement ?? "front";
    console.log(`Rendering mockup: product ${productId}, variant ${variantId}, placement "${placement}"…`);
    const startedAt = Date.now();
    const task = await client.renderMockup(productId, {
      variant_ids: [variantId],
      format: "png",
      files: [{ placement, image_url: art }],
    });
    report(task.mockups?.[0]?.mockup_url, Date.now() - startedAt, task.mockups?.[0]?.extra?.map((e) => e.url));
    return;
  }

  const renderer = PrintfulRenderer.fromEnv();
  if (!renderer) {
    console.error("✗ PRINTFUL_API_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }
  const productType = ProductType.parse(flags.product ?? "tshirt");
  const result = await renderer.render({
    artworkUrl: art,
    productType,
    color: flags.color ?? "white",
    size: flags.size ?? null,
  });
  report(result.imageUrl, result.elapsedMs, result.extraImageUrls);
}

function report(mockupUrl: string | undefined, elapsedMs: number, extra?: string[]) {
  if (!mockupUrl) {
    console.error("✗ No mockup URL returned.");
    process.exit(1);
  }
  console.log(`\n✓ Mockup ready in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  ${mockupUrl}`);
  if (extra?.length) {
    console.log("  extra angles:");
    for (const u of extra) console.log(`    ${u}`);
  }
  console.log("\nCompare this against the instant local SVG preview for the same artwork.");
}

async function cmdDesign(prompt: string) {
  if (!prompt || prompt.trim().length < 3) {
    console.error('✗ Pass a prompt, e.g. bun run printful:design "a soaring origami crane"');
    process.exit(1);
  }
  console.log(`Generating design for: "${prompt}"…`);
  const design = await generateDesign(prompt);
  console.log(`✓ Design generated and hosted publicly:`);
  console.log(`  ${design.imageUrl}`);
  console.log(`\nUse this URL as the "art" in your order spec (best on a WHITE garment).`);
}

/** Our friendly order-spec JSON → a Printful CreateOrderRequest (variants via the map). */
type OrderSpec = {
  recipient: CreateOrderRequest["recipient"];
  items: Array<{ product: string; color: string; size?: string | null; quantity?: number; art: string }>;
};

function buildOrder(specPath: string): { order: CreateOrderRequest; spec: OrderSpec } {
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as OrderSpec;
  if (!spec.recipient?.name || !spec.recipient?.address1 || !spec.recipient?.country_code) {
    throw new Error("Order spec needs recipient.name, address1, country_code (and zip/city).");
  }
  if (!spec.items?.length) throw new Error("Order spec needs at least one item.");
  const order: CreateOrderRequest = {
    recipient: spec.recipient,
    items: spec.items.map((it) => {
      if (!it.art || it.art.startsWith("data:")) {
        throw new Error(`Item ${it.product} needs a public https "art" URL (got: ${it.art ?? "none"}).`);
      }
      const productType = ProductType.parse(it.product);
      const { variantId, placement } = resolvePrintfulVariant(productType, it.color, it.size ?? null);
      return { variant_id: variantId, quantity: it.quantity ?? 1, files: [{ type: placement, url: it.art }] };
    }),
  };
  return { order, spec };
}

function printCosts(label: string, c: OrderCosts) {
  console.log(`${label} (${c.currency}):`);
  console.log(`  subtotal ${c.subtotal}  shipping ${c.shipping}  tax ${c.tax}`);
  console.log(`  ─────────────────────────`);
  console.log(`  TOTAL    ${c.total} ${c.currency}  ← what Printful charges YOU on confirm`);
}

async function cmdEstimate(specPath: string) {
  const client = requireClient();
  const { order } = buildOrder(specPath);
  const costs = await client.estimateOrder(order);
  printCosts("Estimated cost", costs);
  console.log("\nNo order created, nothing charged. Next: bun run printful:order <spec.json>");
}

async function cmdOrder(specPath: string) {
  const client = requireClient();
  const { order } = buildOrder(specPath);
  const created = await client.createOrder(order, { confirm: false });
  console.log(`✓ DRAFT order created (NOT charged). id=${created.id}  status=${created.status}`);
  printCosts("Draft cost", created.costs);
  console.log(`\nShips to: ${created.recipient.name}, ${created.recipient.address1}, ${created.recipient.city ?? ""} ${created.recipient.zip ?? ""} ${created.recipient.country_code}`);
  console.log(`\n⚠️  To actually pay & fulfill (REAL charge to your Printful account):`);
  console.log(`    bun run printful:confirm ${created.id} --yes-charge-me`);
}

async function cmdConfirm(orderId: string, flags: Record<string, string>) {
  if (flags["yes-charge-me"] !== "true") {
    console.error(
      `✗ Refusing to confirm order ${orderId} without explicit consent.\n` +
        `  Confirming CHARGES your Printful account (real money) and starts production.\n` +
        `  Re-run with the consent flag:  bun run printful:confirm ${orderId} --yes-charge-me`,
    );
    process.exit(1);
  }
  const client = requireClient();
  const order = await client.confirmOrder(orderId);
  console.log(`✓ Order ${order.id} confirmed — status=${order.status}. Printful has been charged and production started.`);
  printCosts("Charged", order.costs);
}

async function cmdOrderStatus(orderId: string) {
  const client = requireClient();
  const order = await client.getOrder(orderId);
  console.log(`Order ${order.id}: status=${order.status}`);
  printCosts("Cost", order.costs);
  for (const s of order.shipments ?? []) {
    console.log(`  shipment: ${s.carrier} ${s.tracking_number} → ${s.tracking_url}`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "check":
        await cmdCheck();
        break;
      case "discover":
        await cmdDiscover(rest.find((a) => !a.startsWith("--")) ?? "");
        break;
      case "variants":
        await cmdVariants(rest.find((a) => !a.startsWith("--")) ?? "");
        break;
      case "mockup":
        await cmdMockup(parseFlags(rest));
        break;
      case "design":
        await cmdDesign(rest.filter((a) => !a.startsWith("--")).join(" "));
        break;
      case "estimate":
        await cmdEstimate(rest.find((a) => !a.startsWith("--")) ?? "");
        break;
      case "order":
        await cmdOrder(rest.find((a) => !a.startsWith("--")) ?? "");
        break;
      case "confirm":
        await cmdConfirm(rest.find((a) => !a.startsWith("--")) ?? "", parseFlags(rest));
        break;
      case "order-status":
        await cmdOrderStatus(rest.find((a) => !a.startsWith("--")) ?? "");
        break;
      default:
        console.log("Usage: bun scripts/printful/cli.ts <check|discover|variants|mockup> [...flags]");
        console.log("See the header of this file for examples.");
        process.exit(cmd ? 1 : 0);
    }
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
