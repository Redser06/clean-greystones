import { shouldStripUpload, stripExif } from '../exif';

export interface UploadedObject {
  contentType: string;
  bytes: Uint8Array;
  metadata?: Record<string, string>;
}

/**
 * Storage-trigger body. Re-upload the returned bytes with metadata.exifStripped = "true"
 * so the trigger does not loop. See backend/README.md.
 */
export function stripExifOnUpload(object: UploadedObject): { bytes: Uint8Array; changed: boolean } {
  if (!shouldStripUpload(object.metadata, object.contentType)) {
    return { bytes: object.bytes, changed: false };
  }
  return stripExif(object.bytes, object.contentType);
}
