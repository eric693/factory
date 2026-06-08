import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getMaintenance = (status) => api.get('/maintenance', { params: { status } }).then(r => r.data);
const getMachines = () => api.get('/machines').then(r => r.data);
const createSchedule = (data) => api.post('/maintenance', data).then(r => r.data);
const completeSchedule = (id, data) => api.post(`/maintenance/${id}/complete`, data).then(r => r.data);
const deleteSchedule = (id) => api.delete(`/maintenance/${id}`).then(r => r.data);

const TYPES = {
  routine: { label: '定期保養', color: 'bg-blue-100 text-blue-700' },
  repair:  { label: '故障維修', color: 'bg-red-100 text-red-700' },
  clean:   { label: '清潔保洗', color: 'bg-green-100 text-green-700' },
  inspect: { label: '安全檢查', color: 'bg-amber-100 text-amber-700' },
};

const STATUS = {
  pending:    { label: '待執行', color: 'bg-amber-100 text-amber-700' },
  in_progress:{ label: '執行中', color: 'bg-indigo-100 text-indigo-700' },
  done:       { label: '已完成', color: 'bg-green-100 text-green-700' },
};

function CompleteModal({ schedule, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ done_by: '', actual_hours: '', result: '', note: '' });

  const mut = useMutation({
    mutationFn: () => completeSchedule(schedule.id, { ...form, actual_hours: +form.actual_hours }),
    onSuccess: () => { qc.invalidateQueries(['maintenance']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-bold text-slate-800">標記完成</div>
            <div className="text-sm text-slate-500">{schedule.title}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">執行人員</label>
              <input className="input" value={form.done_by} onChange={e => setForm(f => ({ ...f, done_by: e.target.value }))} placeholder="姓名" />
            </div>
            <div>
              <label className="label">實際工時（小時）</label>
              <input type="number" min={0} step={0.5} className="input" value={form.actual_hours} onChange={e => setForm(f => ({ ...f, actual_hours: e.target.value }))} placeholder="2" />
            </div>
          </div>
          <div>
            <label className="label">執行結果</label>
            <select className="select" value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))}>
              <option value="">-- 選擇 --</option>
              <option value="normal">正常完成</option>
              <option value="parts_replaced">更換零件</option>
              <option value="issue_found">發現異常</option>
              <option value="postponed">暫緩</option>
            </select>
          </div>
          <div>
            <label className="label">備註</label>
            <textarea className="input" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="執行過程描述..." />
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
            完成後系統自動計算下次保養日：{schedule.frequency_days} 天後
          </div>
          <button className="btn-primary w-full py-3" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '儲存中...' : '確認完成'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleForm({ onClose }) {
  const qc = useQueryClient();
  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: getMachines });
  const [form, setForm] = useState({
    machine_id: '',
    title: '',
    maintenance_type: 'routine',
    frequency_days: 30,
    next_due: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    estimated_hours: 2,
    assigned_to: '',
    note: '',
  });

  const mut = useMutation({
    mutationFn: () => createSchedule(form),
    onSuccess: () => { qc.invalidateQueries(['maintenance']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">機台</label>
        <select className="select" value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
          <option value="">-- 選擇機台（選填）--</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">保養項目標題 *</label>
        <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：更換機油、清潔濾網" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">類型</label>
          <select className="select" value={form.maintenance_type} onChange={e => setForm(f => ({ ...f, maintenance_type: e.target.value }))}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">週期（天）</label>
          <input type="number" min={1} className="input" value={form.frequency_days} onChange={e => setForm(f => ({ ...f, frequency_days: +e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">下次到期日 *</label>
          <input type="date" className="input" value={form.next_due} onChange={e => setForm(f => ({ ...f, next_due: e.target.value }))} />
        </div>
        <div>
          <label className="label">預估工時（小時）</label>
          <input type="number" min={0} step={0.5} className="input" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: +e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">指派人員</label>
        <input className="input" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="選填" />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.title || !form.next_due || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立保養排程'}
      </button>
    </div>
  );
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待執行' },
  { key: 'in_progress', label: '執行中' },
  { key: 'done', label: '已完成' },
];

export default function Maintenance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState(null);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['maintenance', tab],
    queryFn: () => getMaintenance(tab !== 'all' ? tab : undefined),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => qc.invalidateQueries(['maintenance']),
  });

  const overdueCount = schedules.filter(s => s.next_due < dayjs().format('YYYY-MM-DD') && s.status === 'pending').length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">計劃性保養</h1>
          {overdueCount > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{overdueCount} 項已逾期</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增排程
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : schedules.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無保養排程</div>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => {
            const type = TYPES[s.maintenance_type] || TYPES.routine;
            const st = STATUS[s.status] || STATUS.pending;
            const daysLeft = dayjs(s.next_due).diff(dayjs(), 'day');
            const isOverdue = daysLeft < 0 && s.status === 'pending';
            const isUrgent = daysLeft <= 3 && !isOverdue && s.status === 'pending';

            return (
              <div key={s.id} className={`card p-4 ${isOverdue ? 'border-red-200 bg-red-50' : isUrgent ? 'border-amber-200' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${type.color}`}>{type.label}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{s.title}</div>
                    {s.machine_name && <div className="text-sm text-slate-500 mt-0.5">{s.machine_name}</div>}
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                      {s.assigned_to && <span>指派：{s.assigned_to}</span>}
                      <span>週期：{s.frequency_days} 天</span>
                      <span>預估：{s.estimated_hours} 小時</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-slate-600'}`}>
                      {isOverdue ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天到期' : `${daysLeft} 天後`}
                    </div>
                    <div className="text-xs text-slate-400">{s.next_due}</div>
                  </div>
                </div>

                {s.status === 'pending' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setCompleting(s)}
                      className="btn-primary text-sm py-1.5 flex-1"
                    >
                      標記完成
                    </button>
                    <button
                      onClick={() => { if (confirm('確定刪除此排程？')) deleteMut.mutate(s.id); }}
                      className="btn-ghost text-sm py-1.5 text-slate-400"
                    >
                      刪除
                    </button>
                  </div>
                )}
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
              <h2 className="font-bold text-slate-800">新增保養排程</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ScheduleForm onClose={() => setShowCreate(false)} />
            </div>
          </div>
        </div>
      )}

      {completing && <CompleteModal schedule={completing} onClose={() => setCompleting(null)} />}
    </div>
  );
}
