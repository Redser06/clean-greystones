import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COUNCILLOR_EMAILS, GREYSTONES_COUNCILLORS } from '../data/councillors';
import { buildCouncillorEmail, buildMailto, TONE_OPTIONS } from '../lib/emailBuilder';
import { LITTER_ACT_SECTION_22_URL } from '../lib/legal';
import type { MonthStat } from '../lib/monthlyStat';

const stat: MonthStat = { thisMonth: 4, lastMonth: 2, delta: 2 };

function decodeBody(mailto: string): string {
  const start = mailto.indexOf('body=');
  return decodeURIComponent(mailto.slice(start + 'body='.length));
}

describe('email builder', () => {
  it('offers three polite tones and preselects the six councillors', () => {
    assert.equal(TONE_OPTIONS.length, 3);
    assert.equal(GREYSTONES_COUNCILLORS.length, 6);
    assert.deepEqual(
      COUNCILLOR_EMAILS.sort(),
      [
        'lfenelongaskin@wicklowcoco.ie',
        'lscott@wicklowcoco.ie',
        'mbarry@wicklowcoco.ie',
        'ofinn@wicklowcoco.ie',
        'sstokes@wicklowcoco.ie',
        'tfortune@wicklowcoco.ie',
      ].sort(),
    );
  });

  it('encodes a mailto that round-trips the subject, body and recipients', () => {
    const draft = buildCouncillorEmail({
      toneId: 'patrols',
      councillorIds: GREYSTONES_COUNCILLORS.map((councillor) => councillor.id),
      includeEnvironmentOffice: true,
      signOff: 'Alex',
      stat,
    });

    assert.equal(draft.canSend, true);
    assert.equal(draft.to.length, 6);
    for (const email of COUNCILLOR_EMAILS) {
      assert.ok(draft.mailto.startsWith('mailto:') && draft.mailto.includes(email));
    }
    assert.match(draft.mailto, /cc=envcomplaints%40wicklowcoco\.ie/);
    assert.match(draft.mailto, /subject=Request%20for%20patrols%20in%20Greystones/);
    const body = decodeBody(draft.mailto);
    assert.equal(body, draft.body);
    assert.match(body, /4 reports this month, 2 more than last month/);
    assert.match(body, new RegExp(LITTER_ACT_SECTION_22_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(body, /may result in a fixed penalty/);
    assert.match(body, /Kind regards,\nAlex/);
    assert.doesNotMatch(body, /€250|Verified|Myth-Buster|Bombard/);
    assert.match(draft.plainText, /^To: .+\nCc: envcomplaints@wicklowcoco\.ie\nSubject: /);
  });

  it('omits a councillor who is not selected and refuses an empty recipient list', () => {
    const one = buildCouncillorEmail({
      toneId: 'factual',
      councillorIds: ['cllr-stokes'],
      includeEnvironmentOffice: false,
      signOff: 'A Greystones resident',
      stat,
    });
    assert.deepEqual(one.to, ['sstokes@wicklowcoco.ie']);
    assert.equal(one.cc.length, 0);
    assert.doesNotMatch(one.mailto, /lscott@wicklowcoco\.ie/);
    assert.match(one.mailto, /subject=Dog%20fouling%20reports%20in%20Greystones/);

    const none = buildCouncillorEmail({
      toneId: 'bins',
      councillorIds: [],
      includeEnvironmentOffice: true,
      signOff: '',
      stat,
    });
    assert.equal(none.canSend, false);
    assert.equal(none.mailto, '');
    assert.match(none.body, /A Greystones resident/);
    assert.match(none.body, /review litter bins/);
  });

  it('percent-encodes newlines in the body', () => {
    const mailto = buildMailto(['a@example.com'], [], 'Hello', 'Line one\nLine two');
    assert.match(mailto, /body=Line%20one%0ALine%20two/);
  });
});
