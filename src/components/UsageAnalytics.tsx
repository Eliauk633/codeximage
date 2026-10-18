import { Fragment, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { analyticsDates, buildAnalyticsSeries, buildUsageHistory, formatAnalyticsDate, totalSeries, usageGrouping, type AnalyticsPeriod, type AnalyticsSeries, type UsageGrouping } from '../usage-analytics';
import './usage-analytics.css';

function PeriodPicker({ value, onChange, label }: { value: AnalyticsPeriod; onChange: (value: AnalyticsPeriod) => void; label: string }) {
  return <div className="analytics-segments" role="group" aria-label={label}>{([7, 30] as const).map(days => <button key={days} aria-pressed={value === days} onClick={() => onChange(days)}>{days} 天</button>)}</div>;
}
function GroupPicker({ value, onChange, label }: { value: UsageGrouping; onChange: (value: UsageGrouping) => void; label: string }) {
  return <label className="analytics-select"><select aria-label={label} value={value} onChange={event => onChange(event.target.value as UsageGrouping)}>{usageGrouping.map(group => <option key={group}>{group}</option>)}</select><ChevronDown size={12} aria-hidden="true" /></label>;
}
function percent(value: number): string { return value > 0 && value < .1 ? '<0.1%' : `${Number(value.toFixed(1))}%`; }
function dayLabel(date: Date): string { return `${date.getMonth() + 1}月${date.getDate()}日`; }

function Chart({ dates, series, stacked = false, label }: { dates: Date[]; series: AnalyticsSeries[]; stacked?: boolean; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 672, height = stacked ? 156 : 146, top = 18, bottom = stacked ? 125 : 115;
  const left = stacked ? 0 : 52, right = 8;
  const totals = dates.map((_, index) => series.reduce((sum, item) => sum + item.values[index], 0));
  const maximum = Math.max(1, ...(stacked ? totals : series.flatMap(item => item.values)));
  const upper = stacked ? maximum * 1.25 : maximum <= 21 ? 21 : maximum <= 120 ? 120 : maximum <= 750 ? 750 : Math.ceil(maximum / 300) * 300;
  const slot = (width - left - right) / dates.length;
  const x = (index: number) => stacked ? left + slot * (index + .5) : left + (width - left - right) * index / Math.max(1, dates.length - 1);
  const y = (value: number) => bottom - value / upper * (bottom - top);
  const selected = active === null ? null : dates[active];
  function keyboard(event: KeyboardEvent<SVGRectElement>, index: number) {
    if (event.key === 'Escape') { setPinned(false); setActive(null); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(index); setPinned(value => !value); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    event.currentTarget.parentElement?.querySelector<SVGRectElement>(`[data-chart-day="${next}"]`)?.focus();
  }
  return <div className={`analytics-chart ${stacked ? 'is-stacked' : 'is-line'}`} onMouseLeave={() => { if (!pinned) setActive(null); }}>
    <svg viewBox={`0 0 ${width} ${height}`} aria-label={label} role="group">
      {[0, 1, 2, 3].map(step => <g key={step} aria-hidden="true"><line className="analytics-gridline" x1={left} x2={width - right} y1={y(upper / 3 * step)} y2={y(upper / 3 * step)} />{!stacked && <text className="analytics-axis" x="0" y={y(upper / 3 * step) + 4}>{Math.round(upper / 3 * step)}</text>}</g>)}
      {stacked ? dates.map((_, index) => {
        let baseline = bottom;
        return <g key={index} aria-hidden="true">{[...series].reverse().map(item => {
          const barHeight = item.values[index] / upper * (bottom - top); baseline -= barHeight;
          return <rect key={item.name} x={x(index) - Math.min(38, slot * .43) / 2} y={baseline} width={Math.min(38, slot * .43)} height={barHeight} fill={item.color} rx={item === series[0] ? 3 : 0} />;
        })}</g>;
      }) : series.map(item => <polyline key={item.name} aria-hidden="true" fill="none" stroke={item.color} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />)}
      {active !== null && <g aria-hidden="true"><line className="analytics-crosshair" x1={x(active)} x2={x(active)} y1={top} y2={bottom} />{!stacked && series.map(item => <circle key={item.name} cx={x(active)} cy={y(item.values[active])} r="3" fill={item.color} stroke="var(--bg)" strokeWidth="1.5" />)}</g>}
      {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((index, ordinal) => <text key={index} className="analytics-axis" x={x(index)} y={height - 10} textAnchor={ordinal === 0 && !stacked ? 'start' : ordinal === 2 && !stacked ? 'end' : 'middle'}>{dayLabel(dates[index])}</text>)}
      {dates.map((date, index) => <rect key={date.getTime()} className="analytics-hit-area" data-chart-day={index} role="button" tabIndex={active === index || (active === null && index === 0) ? 0 : -1} aria-label={`${dayLabel(date)}，${series.map(item => `${item.name} ${stacked ? `${(item.values[index] / 10000).toFixed(2)}%` : item.values[index].toLocaleString('en-US')}`).join('，')}`} aria-pressed={pinned && active === index} x={Math.max(left, x(index) - slot / 2)} y={top} width={Math.min(slot, width - right - Math.max(left, x(index) - slot / 2))} height={bottom - top} fill="transparent" onMouseEnter={() => { if (!pinned) setActive(index); }} onFocus={() => setActive(index)} onBlur={() => { if (!pinned) setActive(null); }} onClick={() => { setActive(index); setPinned(value => active === index ? !value : true); }} onKeyDown={event => keyboard(event, index)} />)}
    </svg>
    {selected && active !== null && <div className="analytics-tooltip" role="status" style={{ left: `${Math.max(18, Math.min(81, x(active) / width * 100))}%` }}><strong>{formatAnalyticsDate(selected)}</strong>{series.map(item => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><b>{stacked ? `${(item.values[active] / 10000).toFixed(2)}%` : item.values[active].toLocaleString('en-US')}</b></div>)}<div className="analytics-tooltip-total"><span>合计</span><b>{stacked ? `${(totals[active] / 10000).toFixed(2)}%` : totals[active].toLocaleString('en-US')}</b></div></div>}
  </div>;
}

function LineCard({ title, dates, series }: { title: string; dates: Date[]; series: AnalyticsSeries[] }) {
  return <div className="analytics-card analytics-line-card"><div className="analytics-counter"><span>{title}</span><strong>{totalSeries(series).toLocaleString('en-US')}</strong></div><Chart key={`${title}-${dates[0].getTime()}-${series.length}`} label={`${title}，按日期查看详情`} dates={dates} series={series} /><div className="analytics-line-legend">{series.map(item => <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}</div></div>;
}

const ranking = [
  { title: '部署', percentage: 57.62, model: 'GPT-6.1 Sol', tasks: 28 },
  { title: '1.2.3', percentage: 13.54, model: 'GPT-6 Astra', tasks: 12 },
  { title: '1.2.1', percentage: 3.07, model: 'GPT-6.1 Sol', tasks: 8 },
  { title: '1.2.4', percentage: 1.27, model: 'GPT-5.6 Terra', tasks: 4 },
  { title: '查看下文件', percentage: 1.16, model: 'GPT-6 Astra', tasks: 3 },
  { title: '项目配置', percentage: .82, model: 'GPT-6.1 Sol', tasks: 2 },
  { title: '检查更新', percentage: .48, model: 'GPT-6 Luna', tasks: 1 },
];
export function UsageAnalytics({ now }: { now: number }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(7);
  const [offset, setOffset] = useState(0);
  const [group, setGroup] = useState<UsageGrouping>('按功能');
  const [historyGroup, setHistoryGroup] = useState<UsageGrouping>('按功能');
  const [toolPeriod, setToolPeriod] = useState<AnalyticsPeriod>(7);
  const [messagePeriod, setMessagePeriod] = useState<AnalyticsPeriod>(7);
  const [byPlatform, setByPlatform] = useState(false);
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [moreChats, setMoreChats] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(0);
  const dates = analyticsDates(now, period, offset);
  const usage = buildUsageHistory(dates, group);
  const usageTotal = totalSeries(usage);
  const toolDates = analyticsDates(now, toolPeriod);
  const messageDates = analyticsDates(now, messagePeriod);
  const today = new Date(now);
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const previousStart = new Date(weekStart); previousStart.setDate(previousStart.getDate() - 7);
  const previousEnd = new Date(weekStart); previousEnd.setDate(previousEnd.getDate() - 1);
  const weekly = [{ start: weekStart, end: today, value: '暂无数据' }, { start: previousStart, end: previousEnd, value: '73.1%' }];
  const historyBreakdown = buildUsageHistory(analyticsDates(previousEnd.getTime(), 7), historyGroup);
  const historyTotal = totalSeries(historyBreakdown);
  return <div className="usage-analytics-v2">
    <section className="analytics-section">
      <h3>用量历史记录</h3><p>查看 Work、Codex 及其他智能体任务中的套餐用量和额度消耗情况。不包括 Chat 模式中的对话。</p>
      <div className="analytics-toolbar"><PeriodPicker value={period} onChange={value => { setPeriod(value); setOffset(0); }} label="用量历史时间范围" /><GroupPicker value={group} onChange={setGroup} label="用量历史分组" /></div>
      <div className="analytics-card analytics-history-card"><div className="analytics-range"><span>{formatAnalyticsDate(dates[0])} – {formatAnalyticsDate(dates.at(-1)!)}</span><div><button aria-label="前一用量周期" onClick={() => setOffset(value => value + 1)}><ChevronLeft size={16} /></button><button aria-label="后一用量周期" disabled={offset === 0} onClick={() => setOffset(value => value - 1)}><ChevronRight size={16} /></button></div></div>
        <Chart key={`${period}-${offset}-${group}`} dates={dates} series={usage} stacked label="每日套餐用量" />
        <div className="analytics-usage-legend">{usage.map(item => <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}<strong>{percent(item.values.reduce((sum, value) => sum + value, 0) / Math.max(1, usageTotal) * 100)}</strong></span></div>)}</div>
      </div>
    </section>
    <section className="analytics-section"><h3>聊天用量排行</h3><p>比较每个聊天的套餐和额度用量</p><div className="analytics-table-wrap"><table className="analytics-ranking-table"><thead><tr><th>聊天</th><th>占每周限额的 %</th><th>已用额度</th></tr></thead><tbody>{ranking.slice(0, moreChats ? ranking.length : 5).map(chat => <Fragment key={chat.title}><tr><td><button aria-expanded={expandedChat === chat.title} onClick={() => setExpandedChat(value => value === chat.title ? null : chat.title)}>{expandedChat === chat.title ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{chat.title}</button></td><td>{chat.percentage.toFixed(2)}%</td><td>0</td></tr>{expandedChat === chat.title && <tr className="analytics-detail-row"><td colSpan={3}><div><span>{chat.model}</span><span>{chat.tasks} 个任务</span><span>套餐用量 {chat.percentage.toFixed(2)}%</span><span>已用额度 0</span></div></td></tr>}</Fragment>)}</tbody></table></div><button className="analytics-more" onClick={() => setMoreChats(value => !value)}>{moreChats ? '收起' : '显示更多'}</button></section>
    <section className="analytics-section"><div className="analytics-section-top"><h3>套餐用量历史 <Info size={13} aria-label="历史用量可能存在延迟" /></h3><GroupPicker value={historyGroup} onChange={setHistoryGroup} label="套餐用量历史分组" /></div><h4>每周限额</h4><div className="analytics-table-wrap analytics-weekly-table"><table><thead><tr><th>周期</th><th>已使用限额百分比</th></tr></thead><tbody>{weekly.map((week, index) => <Fragment key={index}><tr><td><button aria-expanded={expandedWeek === index} onClick={() => setExpandedWeek(value => value === index ? null : index)}>{formatAnalyticsDate(week.start, false)} – {formatAnalyticsDate(week.end, false)}{expandedWeek === index ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button></td><td>{week.value}</td></tr>{expandedWeek === index && <tr className="analytics-detail-row"><td colSpan={2}>{index === 0 ? <div className="analytics-week-note"><span>截至 {dayLabel(today)}的用量 <Info size={12} /></span><span>部分用量不可用；此周期的数据可能不完整</span><span>此时间段暂无明细</span></div> : <div className="analytics-week-breakdown">{historyBreakdown.map(item => <span key={item.name}><i style={{ background: item.color }} />{item.name}<b>{percent(73.1 * item.values.reduce((sum, value) => sum + value, 0) / Math.max(1, historyTotal))}</b></span>)}</div>}</td></tr>}</Fragment>)}</tbody></table></div></section>
    <section className="analytics-section"><div className="analytics-section-top"><div><h3>工具活动</h3><p>查看一段时间内使用了哪些插件和技能。更新于 {dayLabel(today)} {String(today.getHours()).padStart(2, '0')}:{String(today.getMinutes()).padStart(2, '0')}</p></div><PeriodPicker value={toolPeriod} onChange={setToolPeriod} label="工具活动时间范围" /></div><LineCard title="插件调用" dates={toolDates} series={buildAnalyticsSeries('plugins', toolDates)} /><LineCard title="已使用技能" dates={toolDates} series={buildAnalyticsSeries('skills', toolDates)} /></section>
    <section className="analytics-section"><div className="analytics-section-top"><div><h3>消息</h3><p>跟踪一段时间内发送的消息数量</p></div><div className="analytics-message-controls"><PeriodPicker value={messagePeriod} onChange={setMessagePeriod} label="消息时间范围" /><div className="analytics-segments" role="group" aria-label="消息分组">{['按模型', '按使用端'].map((label, index) => <button key={label} aria-pressed={byPlatform === Boolean(index)} onClick={() => setByPlatform(Boolean(index))}>{label}</button>)}</div></div></div><LineCard title="消息" dates={messageDates} series={buildAnalyticsSeries('messages', messageDates, byPlatform)} /></section>
  </div>;
}
