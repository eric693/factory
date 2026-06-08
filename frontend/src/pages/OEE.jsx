import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';
import dayjs from 'dayjs';
import axios from 'axios';

const BASE = '/api';

const EVENT_TYPES = {
  running: { label: '運作中', color: 'bg-green-100 text-green-700' },
  downtime: { label: '停機', color: 'bg-red-100 text-red-700' },
  maintenance: { label: '維修保養', color: 'bg-amber-100 text-amber-700' },
};

function OeeGauge({ value, label, color }) {
  const data = [{ value, fill: color }, { value: 100 - value, fill: '#f1f5f9' }];
  return (
    <div className="text-center">
      <div className="relative h-28 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={data} startAngle={90} endAngle={-270} barSize={12}>
            <RadialBar dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold" style={{ color }}>{value}%</div>
        </div>
      </div>
      <div className="text-sm font-semibold text-slate-600">{label}</div>
    </div>
  );
}

function EventModal({ machines, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    machine_id: machines[0]?.id || '',
    event_type: 'downtime',
    reason: '',
    started_at: dayjs().subtract(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    ended_at: dayjs().format('YYYY-MM-DDTHH:mm'),
    operator: '',
  });

  const mut = useMutation({
    mutationFn: () => axios.post(`${BASE}/oee/event`, {
      ...form,
      started_at: form.started_at.replace('T', ' ') + ':00',
      ended_at: form.ended_at.replace('T', ' ') + ':00',
    }),
    onSuccess: () => { qc.invalidateQueries(['oee']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">記錄設備事件</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">機台</label>
            <select className="select" value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">事件類型</label>
            <select className="select" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
              {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">原因</label>
            <input className="input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="換模、故障、定期保養..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">開始時間</label>
              <input type="datetime-local" className="input" value={form.started_at} onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))} />
            </div>
            <div>
              <label className="label">結束時間</label>
              <input type="datetime-local" className="input" value={form.ended_at} onChange={e => setForm(f => ({ ...f, ended_at: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">操作員</label>
            <input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} />
          </div>
          <button className="btn-primary w-full py-3" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '儲存中...' : '記錄事件'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OEE() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [showEvent, setShowEvent] = useState(false);

  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: () => axios.get(`${BASE}/machines`).then(r => r.data) });
  const { data: oeeData = [], isLoading } = useQuery({
    queryKey: ['oee', month],
    queryFn: () => axios.get(`${BASE}/oee?month=${month}`).then(r => r.data),
  });

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">設備稼動率 OEE</h1>
          <div className="text-xs text-slate-400 mt-0.5">整體設備效率 = 稼動率 × 性能率 × 良率</div>
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" className="input w-auto text-sm py-1.5" value={month} onChange={e => setMonth(e.target.value)} />
          <button className="btn-primary text-sm" onClick={() => setShowEvent(true)}>記錄事件</button>
        </div>
      </div>

      {/* OEE 說明 */}
      <div className="card p-4 bg-blue-50 border-blue-100">
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div><div className="font-bold text-blue-700">世界級水準</div><div className="text-blue-500">OEE &ge; 85%</div></div>
          <div><div className="font-bold text-amber-700">良好</div><div className="text-amber-500">65% ~ 85%</div></div>
          <div><div className="font-bold text-red-700">需改善</div><div className="text-red-500">&lt; 65%</div></div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : (
        <div className="space-y-4">
          {oeeData.map(m => {
            const oeeColor = m.oee >= 85 ? '#10b981' : m.oee >= 65 ? '#f59e0b' : '#ef4444';
            return (
              <div key={m.machine_id} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-bold text-slate-800">{m.machine_name}</div>
                    <div className="text-xs text-slate-400">{m.machine_code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold" style={{ color: oeeColor }}>{m.oee}%</div>
                    <div className="text-xs text-slate-400">OEE</div>
                  </div>
                </div>

                {/* 三率 */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <OeeGauge value={m.availability} label="稼動率" color="#0e7de8" />
                  <OeeGauge value={m.performance} label="性能率" color="#6366f1" />
                  <OeeGauge value={m.quality} label="良率" color="#10b981" />
                </div>

                {/* 數據摘要 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="font-bold text-green-600">{m.running_min || 0}</div>
                    <div className="text-xs text-slate-400">運作分鐘</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="font-bold text-red-500">{m.downtime_min || 0}</div>
                    <div className="text-xs text-slate-400">停機分鐘</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="font-bold text-amber-600">{m.maintenance_min || 0}</div>
                    <div className="text-xs text-slate-400">保養分鐘</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="font-bold text-brand-600">{(m.ok_qty || 0).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">良品數</div>
                  </div>
                </div>

                {/* 事件記錄 */}
                {m.events?.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">事件記錄</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {m.events.map(ev => {
                        const et = EVENT_TYPES[ev.event_type] || EVENT_TYPES.downtime;
                        return (
                          <div key={ev.id} className="flex items-center gap-2 text-sm">
                            <span className={`badge ${et.color} shrink-0`}>{et.label}</span>
                            <span className="text-slate-600 truncate">{ev.reason || '-'}</span>
                            <span className="text-slate-400 shrink-0">{ev.duration_min ? `${ev.duration_min}分` : ''}</span>
                            <span className="text-slate-300 shrink-0 text-xs">{dayjs(ev.started_at).format('MM/DD HH:mm')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showEvent && <EventModal machines={machines} onClose={() => setShowEvent(false)} />}
    </div>
  );
}
