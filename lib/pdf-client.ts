"use client";

/** Render each PDF page (or an uploaded image) to a compressed JPEG for the extraction API. */
export async function fileToPageImages(file: File, onProgress?: (msg: string) => void): Promise<string[]> {
  if (file.type.startsWith("image/")) {
    const bmp = await createImageBitmap(file);
    return [canvasToBase64(drawScaled(bmp, bmp.width, bmp.height))];
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(`Scanning page ${i} of ${doc.numPages}…`);
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1600 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvasToBase64(canvas));
  }
  return pages;
}

function drawScaled(src: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, 1600 / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBase64(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
