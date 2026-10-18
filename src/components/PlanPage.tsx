import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, Bot, Brain, BriefcaseBusiness, Building2, Check, CircleDollarSign, GitBranch, Images, LockKeyhole, Megaphone, MessagesSquare, Orbit, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, Telescope, Users, type LucideIcon } from 'lucide-react';
import type { AuthResult } from '../auth';
import type { UsagePlan } from '../usage-demo';
import { Dialog } from './ui';
import './plan-page.css';

type Props = { currentPlan: string; onClose: () => void; onSelect: (plan: UsagePlan) => Promise<AuthResult> };
type Feature = [LucideIcon, string];
const goFeatures: Feature[] = [[MessagesSquare, '更多使用工具的消息额度'], [Images, '更多图像创建额度'], [Brain, '更多记忆和存储空间'], [AudioLines, '更多语音聊天额度'], [Megaphone, '有广告']];
const plusFeatures: Feature[] = [[Sparkles, '面向复杂工作的高级智能'], [Images, '更高质量的图像生成'], [BriefcaseBusiness, '工作智能体可跨应用和文件执行操作'], [Bot, '借助 Codex 自动完成编程工作'], [Brain, '扩展记忆和 20 GB 存储空间'], [GitBranch, '电子邮箱和日历连接'], [BriefcaseBusiness, '更大的项目，助你整理工作'], [CircleDollarSign, '个人理财和数据分析工具'], [Check, '无广告']];
const proFeatures: Feature[] = [[Telescope, '我们最强大的前沿 Pro 模型'], [Orbit, 'Dot，你的全天候在线智能体'], [Bot, '更多工作模式和 Codex 使用额度'], [Brain, '最大记忆容量和 100 GB 存储空间'], [RefreshCw, '抢先体验新工具和模型'], [SlidersHorizontal, '提供多档使用额度'], [Check, '无广告']];
const businessFeatures: Feature[] = [[Users, '为团队提供共享工作空间'], [BriefcaseBusiness, '跨应用、文件和项目协作'], [Building2, '统一管理团队成员和工作空间'], [LockKeyhole, '管理成员访问权限'], [ShieldCheck, '保护团队数据和工作内容'], [Check, '无广告']];

function Features({ items }: { items: Feature[] }) {
  return <ul className="plan-features">{items.map(([Icon, text]) => <li key={text}><Icon size={19} aria-hidden="true" /><span>{text}</span></li>)}</ul>;
}

