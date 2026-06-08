import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getRates = () => api.get('/payroll/rates').then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const calculate = (period) => api.get(`/payroll/calculate/${period}`).then(r => r.data);
const savePayroll = (period, records) => api.post(`/payroll/save/${period}`, { records }).then(r => r.data);
const getPeriods = () => api.get('/payroll/periods').then(r => r.data);
const closePeriod = (period) => api.patch(`/payroll/periods/${period}/close`).then(r => r.data);
const upsertRate = (data) => api.post('/payroll/rates', data).then(r => r.data);
const updateRate = (id, data) => api.patch(`/payroll/rates/${id}`, data).then(r => r.data);

function RateForm({ rate, onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const [form, setForm] = useState({
    product_id: rate?.product_id || '',
    piece_rate: rate?.piece_rate ?? '',
    defect_penalty: rate?.defect_penalty ?? '',
    bonus_threshold: rate?.bonus_threshold ?? '',
    bonus_rate: rate?.bonus_rate ?? '',
  });

  const mut = useMutation({
    mutationFn: () => rate?.id
      ? updateRate(rate.id, { piece_rate: +form.piece_rate, defect_penalty: +form.defect_penalty, bonus_threshold: +form.bonus_threshold, bonus_rate: +form.bonus_rate })
      : upsertRate({ ...form, piece_rate: +form.piece_rate, defect_penalty: +form.defect_penalty, bonus_threshold: +form.bonus_threshold, bonus_rate: +form.bonus_rate }),
    onSuccess: () => { qc.invalidateQueries(['payroll-rates']); onClose(); },
  });

  return (
    <div className="space-y-4">
      {!rate && (
        <div>
          <label className="label">產品 *</label>
          <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
            <option value="">-- 選擇產品 --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">計件單價（元/件）</label>
          <input type="number" min={0} step={0.01} className="input" value={form.piece_rate} onChange={e => setForm(f => ({ ...f, piece_rate: e.target.value }))} placeholder="5.00" />
        </div>
        <div>
          <label className="label">不良品扣款（元/件）</label>
          <input type="number" min={0} step={0.01} className="input" value={form.defect_penalty} onChange={e => setForm(f => ({ ...f, defect_penalty: e.target.value }))} placeholder="10.00" />
        </div>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 space-y-3">
        <div className="text-xs font-semibold text-slate-500">獎金設定（達標加給）</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">達標數量（件）</label>
            <input type="number" min={0} className="input" value={form.bonus_threshold} onChange={e => setForm(f => ({ ...f, bonus_threshold: e.target.value }))} placeholder="500" />
          </div>
          <div>
            <label className="label">獎金加給（元/件）</label>
            <input type="number" min={0} step={0.01} className="input" value={form.bonus_rate} onChange={e => setForm(f => ({ ...f, bonus_rate: e.target.value }))} placeholder="1.00" />
          </div>
        </div>
        <div className="text-xs text-slate-400">達到目標數量後，每件額外加 {form.bonus_rate || 0} 元獎金</div>
      </div>
      <button className="btn-primary w-full py-3" disabled={(!rate && !form.product_id) || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '儲存中...' : '儲存設定'}
      </button>
    </div>
  );
}

const TABS = [
  { key: 'calculate', label: '薪資計算' },
  { key: 'rates', label: '計件費率' },
  { key: 'history', label: '歷史記錄' },
];

export default function Payroll() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('calculate');
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const [calcResult, setCalcResult] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [editRate, setEditRate] = useState(null);
  const [showAddRate, setShowAddRate] = useState(false);

  const { data: rates = [] } = useQuery({ queryKey: ['payroll-rates'], queryFn: getRates });
  const { data: periods = [] } = useQuery({ queryKey: ['payroll-periods'], queryFn: getPeriods });

  const calcMut = useMutation({
    mutationFn: () => calculate(period),
    onSuccess: (data) => setCalcResult(data),
  });

  const saveMut = useMutation({
    mutationFn: () => savePayroll(period, calcResult?.records?.flatMap(r => r.details || [r])),
    onSuccess: () => { qc.invalidateQueries(['payroll-periods']); alert('薪資記錄已儲存'); },
  });

  const closeMut = useMutation({
    mutationFn: () => closePeriod(period),
    onSuccess: () => { qc.invalidateQueries(['payroll-periods']); alert('期別已封帳'); },
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">計件薪資</h1>
          <div className="text-xs text-slate-400 mt-0.5">自動從進度回報計算計件工資</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'calculate' && (
        <div className="space-y-4">
          <div className="card p-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">計薪期別</label>
              <input type="month" className="input" value={period} onChange={e => setPeriod(e.target.value)} />
            </div>
            <button className="btn-primary py-2.5 px-5 shrink-0" onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
              {calcMut.isPending ? '計算中...' : '計算薪資'}
            </button>
          </div>

          {calcResult && (
            <>
              {/* 合計 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-4 text-center">
                  <div className="text-xs text-slate-400 mb-1">應付薪資總額</div>
                  <div className="text-2xl font-bold text-slate-800">{calcResult.totals?.gross?.toLocaleString()} 元</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-xs text-slate-400 mb-1">實付淨額</div>
                  <div className="text-2xl font-bold text-green-600">{calcResult.totals?.net?.toLocaleString()} 元</div>
                </div>
              </div>

              {/* 師傅明細 */}
              <div className="space-y-2">
                {calcResult.records?.map(r => (
                  <div key={r.operator} className="card overflow-hidden">
                    <div className="p-4 cursor-pointer" onClick={() => setExpanded(expanded === r.operator ? null : r.operator)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
                            {r.operator[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{r.operator}</div>
                            <div className="text-xs text-slate-400">良品 {r.total_ok} 件 · 不良 {r.total_defect} 件</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">{r.net?.toLocaleString()} 元</div>
                          {r.deduction > 0 && <div className="text-xs text-red-500">扣款 {r.deduction?.toLocaleString()}</div>}
                        </div>
                      </div>
                    </div>
                    {expanded === r.operator && r.details?.length > 0 && (
                      <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2">
                        {r.details.map((d, i) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                            <div>
                              <div className="font-medium text-slate-700">{d.product_name}</div>
                              <div className="text-xs text-slate-400">{d.ok_qty} 良品 × {d.piece_rate} 元{d.defect_qty > 0 ? ` - ${d.defect_qty} 不良 × ${d.defect_penalty}` : ''}</div>
                            </div>
                            <div className="font-semibold text-slate-700">{d.net_amount?.toLocaleString()} 元</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>儲存記錄</button>
                <button className="btn-ghost flex-1 text-slate-500" onClick={() => { if (confirm(`確定封帳 ${period}？封帳後不可修改。`)) closeMut.mutate(); }} disabled={closeMut.isPending}>封帳</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'rates' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setShowAddRate(true)}>新增費率</button>
          </div>
          {rates.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">尚未設定計件費率</div>
          ) : (
            <div className="space-y-2">
              {rates.map(rate => (
                <div key={rate.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">{rate.product_name}</div>
                      <div className="text-xs text-slate-400">{rate.product_code}</div>
                      <div className="flex gap-3 mt-1.5 text-sm text-slate-600">
                        <span>計件 <strong>{rate.piece_rate}</strong> 元/件</span>
                        {rate.defect_penalty > 0 && <span>扣款 <strong>{rate.defect_penalty}</strong>/不良</span>}
                        {rate.bonus_threshold > 0 && <span>達 {rate.bonus_threshold} 件加 {rate.bonus_rate} 元</span>}
                      </div>
                    </div>
                    <button className="btn-secondary text-xs" onClick={() => setEditRate(rate)}>編輯</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {periods.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">尚無歷史記錄</div>
          ) : (
            periods.map(p => (
              <div key={p.id} className="card p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{p.period}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{dayjs(p.created_at).format('YYYY/MM/DD')} 建立</div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${p.status === 'closed' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                  {p.status === 'closed' ? '已封帳' : '進行中'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {showAddRate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowAddRate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">新增計件費率</h2>
              <button onClick={() => setShowAddRate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4"><RateForm onClose={() => setShowAddRate(false)} /></div>
          </div>
        </div>
      )}
      {editRate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setEditRate(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">編輯費率 - {editRate.product_name}</h2>
              <button onClick={() => setEditRate(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4"><RateForm rate={editRate} onClose={() => setEditRate(null)} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
