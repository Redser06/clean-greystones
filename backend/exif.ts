/** Removes EXIF APP1 segments from a JPEG. Other bytes are copied through. */
export function stripJpegExif(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input.slice();
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2;
  let changed = false;
  while (offset < input.length) {
    if (input[offset] !== 0xff || offset + 1 >= input.length) {
      parts.push(input.slice(offset));
      break;
    }
    const marker = input[offset + 1];
    // SOS and EOI have no length word. Keep them and everything after.
    if (marker === 0xda || marker === 0xd9) {
      parts.push(input.slice(offset));
      break;
    }
    // Standalone markers have no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(input.slice(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > input.length) {
      parts.push(input.slice(offset));
      break;
    }
    const length = (input[offset + 2] << 8) | input[offset + 3];
    if (length < 2 || offset + 2 + length > input.length) {
      parts.push(input.slice(offset));
      break;
    }
    if (marker === 0xe1) changed = true;
    else parts.push(input.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (!changed) return input.slice();
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Removes PNG eXIf / tEXt / zTXt / iTXt chunks. */
export function stripPngTextChunks(input: Uint8Array): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (input.length < 8 || !signature.every((byte, index) => input[index] === byte)) return input.slice();
  const parts: Uint8Array[] = [input.slice(0, 8)];
  let offset = 8;
  let changed = false;
  const dropped = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
  while (offset + 12 <= input.length) {
    const length = new DataView(input.buffer, input.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(input[offset + 4], input[offset + 5], input[offset + 6], input[offset + 7]);
    const chunkSize = 12 + length;
    if (offset + chunkSize > input.length) {
      parts.push(input.slice(offset));
      break;
    }
    if (dropped.has(type)) changed = true;
    else parts.push(input.slice(offset, offset + chunkSize));
    offset += chunkSize;
    if (type === 'IEND') break;
  }
  if (!changed) return input.slice();
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function stripExif(
  bytes: Uint8Array,
  contentType: string,
): { bytes: Uint8Array; changed: boolean } {
  if (contentType === 'image/jpeg') {
    const next = stripJpegExif(bytes);
    return { bytes: next, changed: next.length !== bytes.length };
  }
  if (contentType === 'image/png') {
    const next = stripPngTextChunks(bytes);
    return { bytes: next, changed: next.length !== bytes.length };
  }
  return { bytes, changed: false };
}

export function shouldStripUpload(metadata: Record<string, string> | undefined, contentType: string): boolean {
  if (metadata?.exifStripped === 'true') return false;
  return contentType === 'image/jpeg' || contentType === 'image/png';
}
