import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, projectDirectoryLabel } from '../src/project-picker.ts';

const projects = [
  { id: 'a', name: '商品项目', path: '/work/pddzdsj/' },
  { id: 'b', name: 'Codex', path: '/work/Codex' },
  { id: 'c', name: '本地工具', path: 'C:\\Work\\tools\\' },
];

test('目录尾名仅在与项目显示名不同的时候显示', () => {
  assert.equal(projectDirectoryLabel(projects[0]), 'pddzdsj');
  assert.equal(projectDirectoryLabel(projects[1]), '');
  assert.equal(projectDirectoryLabel(projects[2]), 'tools');
  assert.equal(projectDirectoryLabel({ id: 'empty', name: '空项目', path: '' }), '');
});

test('项目按名称或路径筛选，忽略大小写及首尾空格并保留原顺序', () => {
  assert.deepEqual(filterProjects(projects, '商品').map(p => p.id), ['a']);
  assert.deepEqual(filterProjects(projects, ' PDDZDSJ ').map(p => p.id), ['a']);
  assert.deepEqual(filterProjects(projects, 'work').map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(filterProjects(projects, 'missing'), []);
  assert.deepEqual(filterProjects(projects, ' '), projects);
});