export function PlanPage({ currentPlan, onClose, onSelect }: Props) {
  const root = useRef<HTMLDialogElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [category, setCategory] = useState<'个人' | 'Business'>('个人');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proOpen, setProOpen] = useState(false);
  const [proLevel, setProLevel] = useState<UsagePlan>(currentPlan === 'ChatGPT Pro 200' ? currentPlan : 'ChatGPT Pro 100');
  const [details, setDetails] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    const dialog = root.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    backButton.current?.focus({ preventScroll: true });
    return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  async function selectPlan(plan: UsagePlan) {
    if (saving) return;
    if (plan === currentPlan) { onClose(); return; }
    setError('');
    setSaving(true);
    try {
      const result = await onSelect(plan);
      if (!result.ok) { setError(result.error); return; }
      onClose();
    } catch { setError('套餐未保存，请重试。'); }
    finally { setSaving(false); }
  }

  function actionLabel(plan: UsagePlan, label: string) {
    return saving ? '正在保存…' : currentPlan === plan ? '当前套餐' : label;
  }

  return <dialog ref={root} className="plan-page" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!saving && !proOpen && !details) onClose(); }}>
    <header className="plan-page-bar drag-region"><button ref={backButton} disabled={saving} onClick={onClose}><ArrowLeft size={15} />返回 ChatGPT</button></header>
    <div className="plan-page-scroll">
      <main className="plan-page-content">
        <h1 id={titleId}>升级套餐</h1>
        <div className="plan-category" role="tablist" aria-label="套餐类型">{(['个人', 'Business'] as const).map(name => <button key={name} role="tab" aria-selected={category === name} disabled={saving} onClick={() => { setCategory(name); setError(''); }}>{name}</button>)}</div>
        {error && !proOpen && <p className="plan-save-error" role="alert">{error}</p>}
        {category === '个人' ? <div className="plan-grid">
          <article className="plan-tier">
            <div className="plan-tier-name"><h2>Go</h2></div><h3>更多使用权限</h3><p className="plan-description">使用更多核心智能额度，写作、了解、创建和聊天都更多。</p>
            <button className="plan-select" disabled={saving} onClick={() => void selectPlan('ChatGPT Go')}>{actionLabel('ChatGPT Go', '切换至 Go')}</button>
            <div className="plan-price"><span className="plan-price-amount"><sup>$</sup>8</span><span>/ 月</span></div>
            <Features items={goFeatures} />
            <footer className="plan-tier-footer">此套餐可能包含广告。<button disabled={saving} onClick={() => setDetails({ title: '关于 Go 套餐', text: 'Go 提供更多消息、图像创建、记忆和语音使用额度，套餐可能包含广告。' })}>了解更多</button></footer>
          </article>
          <article className="plan-tier">
            <div className="plan-tier-name"><h2>Plus</h2></div><h3>你的 AI 助手</h3><p className="plan-description">不止于对话，让 AI 在你最喜爱的应用中与你一起执行操作。</p>
            <button className="plan-select" disabled={saving} onClick={() => void selectPlan('ChatGPT Plus')}>{actionLabel('ChatGPT Plus', '切换至 Plus')}</button>
            <div className="plan-price"><span className="plan-price-amount"><sup>$</sup>20</span><span>/ 月</span></div>
            <Features items={plusFeatures} />
            <footer className="plan-tier-footer"><button disabled={saving} onClick={onClose}>管理我的订阅</button></footer>
          </article>
          <article className="plan-tier plan-tier-pro">
            <div className="plan-tier-name"><h2>Pro</h2><span className="plan-recommended">推荐</span></div><h3>顶级能力</h3><p className="plan-description">面向在整个工作日都依赖我们最强智能的用户。</p>
            <button className="plan-select" disabled={saving} onClick={() => { setError(''); setProOpen(true); }}><Sparkles size={19} fill="currentColor" />升级订阅，获取更多使用额度</button>
            <div className="plan-price"><span className="plan-price-prefix">起价</span><span className="plan-price-amount"><sup>$</sup>100</span><span>/ 月</span></div>
            <Features items={proFeatures} />
            <footer className="plan-tier-footer"><p>不限量使用，但受防滥用机制约束。</p><button disabled={saving} onClick={() => setDetails({ title: '使用限制和优惠活动', text: '不同套餐和模型适用不同使用限额。当前每周额度、可用余额和重置时间可在“使用情况和计费”中查看。' })}>了解使用限制和优惠活动</button><button disabled={saving} onClick={onClose}>管理我的订阅</button><button disabled={saving} onClick={() => setDetails({ title: '账单帮助', text: '你可以在“使用情况和计费”中查看当前套餐、额度和重置卡。' })}>我需要账单方面的帮助</button></footer>
          </article>
        </div> : <div className="plan-grid plan-grid-business"><article className="plan-tier"><div className="plan-tier-name"><h2>Business</h2></div><h3>让整个团队共同进步</h3><p className="plan-description">为团队提供协作空间、更高使用额度和管理功能。</p><button className="plan-select" disabled={saving} onClick={() => void selectPlan('ChatGPT Business')}>{actionLabel('ChatGPT Business', '切换至 Business')}</button><Features items={businessFeatures} /><footer className="plan-tier-footer"><button disabled={saving} onClick={onClose}>管理工作空间套餐</button></footer></article></div>}
      </main>
    </div>
    {proOpen && <Dialog title="选择 Pro 套餐" className="plan-level-dialog" onClose={() => { if (!saving) { setProOpen(false); setError(''); } }}><div className="dialog-content"><div className="plan-level-options" role="radiogroup" aria-label="Pro 套餐额度">{(['ChatGPT Pro 100', 'ChatGPT Pro 200'] as const).map(plan => <button key={plan} role="radio" aria-checked={proLevel === plan} disabled={saving} onClick={() => setProLevel(plan)}><span>{plan.replace('ChatGPT ', '')}<small>{plan === currentPlan ? '当前套餐' : '每月额度'}</small></span><strong>${plan.endsWith('200') ? '200' : '100'}<small> / 月</small></strong>{proLevel === plan && <Check size={17} />}</button>)}</div>{error && <p className="plan-save-error" role="alert">{error}</p>}</div><div className="dialog-footer"><button className="secondary-button" disabled={saving} onClick={() => { setProOpen(false); setError(''); }}>取消</button><button className="primary-button" disabled={saving} onClick={() => void selectPlan(proLevel)}>{saving ? '正在保存…' : proLevel === currentPlan ? '保留当前套餐' : '选择套餐'}</button></div></Dialog>}
    {details && <Dialog title={details.title} className="small-dialog" onClose={() => setDetails(null)}><div className="dialog-content"><p>{details.text}</p></div><div className="dialog-footer"><button className="primary-button" onClick={() => setDetails(null)}>知道了</button></div></Dialog>}
  </dialog>;
}
