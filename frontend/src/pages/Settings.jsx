import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const testLine = () => axios.post('/api/line-notify/test').then(r => r.data);

const api = axios.create({ baseURL: '/api' });
const getSettings = () => api.get('/settings').then(r => r.data);
const updateSettings = (data) => api.patch('/settings', data).then(r => r.data);

const FIELDS = [
  { key: 'company_name', label: '公司名稱', type: 'text' },
  { key: 'work_hours_per_day', label: '每日工作小時', type: 'number', unit: '小時', min: 1, max: 24 },
  { key: 'default_margin_pct', label: '預設報價毛利率', type: 'number', unit: '%', min: 0, max: 100 },
  { key: 'default_labor_rate', label: '預設人工工資', type: 'number', unit: '元/小時', min: 0 },
  { key: 'default_quote_valid_days', label: '報價單有效天數', type: 'number', unit: '天', min: 1 },
  { key: 'capacity_warning_threshold', label: '產能預警閾值', type: 'number', unit: '%', min: 50, max: 100 },
  { key: 'inquiry_email', label: '詢價回覆信箱', type: 'email' },
];

const LINE_FIELDS = [
  { key: 'line_notify_token', label: 'LINE Notify Token', type: 'password', placeholder: '從 notify-bot.line.me 取得' },
  { key: 'line_notify_enabled', label: '啟用 LINE 通知', type: 'toggle' },
  { key: 'yield_alert_enabled', label: '啟用良率預警', type: 'toggle' },
];

export default function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (settings) {
      const vals = {};
      Object.entries(settings).forEach(([k, v]) => { vals[k] = v.value; });
      setForm(vals);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (user?.role !== 'admin' && user?.role !== 'boss') {
    return <div className="card text-center py-12 text-slate-400">僅管理員與老闆可存取系統設定</div>;
  }

  if (isLoading) return <div className="text-center py-12 text-slate-400">載入中...</div>;

  return (
    <div className="space-y-6 pb-20 md:pb-0 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">系統設定</h1>
        <p className="text-sm text-slate-500 mt-1">修改全系統預設參數，即時生效</p>
      </div>

      <div className="card space-y-5">
        {FIELDS.map(field => (
          <div key={field.key}>
            <label className="label">
              {field.label}
              {settings?.[field.key]?.description && (
                <span className="ml-2 text-xs text-slate-400 font-normal">（{settings[field.key].description}）</span>
              )}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type={field.type}
                className="input flex-1"
                value={form[field.key] || ''}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                min={field.min}
                max={field.max}
              />
              {field.unit && <span className="text-sm text-slate-500 shrink-0">{field.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
          {mutation.isPending ? '儲存中...' : '儲存設定'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">已儲存</span>}
      </div>

      {/* LINE 通知 + 良率預警 */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-3">LINE 通知與預警設定</h2>
        <div className="card space-y-5">
          {LINE_FIELDS.map(field => (
            <div key={field.key}>
              <label className="label">
                {field.label}
                {settings?.[field.key]?.description && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">（{settings[field.key].description}）</span>
                )}
              </label>
              {field.type === 'toggle' ? (
                <button
                  onClick={() => setForm(f => ({ ...f, [field.key]: f[field.key] === '1' ? '0' : '1' }))}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${form[field.key] === '1' ? 'bg-brand-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form[field.key] === '1' ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              ) : (
                <input type={field.type} className="input" placeholder={field.placeholder} value={form[field.key] || ''} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="flex gap-3 items-center pt-2 border-t border-slate-100">
            <button className="btn-secondary text-sm" onClick={() => { mutation.mutate(form); }}>儲存通知設定</button>
            <button className="btn-ghost text-sm text-slate-500" onClick={() => testLine().then(() => alert('測試訊息已發送！請查看 LINE')).catch(() => alert('發送失敗，請確認 Token 是否正確'))}>測試 LINE 通知</button>
          </div>
          <div className="text-xs text-slate-400 space-y-1 border-t border-slate-50 pt-3">
            <div>1. 前往 <strong>notify-bot.line.me/zh_TW</strong> 登入並「發行存取權杖」</div>
            <div>2. 選擇「透過 1 對 1 聊天接收 LINE Notify 的通知」</div>
            <div>3. 複製 Token 貼到上方欄位，儲存後點選「測試」確認</div>
          </div>
        </div>
      </div>

      <div className="card bg-slate-50 border-slate-200">
        <div className="text-sm font-semibold text-slate-700 mb-2">LINE 通知觸發情境</div>
        <ul className="text-sm text-slate-600 space-y-1">
          <li>高嚴重度異常通報（機台故障、安全事故）</li>
          <li>NCR 嚴重不合格品建立</li>
          <li>應收帳款逾期（需手動觸發）</li>
          <li>良率預警（連續低良率工單）</li>
        </ul>
      </div>
    </div>
  );
}
