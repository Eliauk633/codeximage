import type { Project } from './model';

export function projectDirectoryLabel(project: Project): string {
  const directory = project.path.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  return directory === project.name ? '' : directory;
}

export function filterProjects(projects: Project[], query: string): Project[] {
  const term = query.trim().toLocaleLowerCase();
  return projects.filter(project => `${project.name}\n${project.path}`.toLocaleLowerCase().includes(term));
}
