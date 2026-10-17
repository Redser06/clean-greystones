import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('deploy gate', () => {
  it('keeps the prod secret off pull-request jobs and off the shared project', () => {
    const workflow = read('.github/workflows/deploy.yml');
    const preview = workflow.split('deploy-demo-preview')[1] ?? '';
    assert.equal(preview.length > 0, true);
    assert.equal(preview.includes('FIREBASE_SERVICE_ACCOUNT'), false);
    assert.equal(preview.includes('FIREBASE_DEMO_SERVICE_ACCOUNT'), true);
    assert.equal(workflow.includes('hosting:roads-prod'), false);
    assert.equal(workflow.includes('rapid-prototyping-4134c'), false);
    assert.match(workflow, /environment:\s*prod/);
    assert.equal(workflow.includes('--project greystones-civic '), true);
    assert.equal(workflow.includes('--project greystones-civic-demo '), true);
    assert.equal(workflow.includes('--only hosting:clean-prod'), true);

    const project = read('.firebaserc');
    assert.equal(project.includes('rapid-prototyping-4134c'), false);
    assert.equal(project.includes('"default": "greystones-civic"'), true);
    assert.equal(read('data/towns/greystones.json').includes('"firebaseProject": "greystones-civic"'), true);

    const ci = read('.github/workflows/ci.yml');
    assert.equal(ci.includes('vars.VITE_FIREBASE_API_KEY'), true);
    assert.equal(ci.includes('secrets.VITE_FIREBASE_API_KEY'), false);
    assert.equal(workflow.includes('vars.VITE_FIREBASE_API_KEY'), true);
    assert.equal(workflow.includes('secrets.VITE_FIREBASE_API_KEY'), false);
    assert.equal(ci.includes('FIREBASE_SERVICE_ACCOUNT'), false);
  });
});
