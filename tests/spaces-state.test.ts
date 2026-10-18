import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteSpaceItem, purgeSpaceTrash, restoreSpaceItem, restoreSpacesState, safeSpaceUrl, spaceActivityLabel, updateSpaceItem, validateSpacesState, spacesLimits, type SpaceItem } from '../src/spaces-state.ts';

const now = new Date('2026-10-17T12:00:00+08:00').getTime();

test('spaces initialize screenshot pages relative to the current date', () => {
  const state = restoreSpacesState(undefined, now);
  assert.deepEqual(state.items.filter(item => item.kind === 'page').map(item => [item.title, spaceActivityLabel(item.updatedAt, now)]), [['项目跟踪表', '1 周'], ['待办清单', '2 周']]);
  assert.equal(validateSpacesState(state), null);
  assert.deepEqual(state.spaces, []);
  assert.equal(state.view, 'list');
});

test('restoration clones only supported fields and retains empty saved libraries', () => {
  const state = restoreSpacesState(undefined, now);
  const saved = { ...state, unwanted: 'discard', items: state.items.map(item => ({ ...item, ignored: true })) };
  const restored = restoreSpacesState(saved);
  assert.deepEqual(restored, state);
  restored.items[0].title = 'changed';
  assert.notEqual(saved.items[0].title, 'changed');
  assert.deepEqual(restoreSpacesState({ schema: 1, items: [], spaces: [], view: 'grid' }), { schema: 1, items: [], spaces: [], view: 'grid' });
});

test('damaged persisted state throws instead of overwriting user content', () => {
  const state = restoreSpacesState(undefined, now);
  for (const data of [{}, [], { ...state, schema: 2 }, { ...state, items: 'broken' }, { ...state, view: 'bad' }, { ...state, items: [{ ...state.items[0], updatedAt: NaN }] }, { ...state, items: [state.items[0], state.items[0]] }]) {
    assert.throws(() => restoreSpacesState(data));
  }
});

test('create and edit preserve other content and validate before returning a new state', () => {
  const state = restoreSpacesState(undefined, now);
  const item: SpaceItem = { ...state.items[0], id: 'new-page', title: '新页面', content: '<script>alert(1)</script>', createdAt: now, updatedAt: now };
  const added = updateSpaceItem(state, item);
  assert.equal(added.items.length, state.items.length + 1);
  assert.equal(state.items.length, 7);
  const edited = updateSpaceItem(added, { ...item, title: '修改后' });
  assert.equal(edited.items.at(-1)?.title, '修改后');
  assert.equal(edited.items.at(-1)?.content, item.content);
  assert.throws(() => updateSpaceItem(state, { ...item, title: '  ' }));
  assert.throws(() => updateSpaceItem(state, { ...item, spaceId: 'missing' }));
});

test('trash and recovery preserve content and original update times', () => {
  const state = restoreSpacesState(undefined, now);
  const deleted = deleteSpaceItem(state, state.items[0].id, now);
  assert.equal(deleted.items[0].deletedAt, now);
  assert.equal(state.items[0].deletedAt, null);
  assert.deepEqual(restoreSpaceItem(deleted, state.items[0].id), state);
  assert.equal(deleteSpaceItem(state, 'missing', now), state);
});

test('spaces references and collection limits are enforced', () => {
  const state = restoreSpacesState(undefined, now);
  const assigned = { ...state, spaces: [{ id: 'team', name: '工作资料' }], items: [{ ...state.items[0], spaceId: 'team' }] };
  assert.equal(validateSpacesState(assigned), null);
  assert.ok(validateSpacesState({ ...assigned, spaces: [] }));
  assert.ok(validateSpacesState({ ...assigned, spaces: [...assigned.spaces, ...assigned.spaces] }));
  assert.ok(validateSpacesState({ ...state, items: Array.from({ length: spacesLimits.items + 1 }, (_, i) => ({ ...state.items[0], id: `p-${i}` })) }));
  assert.ok(validateSpacesState({ ...state, items: [{ ...state.items[0], content: 'a'.repeat(spacesLimits.content + 1) }] }));
});

test('only secure site links and bounded raster image data are accepted', () => {
  assert.equal(safeSpaceUrl('https://example.com/path', 'site'), true);
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com', 'https://user:password@example.com']) assert.equal(safeSpaceUrl(url, 'site'), false);
  assert.equal(safeSpaceUrl('data:image/png;base64,aGVsbG8=', 'image'), true);
  assert.equal(safeSpaceUrl('data:image/svg+xml;base64,aGVsbG8=', 'image'), false);
  assert.equal(safeSpaceUrl('https://example.com/pixel.png', 'image'), false);
  assert.equal(safeSpaceUrl('https://example.com', 'page'), false);
});

test('invalid names, times, and oversized combined content fail validation', () => {
  const state = restoreSpacesState(undefined, now);
  for (const patch of [{ title: 'line\nbreak' }, { title: 'x'.repeat(161) }, { createdAt: now + 1, updatedAt: now }, { deletedAt: Infinity }, { shared: 'yes' }]) {
    assert.ok(validateSpacesState({ ...state, items: [{ ...state.items[0], ...patch }] }));
  }
  assert.ok(validateSpacesState({ ...state, items: Array.from({ length: 85 }, (_, i) => ({ ...state.items[0], id: `p-${i}`, content: 'a'.repeat(100_000) })) }));
});

test('capacity measures serialized UTF-8 bytes, including Chinese and JSON escapes', () => {
  const state = restoreSpacesState(undefined, now);
  const ascii = { ...state, items: Array.from({ length: 30 }, (_, i) => ({ ...state.items[0], id: `p-${i}`, content: 'a'.repeat(100_000) })) };
  assert.equal(validateSpacesState(ascii), null);
  assert.match(validateSpacesState({ ...ascii, items: ascii.items.map(item => ({ ...item, content: '中'.repeat(100_000) })) })!, /8 MB/);
  const escaped = { ...state, items: Array.from({ length: 85 }, (_, i) => ({ ...state.items[0], id: `p-${i}`, content: '\n'.repeat(50_000) })) };
  assert.match(validateSpacesState(escaped)!, /8 MB/);
  assert.equal(validateSpacesState({ ...state, unused: 'x'.repeat(spacesLimits.totalBytes) }), null);
});

test('permanent removal affects only trash and frees a full collection slot', () => {
  const initial = restoreSpacesState(undefined, now);
  const full = { ...initial, items: Array.from({ length: spacesLimits.items }, (_, i) => ({ ...initial.items[0], id: `p-${i}` })) };
  const trashed = deleteSpaceItem(deleteSpaceItem(full, 'p-0', now), 'p-1', now);
  const one = purgeSpaceTrash(trashed, 'p-0');
  assert.equal(one.items.length, spacesLimits.items - 1);
  assert.equal(one.items.find(item => item.id === 'p-1')?.deletedAt, now);
  assert.equal(purgeSpaceTrash(one, 'p-2').items.length, one.items.length);
  assert.equal(updateSpaceItem(one, { ...initial.items[0], id: 'replacement' }).items.length, spacesLimits.items);
  const cleared = purgeSpaceTrash(trashed);
  assert.equal(cleared.items.length, spacesLimits.items - 2);
  assert.ok(cleared.items.every(item => item.deletedAt === null));
  assert.equal(trashed.items.length, spacesLimits.items);
});
