/**
 * Minimal server-side Printful REST client (classic v1 API, base
 * https://api.printful.com). Plain `fetch` + a bearer token — no SDK, no deps.
 *
 * SERVER-SIDE ONLY. The token (`PRINTFUL_API_KEY`) is a secret; never import this
 * from browser/`apps/web` code or anything bundled with a `VITE_` prefix.
 *
 * Docs: https://developers.printful.com/docs/
 *   - Catalog:           GET /products, GET /products/{id}
 *   - Mockup Generator:  POST /mockup-generator/create-task/{product_id}
 *                        GET  /mockup-generator/task?task_key=...
 */

const BASE = "https://api.printful.com";

export class PrintfulError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PrintfulError";
  }
}

/** Standard Printful envelope: { code, result, paging? } or { code, error }. */
type Envelope<T> = { code: number; result: T; error?: { message: string; reason?: string } };

export class PrintfulClient {
  constructor(private readonly token: string) {
    if (!token) throw new Error("PRINTFUL_API_KEY is required (see .env.example / .env.local).");
  }

  /** Read the token from the environment, returning null when unset (so callers can fall back to mock). */
  static fromEnv(): PrintfulClient | null {
    const token = process.env.PRINTFUL_API_KEY?.trim();
    return token ? new PrintfulClient(token) : null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json: Envelope<T> | undefined;
    try {
      json = text ? (JSON.parse(text) as Envelope<T>) : undefined;
    } catch {
      /* non-JSON error body */
    }

    if (!res.ok) {
      const msg = json?.error?.message ?? `${res.status} ${res.statusText}`;
      throw new PrintfulError(`Printful ${method} ${path} failed: ${msg}`, res.status, json ?? text);
    }
    return json!.result;
  }

  /** Sanity check: who/which store this token belongs to. GET /store */
  store(): Promise<unknown> {
    return this.request("GET", "/store");
  }

  /** Browse the blank-product catalog. GET /products (optionally filtered client-side). */
  listProducts(): Promise<CatalogProduct[]> {
    return this.request<CatalogProduct[]>("GET", "/products");
  }

  /** Full variant list for one catalog product. GET /products/{id} */
  getProduct(productId: number): Promise<{ product: CatalogProduct; variants: CatalogVariant[] }> {
    return this.request("GET", `/products/${productId}`);
  }

  /** Printfile specs + per-variant placement→printfile mapping. GET /mockup-generator/printfiles/{id} */
  getPrintfiles(productId: number): Promise<PrintfilesResult> {
    return this.request("GET", `/mockup-generator/printfiles/${productId}`);
  }

  /**
   * Resolve a "fill the whole print area" position for a placement, so callers
   * don't have to hand-compute one (Printful *requires* a position). The printfile's
   * `fill_mode` (usually "fit") makes Printful contain the art within this box,
   * preserving aspect — equivalent to our local print-box "contain" placement.
   */
  async defaultPosition(
    productId: number,
    variantId: number,
    placement: string,
  ): Promise<NonNullable<CreateMockupTaskRequest["files"][number]["position"]>> {
    const pf = await this.getPrintfiles(productId);
    const vp = pf.variant_printfiles.find((v) => v.variant_id === variantId) ?? pf.variant_printfiles[0];
    const printfileId = vp?.placements[placement];
    const printfile = pf.printfiles.find((p) => p.printfile_id === printfileId);
    if (!printfile) {
      throw new PrintfulError(
        `No printfile for product ${productId}, variant ${variantId}, placement "${placement}". ` +
          `Available placements: ${Object.keys(pf.available_placements).join(", ")}`,
        404,
        pf.available_placements,
      );
    }
    return {
      area_width: printfile.width,
      area_height: printfile.height,
      width: printfile.width,
      height: printfile.height,
      top: 0,
      left: 0,
    };
  }

  /**
   * Kick off a mockup render. Returns a `task_key` to poll with {@link getTask}.
   * `files[].image_url` must be publicly fetchable by Printful (https, not data:).
   */
  createMockupTask(productId: number, req: CreateMockupTaskRequest): Promise<{ task_key: string; status: string }> {
    return this.request("POST", `/mockup-generator/create-task/${productId}`, req);
  }

