import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueInput, createInputPump } from './input-queue.mjs';

const move = (nx, ny = 0.5) => ({ type: 'mouse', kind: 'move', nx, ny, modifiers: 0 });
const wheel = (dy, nx = 0.5) => ({ type: 'mouse', kind: 'wheel', nx, ny: 0.5, deltaX: 0, deltaY: dy, modifiers: 0 });
const down = (nx) => ({ type: 'mouse', kind: 'down', nx, ny: 0.5, button: 'left', modifiers: 0 });

test('movimenti consecutivi: resta solo l\'ultimo', () => {
  const q = [];
  for (let i = 0; i < 50; i++) enqueueInput(q, move(i / 100));
  assert.equal(q.length, 1);
  assert.equal(q[0].nx, 0.49);
});

test('il click non si fonde e mantiene l\'ordine rispetto ai movimenti', () => {
  const q = [];
  enqueueInput(q, move(0.1));
  enqueueInput(q, move(0.2));
  enqueueInput(q, down(0.2));
  enqueueInput(q, move(0.3));
  assert.deepEqual(q.map((m) => m.kind), ['move', 'down', 'move']);
  assert.equal(q[0].nx, 0.2);
});

test('rotella nello stesso punto: i delta si sommano', () => {
  const q = [];
  for (let i = 0; i < 10; i++) enqueueInput(q, wheel(120));
  assert.equal(q.length, 1);
  assert.equal(q[0].deltaY, 1200);
});

test('rotella in un punto diverso: evento separato', () => {
  const q = [];
  enqueueInput(q, wheel(100, 0.2));
  enqueueInput(q, wheel(100, 0.8));
  assert.equal(q.length, 2);
});

test('pump: con renderer lento i movimenti non si accumulano e il click arriva', async () => {
  const handled = [];
  const pump = createInputPump(async (m) => {
    handled.push(m.kind);
    await new Promise((r) => setTimeout(r, 20)); // renderer lento
  });
  for (let i = 0; i < 30; i++) pump.push(move(i / 100));
  pump.push(down(0.3));
  pump.push({ ...down(0.3), kind: 'up' });
  assert.ok(pump.size <= 3, `coda ${pump.size}`);
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(handled, ['move', 'move', 'down', 'up']);
});

test('pump: un evento che fallisce non blocca i successivi', async () => {
  const handled = [];
  const pump = createInputPump(async (m) => {
    if (m.kind === 'down') throw new Error('boom');
    handled.push(m.kind);
  });
  pump.push(down(0.1));
  pump.push({ ...down(0.1), kind: 'up' });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(handled, ['up']);
});
