export async function resizeImageForChat(
  file: File,
  maxEdge = 1600,
  quality = 0.85,
): Promise<{ blob: Blob; width: number; height: number }> {
  const source = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    let blob: Blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.drawImage(source, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.drawImage(source, 0, 0, width, height);
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))),
          'image/jpeg',
          quality,
        );
      });
    }

    return { blob, width, height };
  } finally {
    source.close?.();
  }
}
