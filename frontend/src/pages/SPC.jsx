import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart } from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getSpecs = (product_id) => api.get('/spc/specs', { params: product_id ? { product_id } : {} }).then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getChart = (spec_id, n) => api.get(`/spc/chart/${spec_id}`, { params: { n } }).then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createSpec = (data) => api.post('/spc/specs', data).then(r => r.data);
const addMeasurement = (data) => api.post('/spc/measurements', data).then(r => r.data);
const deleteSpec = (id) => api.delete(`/spc/specs/${id}`).then(r => r.data);

function CpkBadge({ cpk }) {
  if (cpk === null || cpk === undefined) return <span className="text-xs text-slate-400">無資料</span>;
  const color = cpk >= 1.67 ? 'bg-green-100 text-green-700' : cpk >= 1.33 ? 'bg-blue-100 text-blue-700' : cpk >= 1.0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const label = cpk >= 1.67 ? '優秀' : cpk >= 1.33 ? '良好' : cpk >= 1.0 ? '勉強' : '不合格';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      Cpk {cpk} · {label}
    </span>
  );
}

function ControlChart({ spec_id }) {
  const [n, setN] = useState(50);
  const { data, isLoading } = useQuery({
    queryKey: ['spc-chart', spec_id, n],
    queryFn: () => getChart(spec_id, n),
    enabled: !!spec_id,
  });

  if (isLoading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent" /></div>;
  if (!data || data.measurements.length === 0) return <div className="text-sm text-slate-400 text-center py-8">尚無量測資料</div>;

  const { spec, measurements, stats } = data;
  const chartData = measurements.map((m, i) => ({
    i: i + 1,
    value: m.value,
    out: m.is_out_of_control ? m.value : null,
    wo: m.wo_no,
    time: dayjs(m.measured_at).format('MM/DD HH:mm'),
  }));

  return (
    <div className="space-y-4">
      {/* 統計摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: '平均值', value: stats.mean, unit: spec.unit },
          { label: '標準差 σ', value: stats.sigma, unit: spec.unit },
          { label: 'Cp', value: stats.cp ?? '-', unit: '' },
          { label: 'Cpk', value: stats.cpk ?? '-', unit: '' },
        ].map(item => (
          <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400 mb-1">{item.label}</div>
            <div className="font-bold text-slate-800">{item.value} {item.unit}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <CpkBadge cpk={stats.cpk} />
        {stats.out_of_control > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            管制外 {stats.out_of_control} 點 ({stats.out_pct}%)
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">顯示最近</span>
          <select className="text-xs border border-slate-200 rounded-lg px-2 py-1" value={n} onChange={e => setN(+e.target.value)}>
            {[20, 50, 100, 200].map(v => <option key={v} value={v}>{v} 點</option>)}
          </select>
        </div>
      </div>

      {/* 管制圖 */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="i" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow">
                    <div className="font-bold text-slate-800">{d?.value} {spec.unit}</div>
                    {d?.wo && <div className="text-slate-500">{d.wo}</div>}
                    <div className="text-slate-400">{d?.time}</div>
                  </div>
                );
              }}
            />
            {stats.ucl !== null && <ReferenceLine y={stats.ucl} stroke="#ef4444" strokeDasharray="4 2" label={{ value: `UCL ${stats.ucl}`, fontSize: 9, fill: '#ef4444' }} />}
            {stats.lcl !== null && <ReferenceLine y={stats.lcl} stroke="#ef4444" strokeDasharray="4 2" label={{ value: `LCL ${stats.lcl}`, fontSize: 9, fill: '#ef4444' }} />}
            {spec.usl !== null && <ReferenceLine y={spec.usl} stroke="#f97316" strokeDasharray="6 3" label={{ value: `USL ${spec.usl}`, fontSize: 9, fill: '#f97316' }} />}
            {spec.lsl !== null && <ReferenceLine y={spec.lsl} stroke="#f97316" strokeDasharray="6 3" label={{ value: `LSL ${spec.lsl}`, fontSize: 9, fill: '#f97316' }} />}
            {spec.target !== null && <ReferenceLine y={spec.target} stroke="#10b981" strokeDasharray="6 3" />}
            <Line type="monotone" dataKey="value" stroke="#0e7de8" strokeWidth={1.5} dot={(props) => {
              const { cx, cy, payload } = props;
              const isOut = payload.out !== null;
              return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={isOut ? 5 : 3} fill={isOut ? '#ef4444' : '#0e7de8'} stroke="white" strokeWidth={1} />;
            }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AddMeasurementModal({ spec, onClose }) {
  const qc = useQueryClient();
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const [form, setForm] = useState({ value: '', work_order_id: '', operator: '' });

  const mut = useMutation({
    mutationFn: () => addMeasurement({ spec_id: spec.id, ...form, value: +form.value }),
    onSuccess: (data) => {
      qc.invalidateQueries(['spc-chart']);
      qc.invalidateQueries(['spc-measurements']);
      if (data.is_out_of_control) alert(`警告：量測值 ${form.value} ${spec.unit} 超出規格界限！`);
      setForm(f => ({ ...f, value: '' }));
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-bold text-slate-800">新增量測</div>
            <div className="text-sm text-slate-500">{spec.measurement_name} · {spec.product_code}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {(spec.usl || spec.lsl) && (
            <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="text-slate-400">下限 LSL</div><div className="font-bold text-slate-700">{spec.lsl ?? '-'}</div></div>
              <div><div className="text-slate-400">目標</div><div className="font-bold text-brand-600">{spec.target ?? '-'}</div></div>
              <div><div className="text-slate-400">上限 USL</div><div className="font-bold text-slate-700">{spec.usl ?? '-'}</div></div>
            </div>
          )}
          <div>
            <label className="label">量測值 ({spec.unit}) *</label>
            <input type="number" step="any" className="input text-2xl font-bold text-center py-4" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.000" autoFocus />
          </div>
          <div>
            <label className="label">關聯工單</label>
            <select className="select" value={form.work_order_id} onChange={e => setForm(f => ({ ...f, work_order_id: e.target.value }))}>
              <option value="">-- 選填 --</option>
              {wos.filter(w => !['completed','cancelled'].includes(w.status)).map(w => (
                <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">量測人員</label>
            <input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} />
          </div>
          <button className="btn-primary w-full py-3" disabled={!form.value || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '記錄中...' : '記錄量測值'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddSpecModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const [form, setForm] = useState({ product_id: '', measurement_name: '', unit: 'mm', usl: '', lsl: '', target: '' });

  const mut = useMutation({
    mutationFn: () => createSpec({ ...form, usl: form.usl !== '' ? +form.usl : null, lsl: form.lsl !== '' ? +form.lsl : null, target: form.target !== '' ? +form.target : null }),
    onSuccess: () => { qc.invalidateQueries(['spc-specs']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">新增量測規格</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">產品 *</label>
              <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">-- 選擇 --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">單位</label>
              <input className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="mm" />
            </div>
          </div>
          <div>
            <label className="label">量測項目名稱 *</label>
            <input className="input" value={form.measurement_name} onChange={e => setForm(f => ({ ...f, measurement_name: e.target.value }))} placeholder="外徑、孔徑、硬度..." />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">下限 LSL</label>
              <input type="number" step="any" className="input" value={form.lsl} onChange={e => setForm(f => ({ ...f, lsl: e.target.value }))} />
            </div>
            <div>
              <label className="label">目標值</label>
              <input type="number" step="any" className="input" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
            </div>
            <div>
              <label className="label">上限 USL</label>
              <input type="number" step="any" className="input" value={form.usl} onChange={e => setForm(f => ({ ...f, usl: e.target.value }))} />
            </div>
          </div>
          <button className="btn-primary w-full py-3" disabled={!form.product_id || !form.measurement_name || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '建立中...' : '建立規格'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SPC() {
  const qc = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [showAddSpec, setShowAddSpec] = useState(false);
  const [measuringSpec, setMeasuringSpec] = useState(null);

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: specs = [], isLoading } = useQuery({
    queryKey: ['spc-specs', selectedProduct],
    queryFn: () => getSpecs(selectedProduct || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSpec,
    onSuccess: () => { qc.invalidateQueries(['spc-specs']); setSelectedSpec(null); },
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">SPC 統計製程管制</h1>
          <div className="text-xs text-slate-400 mt-0.5">管制圖 · Cp/Cpk · 異常即時警示</div>
        </div>
        <button className="btn-primary" onClick={() => setShowAddSpec(true)}>新增規格</button>
      </div>

      {/* 產品篩選 */}
      <select className="select" value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setSelectedSpec(null); }}>
        <option value="">全部產品</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : specs.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <div>尚未設定量測規格</div>
          <button className="btn-primary mt-4" onClick={() => setShowAddSpec(true)}>新增第一個規格</button>
        </div>
      ) : (
        <div className="space-y-3">
          {specs.map(spec => {
            const isSelected = selectedSpec?.id === spec.id;
            return (
              <div key={spec.id} className={`card overflow-hidden ${isSelected ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="p-4 cursor-pointer" onClick={() => setSelectedSpec(isSelected ? null : spec)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">{spec.measurement_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {spec.product_name || spec.product_code}
                        {spec.lsl !== null && ` · LSL ${spec.lsl}`}
                        {spec.target !== null && ` · 目標 ${spec.target}`}
                        {spec.usl !== null && ` · USL ${spec.usl}`}
                        <span> · {spec.unit}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); setMeasuringSpec(spec); }} className="btn-primary text-xs py-1.5 px-3">量測</button>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-slate-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    <ControlChart spec_id={spec.id} />
                    <button onClick={() => { if (confirm('確定刪除此規格及所有量測記錄？')) deleteMut.mutate(spec.id); }} className="mt-3 text-xs text-red-400 hover:text-red-600">刪除此規格</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddSpec && <AddSpecModal onClose={() => setShowAddSpec(false)} />}
      {measuringSpec && <AddMeasurementModal spec={measuringSpec} onClose={() => setMeasuringSpec(null)} />}
    </div>
  );
}
