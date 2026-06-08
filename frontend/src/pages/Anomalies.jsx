import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { formatDateTime } from '../utils';

const api = axios.create({ baseURL: '/api' });
const getAnomalies = (status) => api.get('/anomalies', { params: { status } }).then(r => r.data);
const reportAnomaly = (data) => api.post('/anomalies', data).then(r => r.data);
const resolveAnomaly = (id, data) => api.patch(`/anomalies/${id}/resolve`, data).then(r => r.data);
const ignoreAnomaly = (id) => api.patch(`/anomalies/${id}/ignore`, {}).then(r => r.data);

const TYPES = {
  machine_breakdown: '機台故障',
  material_shortage: '缺料',
  quality_issue: '品質異常',
  safety: '安全事故',
  other: '其他',
};
const SEVERITY = {
  high: { label: '高', cls: 'bg-red-100 text-red-700' },
  medium: { label: '中', cls: 'bg-amber-100 text-amber-700' },
  low: { label: '低', cls: 'bg-green-100 text-green-700' },
};
const STATUS_CLS = {
  open: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  ignored: 'bg-slate-100 text-slate-500',
};

export default function Anomalies() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [showReport, setShowReport] = useState(false);
  const [resolveModal, setResolveModal] = useState(null);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const esRef = useRef(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['anomalies', status],
    queryFn: () => getAnomalies(status),
    refetchInterval: 10000,
  });

  // SSE real-time push
  useEffect(() => {
    const es = new EventSource('/api/anomalies/stream');
    esRef.current = es;
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'new_anomaly') {
        setLiveAlerts(prev => [msg.anomaly, ...prev].slice(0, 5));
        qc.invalidateQueries({ queryKey: ['anomalies'] });
      } else if (msg.type === 'anomaly_resolved') {
        qc.invalidateQueries({ queryKey: ['anomalies'] });
      }
    };
    return () => es.close();
  }, [qc]);

  const reportMutation = useMutation({
    mutationFn: reportAnomaly,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anomalies'] }); setShowReport(false); },
  });
  const resolveMutation = useMutation({
    mutationFn: ({ id, data }) => resolveAnomaly(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anomalies'] }); setResolveModal(null); },
  });
  const ignoreMutation = useMutation({
    mutationFn: ignoreAnomaly,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anomalies'] }),
  });

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Live alerts banner */}
      {liveAlerts.length > 0 && (
        <div className="bg-red-600 text-white rounded-2xl p-4">
          <div className="text-sm font-bold mb-2">即時通報</div>
          {liveAlerts.map(a => (
            <div key={a.id} className="text-sm opacity-90">{a.title} - {a.machine_name || '未指定機台'}</div>
          ))}
          <button className="mt-2 text-xs underline opacity-80" onClick={() => setLiveAlerts([])}>關閉</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">異常通報</h1>
          <p className="text-sm text-slate-500 mt-1">即時回報生產異常，即時推送通知</p>
        </div>
        <button className="btn-danger" onClick={() => setShowReport(true)}>
          通報異常
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['open', 'resolved', 'ignored', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${status === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-400'}`}
          >
            {{ open: '待處理', resolved: '已解決', ignored: '已忽略', all: '全部' }[s]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : data.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">暫無異常通報</div>
      ) : (
        <div className="space-y-3">
          {data.map(a => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`badge text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[a.status]}`}>
                      {a.status === 'open' ? '待處理' : a.status === 'resolved' ? '已解決' : '已忽略'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY[a.severity]?.cls || ''}`}>
                      {SEVERITY[a.severity]?.label}
                    </span>
                    <span className="text-xs text-slate-500">{TYPES[a.type] || a.type}</span>
                  </div>
                  <div className="font-semibold text-slate-900">{a.title}</div>
                  {a.description && <div className="text-sm text-slate-600 mt-1">{a.description}</div>}
                  <div className="text-xs text-slate-400 mt-2 flex gap-3">
                    {a.machine_name && <span>機台：{a.machine_name}</span>}
                    {a.wo_no && <span>工單：{a.wo_no}</span>}
                    <span>通報：{a.reporter || '匿名'}</span>
                    <span>{formatDateTime(a.created_at)}</span>
                  </div>
                  {a.resolve_note && (
                    <div className="mt-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      處理備註：{a.resolve_note}（{a.resolved_by}）
                    </div>
                  )}
                </div>
                {a.status === 'open' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="btn-primary text-sm px-3 py-1.5"
                      onClick={() => setResolveModal(a)}
                    >解決</button>
                    <button
                      className="btn-ghost text-sm px-3 py-1.5"
                      onClick={() => ignoreMutation.mutate(a.id)}
                    >忽略</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {showReport && <ReportModal onClose={() => setShowReport(false)} onSubmit={reportMutation.mutate} loading={reportMutation.isPending} />}

      {/* Resolve Modal */}
      {resolveModal && (
        <ResolveModal
          anomaly={resolveModal}
          onClose={() => setResolveModal(null)}
          onSubmit={(data) => resolveMutation.mutate({ id: resolveModal.id, data })}
          loading={resolveMutation.isPending}
        />
      )}
    </div>
  );
}

function ReportModal({ onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    title: '', type: 'machine_breakdown', severity: 'medium',
    machine_name: '', description: '', reporter: '',
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">通報異常</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">標題 *</label>
            <input className="input" placeholder="簡述異常狀況" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">類型</label>
              <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">嚴重度</label>
              <select className="select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">機台名稱</label>
            <input className="input" placeholder="如：CNC車床 #1" value={form.machine_name} onChange={e => setForm(f => ({ ...f, machine_name: e.target.value }))} />
          </div>
          <div>
            <label className="label">詳細描述</label>
            <textarea className="input" rows={3} placeholder="描述異常情況..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="label">通報人</label>
            <input className="input" placeholder="姓名" value={form.reporter} onChange={e => setForm(f => ({ ...f, reporter: e.target.value }))} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button
            className="btn-danger flex-1"
            onClick={() => onSubmit(form)}
            disabled={!form.title || loading}
          >
            {loading ? '送出中...' : '立即通報'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolveModal({ anomaly, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ resolve_note: '', resolved_by: '' });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">標記解決</h3>
          <p className="text-sm text-slate-500 mt-1">{anomaly.title}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">處理備註</label>
            <textarea className="input" rows={3} value={form.resolve_note} onChange={e => setForm(f => ({ ...f, resolve_note: e.target.value }))} placeholder="描述如何解決..." />
          </div>
          <div>
            <label className="label">處理人員</label>
            <input className="input" value={form.resolved_by} onChange={e => setForm(f => ({ ...f, resolved_by: e.target.value }))} placeholder="姓名" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(form)} disabled={loading}>確認解決</button>
        </div>
      </div>
    </div>
  );
}
