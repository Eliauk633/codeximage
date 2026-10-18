import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthUser } from '../auth';
import codexMark from '../assets/codex-mark.svg';
import './login-page.css';

export type LoginPageProps = {
  onLogin(user: AuthUser, warning?: string): void;
  initialNotice?: string;
};

type Page = 'welcome' | 'login' | 'register';
type Fields = { name: string; email: string; password: string; confirmation: string };
type Field = keyof Fields;
type ValidationError = { field: Field; message: string };

function validateFields(page: Page, fields: Fields): ValidationError | undefined {
  if (page === 'register' && (!fields.name.trim() || [...fields.name.trim()].length > 40)) {
    return { field: 'name', message: '请输入 1–40 个字符的昵称。' };
  }
  const email = fields.email.trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { field: 'email', message: '请输入有效的邮箱地址。' };
  }
  if (!fields.password || [...fields.password].length > 128 || (page === 'register' && [...fields.password].length < 8)) {
    return { field: 'password', message: page === 'register' ? '请设置 8–128 个字符的密码。' : '请输入为 Codex 设置的密码，最多 128 个字符。' };
  }
  if (page === 'register' && fields.password !== fields.confirmation) {
    return { field: 'confirmation', message: '两次输入的密码不一致。' };
  }
}

export function LoginPage({ onLogin, initialNotice = '' }: LoginPageProps) {
  const [page, setPage] = useState<Page>('welcome');
  const [fields, setFields] = useState<Fields>({ name: '', email: '', password: '', confirmation: '' });
  const [visible, setVisible] = useState({ password: false, confirmation: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<Field>();
  const [notice, setNotice] = useState(initialNotice);
  const alive = useRef(false);
  const submitting = useRef(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const authAvailable = typeof window !== 'undefined' && Boolean(window.desktop?.auth);
  const registering = page === 'register';

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => { firstInput.current?.focus(); }, [page]);

  function clearPasswords() {
    setFields(previous => ({ ...previous, password: '', confirmation: '' }));
    setVisible({ password: false, confirmation: false });
  }

  function navigate(next: Page) {
    if (submitting.current) return;
    clearPasswords();
    setError('');
    setNotice('');
    setInvalidField(undefined);
    setPage(next);
  }

  function update(field: Field, value: string) {
    setFields(previous => ({ ...previous, [field]: value }));
    if (invalidField === field) {
      setError('');
      setInvalidField(undefined);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || page === 'welcome') return;
    const invalid = validateFields(page, fields);
    if (invalid) {
      setError(invalid.message);
      setInvalidField(invalid.field);
      form.current?.querySelector<HTMLInputElement>(`[name="${invalid.field}"]`)?.focus();
      return;
    }
    const auth = window.desktop?.auth;
    if (!auth) {
      setError('请在 Codex 桌面客户端中使用账号。');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    setInvalidField(undefined);
    const email = fields.email.trim();
    try {
      const result = registering
        ? await auth.register({ email, password: fields.password, name: fields.name.trim() })
        : await auth.login({ email, password: fields.password });
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.error || (registering ? '注册失败，请稍后重试。' : '登录失败，请稍后重试。'));
        return;
      }
      clearPasswords();
      if (registering) {
        setFields(previous => ({ ...previous, name: '', email: result.user.email, password: '', confirmation: '' }));
        setNotice('注册成功。请使用刚设置的密码登录。');
        setPage('login');
      } else {
        onLogin(result.user, result.warning);
      }
    } catch {
      if (alive.current) setError(registering ? '暂时无法完成注册，请稍后重试。' : '暂时无法登录，请稍后重试。');
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function description(field: Field, hint?: string) {
    return [hint, invalidField === field ? 'auth-error' : undefined].filter(Boolean).join(' ') || undefined;
  }

  function passwordField(field: 'password' | 'confirmation', label: string) {
    return <div className="auth-field">
      <label htmlFor={`auth-${field}`}>{label}</label>
      <div className="auth-password-input">
        <input id={`auth-${field}`} name={field} type={visible[field] ? 'text' : 'password'} value={fields[field]}
          maxLength={256} autoComplete={registering ? 'new-password' : 'current-password'}
          aria-invalid={invalidField === field} aria-describedby={description(field, field === 'password' ? 'auth-password-hint' : undefined)}
          onChange={event => update(field, event.currentTarget.value)} required />
        <button type="button" className="auth-password-toggle" aria-label={`${visible[field] ? '隐藏' : '显示'}${label}`}
          aria-pressed={visible[field]} aria-controls={`auth-${field}`}
          onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}>
          {visible[field] ? '隐藏' : '显示'}
        </button>
      </div>
      {field === 'password' && <p className="auth-field-hint" id="auth-password-hint">
        {registering ? '为 Codex 设置 8–128 个字符的密码' : '使用为 Codex 设置的密码'}
      </p>}
    </div>;
  }

  return <main className="auth-page">
    <div className="auth-titlebar drag-region" aria-hidden="true" />
    <section className="auth-content" aria-labelledby="auth-title">
      <header className="auth-heading">
        <img className="auth-mark" src={codexMark} alt="" width={40} height={40} draggable={false} />
        <h1 id="auth-title">{registering ? '注册 Codex' : '登录 Codex'}</h1>
      </header>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {!authAvailable && <p className="auth-environment-notice" role="status">请在 Codex 桌面客户端中使用账号。</p>}
      {page === 'welcome' ? <div className="auth-entry-actions">
        <button type="button" className="auth-primary" onClick={() => navigate('login')}>继续登录</button>
        <p className="auth-switch">还没有账号？<button type="button" className="auth-text-link" onClick={() => navigate('register')}>注册</button></p>
      </div> : <form className="auth-form" ref={form} onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset className="auth-fields" disabled={busy}>
          {registering && <div className="auth-field">
            <label htmlFor="auth-name">昵称</label>
            <input id="auth-name" name="name" ref={firstInput} value={fields.name} maxLength={80} autoComplete="nickname"
              aria-invalid={invalidField === 'name'} aria-describedby={description('name')} onChange={event => update('name', event.currentTarget.value)} required />
          </div>}
          <div className="auth-field">
            <label htmlFor="auth-email">邮箱</label>
            <input id="auth-email" name="email" ref={registering ? undefined : firstInput} type="email" inputMode="email" value={fields.email}
              maxLength={254} autoComplete={registering ? 'email' : 'username'} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-invalid={invalidField === 'email'} aria-describedby={description('email')} onChange={event => update('email', event.currentTarget.value)} required />
          </div>
          {passwordField('password', '密码')}
          {registering && passwordField('confirmation', '确认密码')}
        </fieldset>
        {error && <p className="auth-error" id="auth-error" role="alert">{error}</p>}
        <div className="auth-form-actions">
          <button type="submit" className="auth-primary" disabled={busy || !authAvailable}>
            {busy ? (registering ? '正在注册…' : '正在登录…') : (registering ? '注册' : '登录')}
          </button>
          <button type="button" className="auth-secondary" disabled={busy} onClick={() => navigate('welcome')}>返回</button>
        </div>
        <p className="auth-switch">{registering ? '已有账号？' : '还没有账号？'}
          <button type="button" className="auth-text-link" disabled={busy} onClick={() => navigate(registering ? 'login' : 'register')}>
            {registering ? '登录' : '注册'}
          </button>
        </p>
      </form>}
    </section>
  </main>;
}
