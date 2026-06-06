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
 */
export const DesignSpec = z.object({
  id: z.string(),
  userId: z.string(),
  source: DesignSource,
  /** Present when source === "ai". */
  prompt: z.string().nullable().default(null),
  imageUrl: z.string().url(),
  imageKey: z.string(),
  placement: Placement.default({}),
  createdAt: z.string().datetime().optional(),
});
export type DesignSpec = z.infer<typeof DesignSpec>;
