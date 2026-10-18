import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AppState } from '../model';
import type { SettingsPreferences } from '../settings-preferences';

export function PreferenceRow({ label, description, htmlFor, children, className = '' }: { label: string; description?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return <div className={`settings-preference-row ${className}`}>
    <div className="settings-preference-copy"><label htmlFor={htmlFor}>{label}</label>{description && <p id={htmlFor ? `${htmlFor}-description` : undefined}>{description}</p>}</div>
    <div className="settings-preference-control">{children}</div>
  </div>;
}
export function SelectControl({ id, value, options, onChange, icon, label }: { id: string; value: string | number; options: readonly (string | number)[]; onChange: (value: string) => void; icon?: ReactNode; label?: string }) {
  return <span className={`settings-select-control ${icon ? 'has-icon' : ''}`}>{icon}<select id={id} aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options.map(value => <option key={value} value={value}>{({ system: '跟随系统', light: '浅色', dark: '深色' } as Record<string, string>)[value] ?? value}</option>)}</select><ChevronDown aria-hidden="true" size={13} /></span>;
}
export function Toggle({ id, checked, onChange, soft = false }: { id: string; checked: boolean; onChange: () => void; soft?: boolean }) {
  return <button id={id} className={`settings-switch ${soft ? 'is-soft' : ''}`} role="switch" aria-checked={checked} aria-describedby={`${id}-description`} onClick={onChange}><span /></button>;
}
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="settings-section">{title && <h3 className="settings-group-heading">{title}</h3>}<div className="settings-preference-group">{children}</div></section>;
}

export type SettingsSectionProps = {
  section: string;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  preferences: SettingsPreferences;
  updatePreference: <K extends keyof SettingsPreferences>(key: K, value: SettingsPreferences[K]) => void;
  demo: (title: string, text?: string) => void;
  navigate: (section: string) => void;
  onLogout: () => void;
  values: Record<string, string | boolean | number>;
  setValue: (key: string, value: string | boolean | number) => void;
};
