import { BookOpen, BriefcaseBusiness, Code2, FolderOpen, Globe2, Layers, Sparkles, SquareTerminal } from 'lucide-react';
import { normalizeProjectEmoji } from '../model';
import './project-actions.css';

export const projectAppearanceIcons = {
  folder: { label: '文件夹', icon: FolderOpen }, code: { label: '代码', icon: Code2 },
  terminal: { label: '终端', icon: SquareTerminal }, globe: { label: '网站', icon: Globe2 },
  briefcase: { label: '工作', icon: BriefcaseBusiness }, book: { label: '文档', icon: BookOpen },
  sparkles: { label: '创意', icon: Sparkles }, layers: { label: '图层', icon: Layers },
};
export const projectAppearanceColors = {
  gray: { label: '灰色', value: '#7d8188' }, red: { label: '红色', value: '#df5f5b' },
  orange: { label: '橙色', value: '#e8933b' }, green: { label: '绿色', value: '#46a86c' },
  blue: { label: '蓝色', value: '#4289ef' }, purple: { label: '紫色', value: '#9d71d9' },
  pink: { label: '粉色', value: '#d974a7' },
};
export type ProjectAppearance = { icon?: keyof typeof projectAppearanceIcons | null; color?: keyof typeof projectAppearanceColors | null; emoji?: string | null };

export function ProjectAppearanceIcon({ project, size = 16 }: { project: ProjectAppearance; size?: number }) {
  const emoji = normalizeProjectEmoji(project.emoji);
  if (emoji) return <span aria-hidden="true" className="project-appearance-emoji" style={{ width: size, height: size, fontSize: size }}>{emoji}</span>;
  const Icon = projectAppearanceIcons[project.icon as keyof typeof projectAppearanceIcons]?.icon ?? FolderOpen;
  const color = projectAppearanceColors[project.color as keyof typeof projectAppearanceColors]?.value ?? 'var(--muted)';
  return <Icon aria-hidden="true" size={size} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />;
}
