import { normalizeProjectEmoji, normalizeProjectSources, projectColors, projectIcons,
  type AppState, type Project, type ProjectColor, type ProjectIcon } from './model.ts';

export type ProjectEdit = {
  name?: string;
  path?: string;
  sources?: string[];
  icon?: ProjectIcon | null;
  emoji?: string | null;
  color?: ProjectColor | null;
};

function projectName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function replaceProject(state: AppState, project: Project): AppState {
  return { ...state, projects: state.projects.map(value => value.id === project.id ? project : value) };
}

export function editProject(state: AppState, id: string, patch: ProjectEdit): AppState {
  const original = state.projects.find(project => project.id === id);
  if (!original || !Object.keys(patch).length) return state;
  if (patch.name !== undefined && !projectName(patch.name)) return state;
  if (patch.path !== undefined && (typeof patch.path !== 'string' || !patch.path.trim())) return state;
  const sources = patch.sources === undefined ? undefined : normalizeProjectSources(patch.sources);
  if (sources && !sources.length) return state;
  const project: Project = { ...original };
  if (patch.name !== undefined) project.name = projectName(patch.name);
  if (sources) {
    project.sources = sources;
    project.path = sources[0];
  } else if (patch.path !== undefined) {
    project.path = patch.path.trim();
    if (project.sources) project.sources = normalizeProjectSources([project.path, ...project.sources]);
  }
  if (patch.icon === null) delete project.icon;
  else if (patch.icon !== undefined && projectIcons.includes(patch.icon)) {
    project.icon = patch.icon;
    delete project.emoji;
  }
  if (patch.emoji === null) delete project.emoji;
  else if (patch.emoji !== undefined) {
    const emoji = normalizeProjectEmoji(patch.emoji);
    if (emoji) {
      project.emoji = emoji;
      delete project.icon;
    }
  }
  if (patch.color === null) delete project.color;
  else if (patch.color !== undefined && projectColors.includes(patch.color)) project.color = patch.color;
  return replaceProject(state, project);
}

export function setProjectPinned(state: AppState, id: string, pinned: boolean): AppState {
  const project = state.projects.find(value => value.id === id);
  if (!project || Boolean(project.pinned) === pinned) return state;
  return replaceProject(state, { ...project, pinned });
}

export function moveProjectToSection(state: AppState, id: string, sectionId: string | null): AppState {
  const original = state.projects.find(project => project.id === id);
  if (!original || (sectionId !== null && !state.projectSections.some(section => section.id === sectionId))) return state;
  if ((original.sectionId ?? null) === sectionId && !(sectionId !== null && original.pinned)) return state;
  const project = { ...original };
  if (sectionId === null) delete project.sectionId;
  else {
    project.sectionId = sectionId;
    if (project.pinned) project.pinned = false;
  }
  return replaceProject(state, project);
}

export function addProjectSection(state: AppState, name: string): AppState {
  const normalized = projectName(name);
  if (!normalized || state.projectSections.some(section => section.name === normalized)) return state;
  return { ...state, projectSections: [...state.projectSections, { id: crypto.randomUUID(), name: normalized }] };
}

export function renameProjectSection(state: AppState, id: string, name: string): AppState {
  const normalized = projectName(name);
  const original = state.projectSections.find(section => section.id === id);
  if (!original || !normalized || original.name === normalized
    || state.projectSections.some(section => section.id !== id && section.name === normalized)) return state;
  return { ...state, projectSections: state.projectSections.map(section => section.id === id ? { ...section, name: normalized } : section) };
}

export function removeProjectSection(state: AppState, id: string): AppState {
  if (!state.projectSections.some(section => section.id === id)) return state;
  return {
    ...state,
    projectSections: state.projectSections.filter(section => section.id !== id),
    projects: state.projects.map(project => {
      if (project.sectionId !== id) return project;
      const next = { ...project };
      delete next.sectionId;
      return next;
    }),
  };
}

export function archiveProjectChats(state: AppState, id: string): AppState {
  if (!state.projects.some(project => project.id === id)) return state;
  const matches = new Set(state.threads.filter(thread => thread.projectId === id && !thread.archived).map(thread => thread.id));
  if (!matches.size) return state;
  return {
    ...state,
    threads: state.threads.map(thread => matches.has(thread.id) ? { ...thread, archived: true } : thread),
    activeThreadId: state.activeThreadId && matches.has(state.activeThreadId) ? null : state.activeThreadId,
  };
}

export function removeProject(state: AppState, id: string): AppState {
  if (!state.projects.some(project => project.id === id)) return state;
  return {
    ...state,
    projects: state.projects.filter(project => project.id !== id),
    threads: state.threads.map(thread => thread.projectId === id ? { ...thread, projectId: null } : thread),
  };
}

export function restoreRemovedProject(state: AppState, project: Project, index: number, threadIds: string[]): AppState {
  if (state.projects.some(value => value.id === project.id || value.path === project.path)) return state;
  const restored = { ...project, ...(project.sources ? { sources: [...project.sources] } : {}) };
  if (restored.sectionId && !state.projectSections.some(section => section.id === restored.sectionId)) delete restored.sectionId;
  const position = Number.isFinite(index) ? Math.max(0, Math.min(state.projects.length, Math.trunc(index))) : state.projects.length;
  const projects = [...state.projects];
  projects.splice(position, 0, restored);
  const previousThreadIds = new Set(threadIds);
  return {
    ...state,
    projects,
    threads: state.threads.map(thread => thread.projectId === null && previousThreadIds.has(thread.id)
      ? { ...thread, projectId: restored.id } : thread),
  };
}
