import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripExif, stripJpegExif, shouldStripUpload } from '../../exif';
import { stripExifOnUpload } from '../../functions/stripExif';
import { readFileSync } from 'node:fs';
import { adminEmailsFromArgs, decideAdminGrant, readAdminEmails } from '../../claims';

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

  it('reads organiser emails from the env or CLI and not from the town file', () => {
    assert.deepEqual(readAdminEmails(' Person@Example.com, other@example.com '), [
      'person@example.com',
      'other@example.com',
    ]);
    assert.deepEqual(readAdminEmails(undefined), []);
    assert.deepEqual(readAdminEmails(''), []);
    assert.deepEqual(adminEmailsFromArgs(['--emails', 'a@example.com'], 'b@example.com'), ['a@example.com']);
    assert.deepEqual(adminEmailsFromArgs(['--emails=a@example.com'], undefined), ['a@example.com']);
    assert.deepEqual(adminEmailsFromArgs([], 'b@example.com'), ['b@example.com']);
    const town = JSON.parse(readFileSync(new URL('../../../data/towns/greystones.json', import.meta.url), 'utf8')) as {
      adminAllowlist: string[];
    };
    assert.deepEqual(town.adminAllowlist, []);
    const script = readFileSync(new URL('../../scripts/grant-admins.ts', import.meta.url), 'utf8');
    assert.equal(script.includes('gmail.com'), false);
    assert.equal(script.includes('adminAllowlist'), false);
  });
});
