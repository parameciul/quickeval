// Photos are made smaller on the phone before they are sent (spec §5, §10.4):
// at most 2000 px on the long side, JPEG quality 0.85. A JPEG that would come
// out bigger than it was is sent as it was. PDFs are sent as they are.

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

const SHRINKABLE = ['image/jpeg', 'image/png', 'image/webp'];

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// "IMG_0001.PNG" becomes "IMG_0001.jpg".
export function jpegName(name: string): string {
  return `${name.replace(/\.[^.]*$/, '') || 'poza'}.jpg`;
}

export interface DecodedPhoto {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

// How a photo is read and written again. The browser tools need a real
// browser; tests pass fakes.
export interface PhotoTools {
  decode(file: Blob): Promise<DecodedPhoto>;
  encode(source: CanvasImageSource, size: { width: number; height: number }, quality: number): Promise<Blob | null>;
}

export const browserPhotoTools: PhotoTools = {
  // createImageBitmap turns the photo the way the camera held it (EXIF orientation).
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  encode(source, size, quality) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      // A white page under transparent parts of a PNG, not a black one.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(source, 0, 0, size.width, size.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  },
};

// Returns the smaller JPEG, or the file itself when it cannot or need not change.
export async function shrinkPhoto(file: File, tools: PhotoTools = browserPhotoTools): Promise<Blob> {
  if (!SHRINKABLE.includes(file.type)) return file;
  let photo: DecodedPhoto;
  try {
    photo = await tools.decode(file);
  } catch {
    return file;
  }
  try {
    const result = await tools.encode(photo.source, fitWithin(photo.width, photo.height), JPEG_QUALITY);
    if (!result) return file;
    if (file.type === 'image/jpeg' && result.size >= file.size) return file;
    return result;
  } finally {
    photo.close();
  }
}
