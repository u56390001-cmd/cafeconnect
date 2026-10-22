/**
 * Product image validation.
 *
 * The file extension and the browser-provided MIME type are never trusted:
 * the actual bytes are sniffed, the dimensions are read from the file header
 * and the size is capped before anything is uploaded.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_DIMENSION = 6000;

export type ImageFormat = "jpeg" | "png" | "webp";

export interface ImageInspection {
  ok: boolean;
  format?: ImageFormat;
  extension?: string;
  width?: number;
  height?: number;
  error?: string;
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Sniffs the real image type and reads the dimensions. */
export function inspectImage(buffer: Buffer): ImageInspection {
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be smaller than ${Math.round(
        MAX_IMAGE_BYTES / (1024 * 1024)
      )} MB.`,
    };
  }

  // PNG: 89 50 4E 47 ... IHDR width/height at bytes 16..24
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) {
    if (buffer.length < 24) return { ok: false, error: "The PNG file is not complete." };
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      return {
        ok: false,
        error: `Images must be at most ${MAX_IMAGE_DIMENSION}px on each side.`,
      };
    }
    return { ok: true, format: "png", extension: "png", width, height };
  }

  // JPEG: FF D8 FF ... dimensions in a SOF marker
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          return {
            ok: false,
            error: `Images must be at most ${MAX_IMAGE_DIMENSION}px on each side.`,
          };
        }
        return { ok: true, format: "jpeg", extension: "jpg", width, height };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
    return { ok: true, format: "jpeg", extension: "jpg" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length > 12 &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return { ok: true, format: "webp", extension: "webp", width, height };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { ok: true, format: "webp", extension: "webp", width, height };
    }
    return { ok: true, format: "webp", extension: "webp" };
  }

  return {
    ok: false,
    error: "Only JPG, PNG or WebP images are supported.",
  };
}

export interface ImageReference {
  assetId: string;
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  isPrimary: boolean;
  status: "ready" | "uploading" | "failed";
  createdAt: string;
}
