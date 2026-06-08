import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getMolds = (status) => api.get('/molds', { params: status ? { status } : {} }).then(r => r.data);
const getMachines = () => api.get('/machines').then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const getLogs = (id) => api.get(`/molds/${id}/logs`).then(r => r.data);
const createMold = (data) => api.post('/molds', data).then(r => r.data);
const addShots = (id, data) => api.post(`/molds/${id}/shots`, data).then(r => r.data);
const maintainMold = (id, data) => api.post(`/molds/${id}/maintain`, data).then(r => r.data);
const deleteMold = (id) => api.delete(`/molds/${id}`).then(r => r.data);

const STATUS = {
  active:    { label: '正常', color: 'bg-green-100 text-green-700' },
  warning:   { label: '即將到保', color: 'bg-amber-100 text-amber-700' },
  overhaul:  { label: '需大修', color: 'bg-red-100 text-red-700' },
  retired:   { label: '已除役', color: 'bg-slate-100 text-slate-500' },
};

function MoldDetail({ mold, onClose }) {
  const qc = useQueryClient();
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const { data: logs = [] } = useQuery({ queryKey: ['mold-logs', mold.id], queryFn: () => getLogs(mold.id) });
  const [shotsForm, setShotsForm] = useState({ shots: '', work_order_id: '', operator: '', note: '' });
  const [maintForm, setMaintForm] = useState({ operator: '', note: '' });
  const [view, setView] = useState('shots');

  const shotsMut = useMutation({
    mutationFn: () => addShots(mold.id, { ...shotsForm, shots: +shotsForm.shots }),
    onSuccess: () => { qc.invalidateQueries(['molds']); setShotsForm({ shots: '', work_order_id: '', operator: '', note: '' }); onClose(); },
  });

  const maintMut = useMutation({
    mutationFn: () => maintainMold(mold.id, maintForm),
    onSuccess: () => { qc.invalidateQueries(['molds']); onClose(); },
  });

  const pct = Math.min(100, Math.round(mold.current_shots / mold.max_shots * 100));
  const warnPct = Math.round(mold.warning_shots / mold.max_shots * 100);
  const activeWOs = wos.filter(w => !['completed', 'cancelled'].includes(w.status));

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">{mold.name}</div>
            <div className="text-sm text-slate-500">{mold.code} {mold.machine_name && `· ${mold.machine_name}`}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[mold.status]?.color || ''}`}>{STATUS[mold.status]?.label}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 模次進度 */}
          <div className="card p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-500">累計模次</span>
              <span className="font-bold text-slate-800">{mold.current_shots?.toLocaleString()} / {mold.max_shots?.toLocaleString()}</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-1">
              <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= warnPct ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{pct}% 使用</span>
              <span>總累積：{mold.total_shots?.toLocaleString()} 模次</span>
            </div>
            {mold.last_maintained && <div className="text-xs text-slate-400 mt-1">上次保養：{mold.last_maintained}</div>}
          </div>

          {/* 操作切換 */}
          <div className="flex gap-1">
            {[{ k: 'shots', l: '加模次' }, { k: 'maintain', l: '保養重置' }, { k: 'logs', l: '歷史記錄' }].map(v => (
              <button key={v.k} onClick={() => setView(v.k)} className={`flex-1 text-sm py-2 rounded-xl font-medium transition-all ${view === v.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{v.l}</button>
            ))}
          </div>

          {view === 'shots' && (
            <div className="space-y-3">
              <div>
                <label className="label">工單（選填）</label>
                <select className="select" value={shotsForm.work_order_id} onChange={e => setShotsForm(f => ({ ...f, work_order_id: e.target.value }))}>
                  <option value="">-- 選填 --</option>
                  {activeWOs.map(w => <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">本次模次 *</label>
                  <input type="number" min={1} className="input text-xl font-bold text-center py-4" value={shotsForm.shots} onChange={e => setShotsForm(f => ({ ...f, shots: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="label">操作員</label>
                  <input className="input" value={shotsForm.operator} onChange={e => setShotsForm(f => ({ ...f, operator: e.target.value }))} />
                </div>
              </div>
              <button className="btn-primary w-full py-3" disabled={!shotsForm.shots || shotsMut.isPending} onClick={() => shotsMut.mutate()}>
                {shotsMut.isPending ? '記錄中...' : '記錄模次'}
              </button>
            </div>
          )}

          {view === 'maintain' && (
            <div className="space-y-3">
              <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
                保養後將重置本次累積模次為 0，並更新上次保養日期。
              </div>
              <div>
                <label className="label">執行人員</label>
                <input className="input" value={maintForm.operator} onChange={e => setMaintForm(f => ({ ...f, operator: e.target.value }))} />
              </div>
              <div>
                <label className="label">備註</label>
                <textarea className="input" rows={2} value={maintForm.note} onChange={e => setMaintForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <button className="btn-primary w-full py-3 bg-amber-600 hover:bg-amber-700" disabled={maintMut.isPending} onClick={() => maintMut.mutate()}>
                {maintMut.isPending ? '處理中...' : '確認保養完成（重置模次）'}
              </button>
            </div>
          )}

          {view === 'logs' && (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-6">尚無記錄</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-slate-700">{log.action === 'production' ? '生產' : '保養'}{log.wo_no && ` · ${log.wo_no}`}</div>
                      <div className="text-xs text-slate-400">{log.operator} · {dayjs(log.logged_at).format('MM/DD HH:mm')}</div>
                    </div>
                    <div className={`text-sm font-bold ${log.action === 'production' ? 'text-brand-600' : 'text-amber-600'}`}>
                      {log.action === 'production' ? `+${log.shots_added}` : '重置'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MoldForm({ onClose }) {
  const qc = useQueryClient();
  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: getMachines });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const [form, setForm] = useState({ code: '', name: '', machine_id: '', material: '', max_shots: 500000, warning_shots: 450000, product_id: '', note: '' });

  const mut = useMutation({
    mutationFn: () => createMold(form),
    onSuccess: () => { qc.invalidateQueries(['molds']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">模具編號 *</label>
          <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="M001" />
        </div>
        <div>
          <label className="label">模具名稱 *</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="A型外殼模" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">使用機台</label>
          <select className="select" value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
            <option value="">-- 選填 --</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">模具材質</label>
          <input className="input" value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="P20、718..." />
        </div>
      </div>
      <div>
        <label className="label">對應產品</label>
        <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">-- 選填 --</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">最大模次</label>
          <input type="number" min={1000} className="input" value={form.max_shots} onChange={e => setForm(f => ({ ...f, max_shots: +e.target.value }))} />
        </div>
        <div>
          <label className="label">保養預警模次</label>
          <input type="number" min={1000} className="input" value={form.warning_shots} onChange={e => setForm(f => ({ ...f, warning_shots: +e.target.value }))} />
        </div>
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.code || !form.name || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立模具'}
      </button>
    </div>
  );
}

export default function Molds() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);

  const { data: molds = [], isLoading } = useQuery({
    queryKey: ['molds', status],
    queryFn: () => getMolds(status || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: deleteMold,
    onSuccess: () => qc.invalidateQueries(['molds']),
  });

  const warningCount = molds.filter(m => m.status === 'warning' || m.status === 'overhaul').length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">模具管理</h1>
          {warningCount > 0 && <div className="text-xs text-amber-600 font-medium mt-0.5">{warningCount} 件需保養或大修</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增模具
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {[{ k: '', l: '全部' }, { k: 'active', l: '正常' }, { k: 'warning', l: '即將到保' }, { k: 'overhaul', l: '需大修' }].map(s => (
          <button key={s.k} onClick={() => setStatus(s.k)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${status === s.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : molds.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無模具資料</div>
      ) : (
        <div className="space-y-2">
          {molds.map(m => {
            const st = STATUS[m.status] || STATUS.active;
            const pct = Math.min(100, Math.round(m.current_shots / m.max_shots * 100));
            return (
              <div key={m.id} className={`card p-4 cursor-pointer hover:shadow-md transition-shadow ${m.status === 'overhaul' ? 'border-red-200' : m.status === 'warning' ? 'border-amber-200' : ''}`} onClick={() => setSelected(m)}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{m.code}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{m.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {m.machine_name && <span>{m.machine_name} · </span>}
                      {m.product_name && <span>{m.product_name} · </span>}
                      {m.material && <span>{m.material}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-800">{m.current_shots?.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">/ {m.max_shots?.toLocaleString()}</div>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1 text-right">{pct}%</div>
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
              <h2 className="font-bold text-slate-800">新增模具</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><MoldForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {selected && <MoldDetail mold={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