  /** Poll a mockup task. status: pending | completed | failed. GET /mockup-generator/task */
  getTask(taskKey: string): Promise<MockupTaskResult> {
    return this.request("GET", `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
  }

  // ── Orders ───────────────────────────────────────────────────────────────────
  // Money model: confirming an order charges YOUR Printful wallet/card (real money).
  // There is no sandbox. estimate + draft are free; only confirm bills you.

  /** Cost breakdown for an order. NO charge, NO order created. POST /orders/estimate-costs */
  estimateOrder(order: CreateOrderRequest): Promise<OrderCosts> {
    return this.request("POST", "/orders/estimate-costs", order);
  }

  /**
   * Create an order. With `confirm: false` (default) it's a DRAFT — reviewable,
   * NOT charged. With `confirm: true` it goes straight to fulfillment and bills you.
   * POST /orders?confirm=...
   */
  createOrder(order: CreateOrderRequest, opts: { confirm?: boolean } = {}): Promise<Order> {
    const q = opts.confirm ? "?confirm=true" : "";
    return this.request("POST", `/orders${q}`, order);
  }

  /** Fetch one order (status, costs, tracking). GET /orders/{id} */
  getOrder(id: number | string): Promise<Order> {
    return this.request("GET", `/orders/${id}`);
  }

  /** Confirm a draft for fulfillment. ⚠️ CHARGES your Printful account. POST /orders/{id}/confirm */
  confirmOrder(id: number | string): Promise<Order> {
    return this.request("POST", `/orders/${id}/confirm`);
  }

  /**
   * Create a mockup task and poll until it completes (or fails/times out).
   * Returns the flattened list of generated mockups.
   */
  async renderMockup(
    productId: number,
    req: CreateMockupTaskRequest,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<MockupTaskResult> {
    const intervalMs = opts.intervalMs ?? 2000;
    const timeoutMs = opts.timeoutMs ?? 60_000;

    // Printful requires a position on every file; fill any that are missing with a
    // "whole print area" default resolved from the variant's printfile.
    const files = await Promise.all(
      req.files.map(async (f) => {
        if (f.position) return f;
        const variantId = req.variant_ids[0];
        if (variantId === undefined) throw new Error("createMockupTask needs at least one variant_id");
        return { ...f, position: await this.defaultPosition(productId, variantId, f.placement) };
      }),
    );
    const { task_key } = await this.createMockupTask(productId, { ...req, files });

    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const task = await this.getTask(task_key);
      if (task.status === "completed") return task;
      if (task.status === "failed") {
        throw new PrintfulError(`Mockup task ${task_key} failed`, 200, task);
      }
      if (Date.now() > deadline) {
        throw new PrintfulError(`Mockup task ${task_key} timed out after ${timeoutMs}ms`, 408, task);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

// ── Wire types (subset of Printful's responses we actually use) ────────────────

export type CatalogProduct = {
  id: number;
  type: string;
  type_name: string;
  title: string;
  brand: string | null;
  model: string | null;
  variant_count: number;
};

export type CatalogVariant = {
  id: number;
  product_id: number;
  name: string;
  size: string;
  color: string;
  color_code: string | null;
  image: string;
  price: string;
};

export type CreateMockupTaskRequest = {
  /** Catalog variant ids to render (e.g. one colour/size). */
  variant_ids: number[];
  /** Mockup output format. */
  format?: "jpg" | "png";
  files: Array<{
    /** Placement on the product, e.g. "front", "back", "default". */
    placement: string;
    /** Publicly fetchable artwork URL (https). */
    image_url: string;
    /** Optional placement/position overrides; omit to let Printful auto-fit. */
    position?: {
      area_width: number;
      area_height: number;
      width: number;
      height: number;
      top: number;
      left: number;
    };
  }>;
};

export type OrderRecipient = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  /** State/province code, e.g. "CA". Required for US/CA/AU. */
  state_code?: string;
  /** ISO country code, e.g. "US". */
  country_code: string;
  zip: string;
  phone?: string;
  email?: string;
};

export type OrderItem = {
  /** Printful catalog variant id. */
  variant_id: number;
  quantity: number;
  /** Print files per placement; `type` is the placement (e.g. "front"). */
  files: Array<{ type?: string; url: string }>;
};

export type CreateOrderRequest = {
  recipient: OrderRecipient;
  items: OrderItem[];
};

export type OrderCosts = {
  currency: string;
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
};

export type Order = {
  id: number;
  external_id: string | null;
  status: string;
  recipient: OrderRecipient;
  costs: OrderCosts;
  retail_costs: OrderCosts;
  shipments?: Array<{ carrier: string; tracking_number: string; tracking_url: string }>;
};

export type PrintfilesResult = {
  product_id: number;
  available_placements: Record<string, string>;
  printfiles: Array<{
    printfile_id: number;
    width: number;
    height: number;
    dpi: number;
    fill_mode: string;
    can_rotate: boolean;
  }>;
  variant_printfiles: Array<{ variant_id: number; placements: Record<string, number> }>;
};

export type MockupTaskResult = {
  task_key: string;
  status: "pending" | "completed" | "failed";
  mockups?: Array<{
    placement: string;
    variant_ids: number[];
    mockup_url: string;
    extra?: Array<{ title: string; url: string }>;
  }>;
};
