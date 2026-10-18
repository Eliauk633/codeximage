import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Group, PreferenceRow } from './SettingsControls';
import './ai-service-settings.css';

type ServiceConfiguration = { configured: boolean; url: string };

export function AiServiceSettings() {
  const [configuration, setConfiguration] = useState<ServiceConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const available = Boolean(window.desktop?.ai);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    const service = window.desktop?.ai;
    setError('');
    if (!service) {
      setConfiguration(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await service.status();
      if (current !== request.current) return;
      if (result.ok) setConfiguration(result);
      else {
        setConfiguration(null);
        setError('无法读取模型服务配置，请重试。');
      }
    } catch {
      if (current !== request.current) return;
      setConfiguration(null);
      setError('无法读取模型服务配置，请重试。');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { request.current += 1; };
  }, [refresh]);

  const status = !available ? '需在客户端打开' : loading ? '读取中…' : error ? '读取失败' : configuration?.configured ? '已配置' : '未配置';
  return <div className="ai-service-settings">
    <Group title="模型服务">
      <PreferenceRow label="配置状态" description={!available ? '请在客户端中打开模型服务设置。' : !loading && !error && !configuration?.configured ? '请通过客户端启动配置设置服务地址与访问凭证。' : undefined}>
        <span className="personal-badge" role="status">{status}</span>
        <button type="button" className="settings-outline-button" disabled={loading || !available} onClick={() => void refresh()} aria-label="刷新模型服务配置"><RefreshCw size={13} />刷新</button>
      </PreferenceRow>
      <PreferenceRow label="统一服务地址"><span className="settings-value ai-service-url">{configuration?.url || (loading ? '读取中…' : '未设置')}</span></PreferenceRow>
      <p className="personal-card-note">所有模型选项共用统一服务额度。服务密钥由服务器统一管理。</p>
      {error && <p className="ai-service-error" role="alert">{error}</p>}
    </Group>
  </div>;
}
