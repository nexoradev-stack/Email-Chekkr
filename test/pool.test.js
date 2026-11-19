// Email Chekkr — batch pool tests. Run with: npm test (no network needed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPool } from '../site/assets/js/engine/verify.js';

test('pool: keeps order, limits concurrency and reports progress', async () => {
  let running = 0;
  let peak = 0;
  const progress = [];
  const out = await runPool([3, 1, 2, 4], async (n) => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n * 5));
    running -= 1;
    return n * 10;
  }, { concurrency: 2, onProgress: (done) => progress.push(done) });
  assert.deepEqual(out, [30, 10, 20, 40]);
  assert.ok(peak <= 2);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test('pool: stops when cancelled', async () => {
  const controller = new AbortController();
  const out = await runPool([1, 2, 3, 4, 5], async (n) => { if (n === 2) controller.abort(); return n; }, { concurrency: 1, signal: controller.signal });
  assert.deepEqual(out.filter((x) => x !== undefined), [1, 2]);
});
