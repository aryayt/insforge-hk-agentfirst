import type { Cart, CartItem } from "@app/shared";
import { admin } from "./insforge";

/** Find the user's open cart, optionally creating one. At most one open cart per user (DB unique index). */
async function getOpenCartId(userId: string, create: boolean): Promise<string | null> {
  const { data, error } = await admin.database
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "open")
    .limit(1);
  if (error) throw error;
  const existing = (data as { id: string }[])[0];
  if (existing) return existing.id;
  if (!create) return null;

  const { data: inserted, error: insErr } = await admin.database
    .from("carts")
    .insert([{ user_id: userId, status: "open" }])
    .select();
  if (insErr) throw insErr;
  const created = (inserted as { id: string }[])[0];
  if (!created) throw new Error("Failed to create cart.");
  return created.id;
}

type CartItemRow = {
  id: string;
  cart_id: string;
  variant_id: string;
  design_id: string | null;
  qty: number;
  unit_price_cents: number;
};

function toCartItem(r: CartItemRow): CartItem {
  return {
    id: r.id,
    cartId: r.cart_id,
    variantId: r.variant_id,
    designId: r.design_id,
    qty: r.qty,
    unitPriceCents: r.unit_price_cents,
  };
}

/** The user's open cart with its items, or null if they have none. */
export async function getCart(userId: string): Promise<Cart | null> {
  const cartId = await getOpenCartId(userId, false);
  if (!cartId) return null;
  const { data, error } = await admin.database
    .from("cart_items")
    .select()
    .eq("cart_id", cartId);
  if (error) throw error;
  return {
    id: cartId,
    userId,
    status: "open",
    items: (data as CartItemRow[]).map(toCartItem),
  };
}

/** Add a variant (optionally with a design) to the user's open cart, snapshotting unit price. */
export async function addToCart(
  userId: string,
  sku: string,
  designId: string | null,
  qty: number,
): Promise<Cart> {
  const { data: variants, error: vErr } = await admin.database
    .from("variants")
    .select("id, product_id, price_delta_cents")
    .eq("sku", sku)
    .limit(1);
  if (vErr) throw vErr;
  const variant = (variants as { id: string; product_id: string; price_delta_cents: number }[])[0];
  if (!variant) throw new Error(`No variant with sku "${sku}".`);

  const { data: products, error: pErr } = await admin.database
    .from("products")
    .select("base_price_cents")
    .eq("id", variant.product_id)
    .limit(1);
  if (pErr) throw pErr;
  const product = (products as { base_price_cents: number }[])[0];
  if (!product) throw new Error(`Variant "${sku}" has no product.`);
  const unitPriceCents = product.base_price_cents + variant.price_delta_cents;

  // A design is optional, but if given it must belong to this user.
  if (designId) {
    const { data: designs, error: dErr } = await admin.database
      .from("designs")
      .select("id")
      .eq("id", designId)
      .eq("user_id", userId)
      .limit(1);
    if (dErr) throw dErr;
    if (!(designs as unknown[]).length) throw new Error(`No design "${designId}" for this user.`);
  }

  const cartId = (await getOpenCartId(userId, true)) as string;
  const { error: insErr } = await admin.database.from("cart_items").insert([
    {
      cart_id: cartId,
      user_id: userId,
      variant_id: variant.id,
      design_id: designId,
      qty,
      unit_price_cents: unitPriceCents,
    },
  ]);
  if (insErr) throw insErr;

  return (await getCart(userId)) as Cart;
}
