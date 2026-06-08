import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatDate } from '../utils';

const api = axios.create({ baseURL: '/api' });
const getHandovers = (date) => api.get('/handovers', { params: date ? { date } : {} }).then(r => r.data);
const createHandover = (data) => api.post('/handovers', data).then(r => r.data);
const signHandover = (id) => api.patch(`/handovers/${id}/sign`, {}).then(r => r.data);
const getSummary = () => api.get('/handovers/summary/today').then(r => r.data);

const SHIFTS = { morning: '早班 06:00-14:00', afternoon: '午班 14:00-22:00', night: '夜班 22:00-06:00' };

export default function Handovers() {
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [showCreate, setShowCreate] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['handovers', date],
    queryFn: () => getHandovers(date),
  });

  const signMutation = useMutation({
    mutationFn: signHandover,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['handovers'] }),
  });

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">換班交接</h1>
          <p className="text-sm text-slate-500 mt-1">班別交接紀錄與簽名確認</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>建立交接</button>
      </div>

      <div className="flex items-center gap-3">
        <label className="label whitespace-nowrap">查詢日期</label>
        <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : data.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">該日無交接記錄</div>
      ) : (
        <div className="space-y-4">
          {data.map(h => (
            <div key={h.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900">{SHIFTS[h.shift] || h.shift}</span>
                    <span className="text-sm text-slate-500">{formatDate(h.shift_date)}</span>
                    {h.signed ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">已簽名</span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">待簽名</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    交班：{h.from_operator} → 接班：{h.to_operator}
                  </div>
                </div>
                {!h.signed && (
                  <button className="btn-primary text-sm" onClick={() => signMutation.mutate(h.id)}>
                    確認接班
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                {h.production_summary && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">生產摘要</div>
                    <p className="text-slate-700 whitespace-pre-wrap">{h.production_summary}</p>
                  </div>
                )}
                {h.issues && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">待處理問題</div>
                    <p className="text-slate-700 whitespace-pre-wrap">{h.issues}</p>
                  </div>
                )}
                {h.equipment_status && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">設備狀態</div>
                    <p className="text-slate-700 whitespace-pre-wrap">{h.equipment_status}</p>
                  </div>
                )}
                {h.materials_status && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">物料狀態</div>
                    <p className="text-slate-700 whitespace-pre-wrap">{h.materials_status}</p>
                  </div>
                )}
                {h.notes && (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">備註</div>
                    <p className="text-slate-700 whitespace-pre-wrap">{h.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['handovers'] }); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

function CreateModal({ onClose, onSuccess }) {
  const { data: summary } = useQuery({ queryKey: ['handover-summary'], queryFn: getSummary });
  const [form, setForm] = useState({
    shift: 'morning',
    shift_date: dayjs().format('YYYY-MM-DD'),
    from_operator: '',
    to_operator: '',
    production_summary: '',
    issues: '',
    equipment_status: '',
    materials_status: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: createHandover,
    onSuccess,
  });

  const fillFromSummary = () => {
    if (!summary) return;
    const lines = summary.wos.map(w => `${w.product_name} (${w.machine_name})：完成 ${w.today_qty || 0} 件，不良 ${w.today_defect || 0} 件`).join('\n');
    setForm(f => ({
      ...f,
      production_summary: lines,
      issues: summary.open_anomalies > 0 ? `尚有 ${summary.open_anomalies} 件未處理異常` : '無',
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">建立交接記錄</h3>
          <button onClick={fillFromSummary} className="btn-secondary text-sm">自動填入今日數據</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">班別</label>
              <select className="select" value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                <option value="morning">早班</option>
                <option value="afternoon">午班</option>
                <option value="night">夜班</option>
              </select>
            </div>
            <div>
              <label className="label">日期</label>
              <input type="date" className="input" value={form.shift_date} onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">交班人</label>
              <input className="input" value={form.from_operator} onChange={e => setForm(f => ({ ...f, from_operator: e.target.value }))} />
            </div>
            <div>
              <label className="label">接班人</label>
              <input className="input" value={form.to_operator} onChange={e => setForm(f => ({ ...f, to_operator: e.target.value }))} />
            </div>
          </div>
          {[
            ['production_summary', '生產摘要'],
            ['issues', '待處理問題'],
            ['equipment_status', '設備狀態'],
            ['materials_status', '物料狀態'],
            ['notes', '備註'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="label">{label}</label>
              <textarea className="input" rows={2} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? '建立中...' : '建立交接'}
          </button>
        </div>
      </div>
    </div>
  );
}
