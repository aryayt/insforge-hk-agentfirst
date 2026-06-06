/**
 * Cut the background out of a generated design, leaving just the subject on a
 * transparent canvas (a PNG data URL).
 *
 * The model's "white" backdrop is rarely pure #FFF — it's a soft off-white or
 * light-gray field, sometimes with a faint vignette, and the subject's edge is
 * antialiased. So we don't key on a fixed white threshold (that leaves a gray
 * frame and a white halo). Instead:
 *   1. Sample the actual background colour from the four corners.
 *   2. Flood-fill inward from the border, treating a pixel as background while
 *      it stays within `tolerance` colour-distance of that sample — so only the
 *      border-connected field is removed; interior whites (snowcaps, eyes) stay.
 *   3. Feather a soft band: kept pixels close to the cut get graduated alpha by
 *      how background-like they are, killing the fringe on a dark shirt.
 *
 * `tolerance` is RGB Euclidean distance (0–441). ~70 handles off-white/gray.
 */
export function removeWhiteBackground(src: string, tolerance = 72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const px = imageData.data;

      // Seed the key from the median-ish of the four corners (robust to a noisy
      // corner). If corners aren't a light field, bail to avoid eating the art.
      const cornerAt = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0] as const;
      };
      const corners = [
        cornerAt(0, 0),
        cornerAt(w - 1, 0),
        cornerAt(0, h - 1),
        cornerAt(w - 1, h - 1),
      ];
      const seed: [number, number, number] = [
        Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
        Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
        Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
      ];

      const dist = (p: number): number => {
        const i = p * 4;
        const dr = (px[i] ?? 0) - seed[0];
        const dg = (px[i + 1] ?? 0) - seed[1];
        const db = (px[i + 2] ?? 0) - seed[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      // Flood-fill from the border across pixels within `tolerance` of the seed.
      const SOFT = tolerance * 1.6; // outer edge of the feather band
      const bg = new Uint8Array(w * h);
      const stack: number[] = [];
      const visit = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        if (bg[p] || dist(p) > tolerance) return;
        bg[p] = 1;
        stack.push(p);
      };
      for (let x = 0; x < w; x++) {
        visit(x, 0);
        visit(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        visit(0, y);
        visit(w - 1, y);
      }
      while (stack.length) {
        const p = stack.pop() as number;
        const x = p % w;
        const y = (p / w) | 0;
        visit(x + 1, y);
        visit(x - 1, y);
        visit(x, y + 1);
        visit(x, y - 1);
      }

      // Background → transparent. Kept pixels bordering the cut that are still
      // background-ish (dist < SOFT) get graduated alpha to feather the fringe.
      for (let p = 0; p < w * h; p++) {
        if (bg[p]) {
          px[p * 4 + 3] = 0;
          continue;
        }
        const x = p % w;
        const y = (p / w) | 0;
        const touchesBg =
          (x > 0 && bg[p - 1]) ||
          (x < w - 1 && bg[p + 1]) ||
          (y > 0 && bg[p - w]) ||
          (y < h - 1 && bg[p + w]);
        if (touchesBg) {
          const d = dist(p);
          if (d < SOFT) {
            const k = (d - tolerance) / (SOFT - tolerance); // 0 at edge → 1 fully kept
            const a = Math.max(0, Math.min(1, k));
            px[p * 4 + 3] = Math.round((px[p * 4 + 3] ?? 255) * a);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("export failed"));
      }
    };
    img.onerror = () => reject(new Error("could not load image"));
    img.src = src;
  });
}

/** Read an uploaded file as a data URL (for "upload your own art"). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed"));
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}
