/**
 * Cut the background out of a generated design, leaving just the subject on a
 * transparent canvas (a PNG data URL). Generated artwork comes on a plain white
 * field; we flood-fill the white that is *connected to the image border* and
 * make only that transparent. White *inside* the subject (eyes, highlights, a
 * white logo center) is kept, which a naive global threshold would wrongly
 * erase. Edge pixels are feathered so the cutout has no hard white fringe —
 * important on a black shirt.
 */
export function removeWhiteBackground(src: string, threshold = 240): Promise<string> {
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

      const isWhite = (p: number): boolean => {
        const i = p * 4;
        return (px[i] ?? 0) >= threshold && (px[i + 1] ?? 0) >= threshold && (px[i + 2] ?? 0) >= threshold;
      };

      // Flood-fill background inward from every border pixel. Only white that is
      // reachable from an edge is background; enclosed white stays opaque.
      const bg = new Uint8Array(w * h);
      const stack: number[] = [];
      const visit = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        if (bg[p] || !isWhite(p)) return;
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

      // Apply: background → fully transparent. Then feather a 1px halo by
      // halving the alpha of kept pixels that border the cut, smoothing the edge.
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
        if (touchesBg) px[p * 4 + 3] = Math.round((px[p * 4 + 3] ?? 255) * 0.5);
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
