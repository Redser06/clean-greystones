import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { basemapForKey, googleTileUrl, osmBasemap } from '../lib/basemap';

describe('basemap', () => {
  it('uses OpenStreetMap when no key is configured', async () => {
    let called = false;
    const basemap = await basemapForKey('  ', async () => {
      called = true;
      return new Response(null, { status: 500 });
    });
    assert.equal(called, false);
    assert.equal(basemap.provider, 'osm');
    assert.equal(basemap.url, osmBasemap().url);
    assert.doesNotMatch(basemap.url, /google/);
  });

  it('uses a keyed Google session and never the unsigned tile host', async () => {
    const basemap = await basemapForKey('test-key', async () => {
      return new Response(JSON.stringify({ session: 'abc 123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    assert.equal(basemap.provider, 'google');
    assert.equal(basemap.url, googleTileUrl('test-key', 'abc 123'));
    assert.match(basemap.url, /session=abc%20123/);
    assert.match(basemap.url, /key=test-key/);
    assert.doesNotMatch(basemap.url, /mt1\.google\.com/);
  });

  it('falls back to OpenStreetMap when Google rejects the key', async () => {
    const basemap = await basemapForKey('bad-key', async () => new Response('no', { status: 403 }));
    assert.equal(basemap.provider, 'osm');
  });
});
