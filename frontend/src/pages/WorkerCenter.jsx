import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWorkers, getWorker, saveWorker, setWorkerStatus, getWorkerMeta,
  getSlots, addSlot, deleteSlot,
  getWorkerInvitations, respondInvitation,
} from '../api/workers';
import { getLeave, getSalaryHistory } from '../api/laborPayroll';
import { useCurrentWorker } from '../hooks/useCurrentWorker';

// 2026 年度請假額度（依年資自動計算）
function LeaveQuotaCard({ workerId }) {
  const { data } = useQuery({ queryKey: ['leave', workerId], queryFn: () => getLeave(workerId), enabled: !!workerId });
  if (!data) return null;
  return (
    <div className="card p-4 bg-amber-50/40 border-amber-100">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="font-bold text-slate-800">{data.year} 年度請假額度</h3>
        <span className="text-xs text-slate-400">年資 {data.seniority_years} 年 · 特休 {data.annual_leave} 天</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-amber-100">
              <th className="text-left py-1.5 font-medium">假別</th>
              <th className="text-right py-1.5 font-medium">額度</th>
              <th className="text-right py-1.5 font-medium">已用</th>
              <th className="text-right py-1.5 font-medium">剩餘</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.leave_type} className="border-b border-amber-50 last:border-0">
                <td className="py-2 text-slate-700">{r.leave_type}</td>
                <td className="py-2 text-right text-slate-600">{r.quota}</td>
                <td className="py-2 text-right text-slate-500">{r.used}</td>
                <td className={`py-2 text-right font-semibold ${r.remaining < r.quota ? 'text-amber-700' : 'text-slate-700'}`}>{r.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 薪資歷史
function SalaryHistoryCard({ workerId }) {
  const { data } = useQuery({ queryKey: ['salary-history', workerId], queryFn: () => getSalaryHistory(workerId), enabled: !!workerId });
  if (!data || data.records.length === 0) return null;
  const PERIOD = { first: '上期', second: '下期', full: '全月' };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800">薪資歷史</h3>
        <span className="text-sm font-bold text-indigo-600">累計實發 NT$ {data.total_net.toLocaleString()}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left py-1.5 font-medium">期間</th>
              <th className="text-right py-1.5 font-medium">底薪</th>
              <th className="text-right py-1.5 font-medium">加給</th>
              <th className="text-right py-1.5 font-medium">扣墊付</th>
              <th className="text-right py-1.5 font-medium">實發</th>
              <th className="text-center py-1.5 font-medium">狀態</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map(r => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-700">{r.year}/{r.month} {PERIOD[r.period_type]}</td>
                <td className="py-2 text-right">{Math.round(r.base_pay).toLocaleString()}</td>
                <td className="py-2 text-right text-green-600">{Math.round(r.overtime_pay + r.bonus).toLocaleString()}</td>
                <td className="py-2 text-right text-red-500">{Math.round(r.advance_deduction).toLocaleString()}</td>
                <td className="py-2 text-right font-bold text-indigo-600">{Math.round(r.net_pay).toLocaleString()}</td>
                <td className="py-2 text-center"><span className="text-xs text-slate-400">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const INV_STATUS = {
  pending: { label: '待回覆', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: '已接受', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已婉拒', color: 'bg-slate-100 text-slate-500' },
  completed: { label: '已完工', color: 'bg-blue-100 text-blue-700' },
};

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-green-400'}`}
    >
      {children}
    </button>
  );
}

// ───── 我的檔案 ─────
function ProfileTab({ worker, meta, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', work_types: [], pricing_method: '日薪', team_size: 1,
    price_min: '', price_max: '', phone: '', line_name: '', service_areas: [], intro: '',
  });

  useEffect(() => {
    if (worker) setForm({
      name: worker.name || '', work_types: worker.work_types || [],
      pricing_method: worker.pricing_method || '日薪', team_size: worker.team_size || 1,
      price_min: worker.price_min || '', price_max: worker.price_max || '',
      phone: worker.phone || '', line_name: worker.line_name || '',
      service_areas: worker.service_areas || [], intro: worker.intro || '',
    });
  }, [worker]);

  const mut = useMutation({
    mutationFn: () => saveWorker({
      id: worker?.id, ...form,
      price_min: +form.price_min || 0, price_max: +form.price_max || 0,
      team_size: +form.team_size || 1,
      primary_city: form.service_areas[0] || null,
      status: worker?.status || 'unlisted',
    }),
    onSuccess: (d) => { qc.invalidateQueries(['my-worker']); onSaved?.(d.id); },
  });

  const toggle = (key, val) => setForm(f => ({
    ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val],
  }));

  return (
    <div className="space-y-5">
      <div>
        <label className="label">姓名 / 隊名 *</label>
        <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：Ben水電工班" />
      </div>

      <div>
        <label className="label">工種（點選，可多選）*</label>
        <div className="flex flex-wrap gap-2">
          {meta.work_types.map(wt => (
            <Chip key={wt} active={form.work_types.includes(wt)} onClick={() => toggle('work_types', wt)}>{wt}</Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">計價方式</label>
          <select className="select" value={form.pricing_method} onChange={e => setForm(f => ({ ...f, pricing_method: e.target.value }))}>
            {meta.pricing_methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">團隊人數</label>
          <select className="select" value={form.team_size} onChange={e => setForm(f => ({ ...f, team_size: e.target.value }))}>
            {[1,2,3,4,5,6,8,10,15,20].map(n => <option key={n} value={n}>{n} 人</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">最低價（元）</label>
          <input type="number" className="input" value={form.price_min} onChange={e => setForm(f => ({ ...f, price_min: e.target.value }))} placeholder="3500" />
        </div>
        <div>
          <label className="label">最高價（元）</label>
          <input type="number" className="input" value={form.price_max} onChange={e => setForm(f => ({ ...f, price_max: e.target.value }))} placeholder="4500" />
        </div>
      </div>

      <div>
        <label className="label">聯絡電話 *</label>
        <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="09xxxxxxxx" />
      </div>

      <div>
        <label className="label">LINE 聯絡名稱</label>
        <input className="input" value={form.line_name} onChange={e => setForm(f => ({ ...f, line_name: e.target.value }))} placeholder="LINE 顯示名稱" />
        <div className="text-xs text-slate-400 mt-1">發案方接受邀約後可透過此名稱於 LINE 聯絡您</div>
      </div>

      <div>
        <label className="label">服務區域（點選，可多選）*</label>
        <div className="flex flex-wrap gap-2">
          {meta.cities.map(c => (
            <Chip key={c} active={form.service_areas.includes(c)} onClick={() => toggle('service_areas', c)}>{c}</Chip>
          ))}
        </div>
      </div>

      <div>
        <label className="label">簡介</label>
        <textarea className="input" rows={2} value={form.intro} onChange={e => setForm(f => ({ ...f, intro: e.target.value }))} placeholder="例：仔細施工 用心施作" />
      </div>

      <button
        className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700"
        disabled={!form.name || form.work_types.length === 0 || form.service_areas.length === 0 || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? '儲存中...' : worker ? '更新檔案' : '建立檔案'}
      </button>

      {worker && (
        <div className="space-y-4 pt-2">
          <LeaveQuotaCard workerId={worker.id} />
          <SalaryHistoryCard workerId={worker.id} />
        </div>
      )}
    </div>
  );
}

// ───── 可接案時段 ─────
function SlotsTab({ worker, meta }) {
  const qc = useQueryClient();
  const { data: slots = [] } = useQuery({ queryKey: ['slots', worker?.id], queryFn: () => getSlots(worker.id), enabled: !!worker });
  const [form, setForm] = useState({ start_time: '', end_time: '', service_area: '', note: '' });

  const addMut = useMutation({
    mutationFn: () => addSlot(worker.id, form),
    onSuccess: () => { qc.invalidateQueries(['slots']); setForm({ start_time: '', end_time: '', service_area: '', note: '' }); },
  });
  const delMut = useMutation({ mutationFn: deleteSlot, onSuccess: () => qc.invalidateQueries(['slots']) });

  if (!worker) return <div className="card p-8 text-center text-slate-400">請先於「我的檔案」建立檔案</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-bold text-slate-800 mb-4">新增可接案時段</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">開始</label>
            <input type="datetime-local" className="input" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div>
            <label className="label">結束</label>
            <input type="datetime-local" className="input" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
        </div>
        <div className="mb-4">
          <label className="label">可服務區域</label>
          <select className="select" value={form.service_area} onChange={e => setForm(f => ({ ...f, service_area: e.target.value }))}>
            <option value="">請選擇</option>
            {(worker.service_areas.length ? worker.service_areas : meta.cities).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="label">備註</label>
          <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </div>
        <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" disabled={!form.start_time || !form.end_time || addMut.isPending} onClick={() => addMut.mutate()}>
          {addMut.isPending ? '新增中...' : '新增時段'}
        </button>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-slate-800 mb-4">我的時段</h2>
        {slots.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-4">尚無可接案時段</div>
        ) : (
          <div className="space-y-2">
            {slots.map(s => (
              <div key={s.id} className="flex items-start justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <div className="font-medium text-slate-800">
                    {s.start_time?.replace('T', ' ')} ~ {s.end_time?.replace('T', ' ')}
                  </div>
                  {s.service_area && <div className="text-sm text-slate-500">{s.service_area}</div>}
                  {s.note && <div className="text-xs text-slate-400">{s.note}</div>}
                </div>
                <button className="text-red-500 text-sm font-medium hover:text-red-700" onClick={() => delMut.mutate(s.id)}>刪除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───── 邀約 ─────
function InvitationsTab({ worker }) {
  const qc = useQueryClient();
  const { data: invitations = [] } = useQuery({ queryKey: ['my-invitations', worker?.id], queryFn: () => getWorkerInvitations(worker.id), enabled: !!worker });
  const respondMut = useMutation({
    mutationFn: ({ id, status }) => respondInvitation(id, status),
    onSuccess: () => { qc.invalidateQueries(['my-invitations']); qc.invalidateQueries(['my-jobs']); },
  });

  if (!worker) return <div className="card p-8 text-center text-slate-400">請先於「我的檔案」建立檔案</div>;

  return (
    <div className="space-y-3">
      {invitations.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">目前沒有接案邀約</div>
      ) : invitations.map(inv => {
        const st = INV_STATUS[inv.status] || INV_STATUS.pending;
        return (
          <div key={inv.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs text-slate-400">{inv.invitation_no}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                <div className="font-semibold text-slate-800">{inv.project_name}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {inv.client_name && `${inv.client_name} · `}{inv.location}
                </div>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-400">
                  {inv.work_date && <span>需求日期：{inv.work_date}</span>}
                  {inv.offer_price > 0 && <span className="text-green-600 font-semibold">出價 {inv.offer_price.toLocaleString()} 元</span>}
                </div>
                {inv.description && <div className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2">{inv.description}</div>}
              </div>
            </div>
            {inv.status === 'pending' && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button className="btn-primary flex-1 py-2 bg-green-600 hover:bg-green-700" onClick={() => respondMut.mutate({ id: inv.id, status: 'accepted' })}>接受案件</button>
                <button className="btn-ghost flex-1 py-2 text-slate-500" onClick={() => respondMut.mutate({ id: inv.id, status: 'rejected' })}>婉拒</button>
              </div>
            )}
            {inv.status === 'accepted' && inv.client_phone && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                <span className="text-slate-500">聯絡電話：</span>
                <a href={`tel:${inv.client_phone}`} className="text-green-600 font-semibold">{inv.client_phone}</a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  { key: 'invitations', label: '邀約' },
  { key: 'slots', label: '可接案時段' },
  { key: 'profile', label: '我的檔案' },
];

export default function WorkerCenter() {
  const [tab, setTab] = useState('invitations');

  const { data: meta, isLoading: metaLoading, isError: metaError, refetch: refetchMeta } = useQuery({ queryKey: ['worker-meta'], queryFn: getWorkerMeta });
  const { worker, workers, setWorker } = useCurrentWorker();
  const qc = useQueryClient();

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => setWorkerStatus(id, status),
    onSuccess: () => { qc.invalidateQueries(['my-worker']); },
  });

  if (metaError) return (
    <div className="card p-8 text-center mt-6">
      <div className="text-red-500 font-medium">無法連線伺服器</div>
      <button className="btn-secondary text-sm mt-3" onClick={() => refetchMeta()}>重新載入</button>
    </div>
  );
  if (metaLoading || !meta) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>;

  return (
    <div className="pb-24 md:pb-6 -mx-4 md:mx-0">
      {/* 綠色標頭（對應截圖）*/}
      <div className="bg-green-600 text-white px-4 py-5 md:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">點工接案中心</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-green-100">{worker?.name || '尚未建立檔案'}</span>
              {worker && (
                <button
                  onClick={() => statusMut.mutate({ id: worker.id, status: worker.status === 'listed' ? 'unlisted' : 'listed' })}
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${worker.status === 'listed' ? 'bg-green-200 text-green-800' : 'bg-white/20 text-white'}`}
                >
                  {worker.status === 'listed' ? '已上架' : '未上架（點此上架）'}
                </button>
              )}
            </div>
          </div>
          {workers.length > 1 && (
            <select
              value={worker?.id || ''}
              onChange={(e) => setWorker(e.target.value)}
              className="text-sm bg-white/20 text-white border border-white/30 rounded-lg px-2 py-1 shrink-0"
            >
              {workers.map(w => <option key={w.id} value={w.id} className="text-slate-800">{w.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-4 md:px-0 mt-0 bg-white sticky top-0 z-10">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-0 py-5">
        {tab === 'profile' && <ProfileTab worker={worker} meta={meta} />}
        {tab === 'slots' && <SlotsTab worker={worker} meta={meta} />}
        {tab === 'invitations' && <InvitationsTab worker={worker} />}
      </div>
    </div>
  );
}
