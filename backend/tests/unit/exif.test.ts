import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripExif, stripJpegExif, shouldStripUpload } from '../../exif';
import { stripExifOnUpload } from '../../functions/stripExif';
import { decideAdminGrant } from '../../claims';

function jpegWithExif(): Uint8Array {
  const exif = new TextEncoder().encode('Exif\0\0GPS');
  const length = exif.length + 2;
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff,
    ...exif,
    0xff, 0xd9,
  ]);
}

describe('exif and admin claims', () => {
  it('strips JPEG APP1 and leaves the SOI and EOI in place', () => {
    const input = jpegWithExif();
    const output = stripJpegExif(input);
    assert.deepEqual([...output], [0xff, 0xd8, 0xff, 0xd9]);
    assert.equal(new TextDecoder().decode(output).includes('Exif'), false);
    const wrapped = stripExifOnUpload({ contentType: 'image/jpeg', bytes: input });
    assert.equal(wrapped.changed, true);
    assert.equal(stripExifOnUpload({
      contentType: 'image/jpeg',
      bytes: input,
      metadata: { exifStripped: 'true' },
    }).changed, false);
    assert.equal(shouldStripUpload(undefined, 'image/webp'), false);
    assert.equal(stripExif(Uint8Array.from([1, 2, 3]), 'image/webp').changed, false);
  });

  it('grants a town claim only for an allowlisted email', () => {
    const denied = decideAdminGrant({
      email: 'person@example.com',
      townId: 'greystones',
      allowlist: [],
      currentTowns: [],
    });
    assert.equal(denied.ok, false);
    const granted = decideAdminGrant({
      email: 'Person@Example.com',
      townId: 'greystones',
      allowlist: ['person@example.com'],
      currentTowns: ['bray'],
    });
    assert.equal(granted.ok, true);
    if (granted.ok) assert.deepEqual(granted.claim.admin.towns, ['bray', 'greystones']);
    assert.equal(decideAdminGrant({
      email: undefined,
      townId: 'greystones',
      allowlist: ['person@example.com'],
      currentTowns: [],
    }).ok, false);
  });
});
