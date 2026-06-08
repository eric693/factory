import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getComplaints = (status) => api.get('/complaints', { params: status ? { status } : {} }).then(r => r.data);
const getOrders = () => api.get('/orders').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createComplaint = (data) => api.post('/complaints', data).then(r => r.data);
const updateComplaint = (id, data) => api.patch(`/complaints/${id}`, data).then(r => r.data);
const deleteComplaint = (id) => api.delete(`/complaints/${id}`).then(r => r.data);
const getComplaint = (id) => api.get(`/complaints/${id}`).then(r => r.data);

const SEVERITY = { high: { label: '嚴重', color: 'bg-red-100 text-red-700' }, medium: { label: '一般', color: 'bg-amber-100 text-amber-700' }, low: { label: '輕微', color: 'bg-green-100 text-green-700' } };
const STATUS = { open: { label: '處理中', color: 'bg-red-100 text-red-700' }, closed: { label: '已結案', color: 'bg-green-100 text-green-700' } };

const D_FIELDS = [
  { key: 'd1_team', label: 'D1 — 問題處理小組', placeholder: '成員名單與職責' },
  { key: 'd2_problem', label: 'D2 — 問題描述', placeholder: '5W2H 描述問題現象', required: true },
  { key: 'd3_containment', label: 'D3 — 緊急圍堵措施', placeholder: '立即採取的圍堵行動' },
  { key: 'd4_root_cause', label: 'D4 — 根本原因分析', placeholder: '5 Why / 魚骨圖分析' },
  { key: 'd5_corrective', label: 'D5 — 永久矯正措施', placeholder: '預防根本原因的矯正行動' },
  { key: 'd6_implement', label: 'D6 — 矯正措施實施', placeholder: '誰做什麼、何時完成' },
  { key: 'd7_prevent', label: 'D7 — 防止再發生', placeholder: '系統/流程改善，預防類似問題' },
  { key: 'd8_close', label: 'D8 — 結案確認', placeholder: '客戶確認、小組解散' },
];

function ComplaintDetail({ id, onClose }) {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ['complaint', id], queryFn: () => getComplaint(id) });
  const [form, setForm] = useState(null);

  if (isLoading || !c) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const current = form || c;
  const progress = D_FIELDS.filter(f => current[f.key]).length;

  const saveMut = useMutation({
    mutationFn: () => updateComplaint(id, form),
    onSuccess: () => { qc.invalidateQueries(['complaints']); qc.invalidateQueries(['complaint', id]); setForm(null); },
  });
  const closeMut = useMutation({
    mutationFn: () => updateComplaint(id, { status: 'closed' }),
    onSuccess: () => { qc.invalidateQueries(['complaints']); qc.invalidateQueries(['complaint', id]); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">{c.complaint_no}</div>
            <div className="text-sm text-slate-500">{c.customer_name} · {c.product_name}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY[c.severity]?.color}`}>{SEVERITY[c.severity]?.label}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 8D 進度 */}
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-600 font-medium">8D 完成進度</span>
              <span className="font-bold text-brand-600">{progress} / {D_FIELDS.length}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${(progress / D_FIELDS.length) * 100}%` }} />
            </div>
          </div>

          {/* 8D 欄位 */}
          {D_FIELDS.map(field => (
            <div key={field.key}>
              <label className="label flex items-center gap-1">
                {field.label}
                {current[field.key] && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-green-500"><polyline points="20 6 9 17 4 12"/></svg>}
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder={field.placeholder}
                value={form?.[field.key] ?? c[field.key] ?? ''}
                onChange={e => setForm(f => ({ ...(f || c), [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          {form && <button className="btn-primary flex-1" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>儲存</button>}
          {c.status === 'open' && progress >= 6 && (
            <button className="btn-ghost flex-1 text-green-700 hover:bg-green-50" onClick={() => { if (confirm('確認結案？')) closeMut.mutate(); }}>結案</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ComplaintForm({ onClose }) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: getOrders });
  const [form, setForm] = useState({ customer_name: '', product_name: '', product_code: '', issue_date: dayjs().format('YYYY-MM-DD'), severity: 'medium', d1_team: '', d2_problem: '', related_order_id: '' });

  const mut = useMutation({
    mutationFn: () => createComplaint(form),
    onSuccess: () => { qc.invalidateQueries(['complaints']); onClose(); },
  });

  const pickOrder = (id) => {
    const o = orders.find(o => o.id === id);
    setForm(f => ({ ...f, related_order_id: id, customer_name: o?.customer_name || f.customer_name }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="label">關聯訂單（選填）</label>
        <select className="select" value={form.related_order_id} onChange={e => pickOrder(e.target.value)}>
          <option value="">-- 選填 --</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">客戶名稱 *</label>
          <input className="input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">嚴重度</label>
          <select className="select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
            <option value="high">嚴重</option>
            <option value="medium">一般</option>
            <option value="low">輕微</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">產品名稱</label>
          <input className="input" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">發生日期</label>
          <input type="date" className="input" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">D1 — 處理小組</label>
        <input className="input" value={form.d1_team} onChange={e => setForm(f => ({ ...f, d1_team: e.target.value }))} placeholder="成員名單" />
      </div>
      <div>
        <label className="label">D2 — 問題描述 *</label>
        <textarea className="input" rows={3} value={form.d2_problem} onChange={e => setForm(f => ({ ...f, d2_problem: e.target.value }))} placeholder="詳細描述客訴問題..." />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.customer_name || !form.d2_problem || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立客訴案件'}
      </button>
    </div>
  );
}

const TABS = [{ k: '', l: '全部' }, { k: 'open', l: '處理中' }, { k: 'closed', l: '已結案' }];

export default function Complaints() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ['complaints', tab],
    queryFn: () => getComplaints(tab || undefined),
  });
  const deleteMut = useMutation({ mutationFn: deleteComplaint, onSuccess: () => qc.invalidateQueries(['complaints']) });

  const openCount = complaints.filter(c => c.status === 'open').length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">8D 客訴管理</h1>
          {openCount > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{openCount} 件待結案</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增客訴
        </button>
      </div>

      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : complaints.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無客訴案件</div>
      ) : (
        <div className="space-y-2">
          {complaints.map(c => {
            const sev = SEVERITY[c.severity] || SEVERITY.medium;
            const st = STATUS[c.status] || STATUS.open;
            const d8Progress = D_FIELDS.filter(f => c[f.key]).length;
            return (
              <div key={c.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailId(c.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{c.complaint_no}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sev.color}`}>{sev.label}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{c.customer_name}</div>
                    <div className="text-sm text-slate-500">{c.product_name}</div>
                    <div className="text-xs text-slate-400 mt-1">{c.issue_date}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-brand-600">{d8Progress}/8</div>
                    <div className="text-xs text-slate-400">8D 進度</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d8Progress >= 8 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${(d8Progress / 8) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">新增客訴案件</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><ComplaintForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {detailId && <ComplaintDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
