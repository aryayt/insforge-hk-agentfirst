import { z } from "zod";

/** How a design's artwork was produced. */
export const DesignSource = z.enum(["ai", "upload", "preset"]);
export type DesignSource = z.infer<typeof DesignSource>;

/** Where/how artwork sits on the product's print area (normalized 0..1). */
export const Placement = z.object({
  area: z.enum(["front", "back", "wrap"]).default("front"),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  scale: z.number().positive().default(1),
  rotationDeg: z.number().default(0),
});
export type Placement = z.infer<typeof Placement>;

/**
 * A user/agent-created design. Artwork lives in InsForge Storage — persist BOTH
 * the public `imageUrl` and the storage `imageKey` (per InsForge convention).
 *
 * Designs are authored server-side by the `generate-design` edge function (admin
 * client), so they can belong to a guest (`userId === null`, anon web or MCP) or
 * an authenticated user. Guest provenance is tracked via `sessionKey`/`agentSource`.
 */
export const DesignSpec = z.object({
  id: z.string(),
  /** Null for guest/agent-authored designs (anon web or MCP). */
  userId: z.string().nullable().default(null),
  source: DesignSource,
  /** Present when source === "ai". */
  prompt: z.string().nullable().default(null),
  /** Short human label shown in the studio / chat (defaults to a prompt slice). */
  label: z.string().nullable().default(null),
  imageUrl: z.string().url(),
  imageKey: z.string(),
  placement: Placement.default({}),
  /** Opaque per-session id grouping a guest's designs (no auth user). */
  sessionKey: z.string().nullable().default(null),
  /** Which surface created it: "web" | "agent" | "chatgpt" | … */
  agentSource: z.string().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});
export type DesignSpec = z.infer<typeof DesignSpec>;

/** The shape the `generate-design` edge function returns to callers (web + MCP). */
export const GeneratedDesign = z.object({
  id: z.string(),
  label: z.string(),
  imageUrl: z.string().url(),
  imageKey: z.string(),
});
export type GeneratedDesign = z.infer<typeof GeneratedDesign>;
