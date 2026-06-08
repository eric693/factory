import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getRules = () => api.get('/yield-alerts/rules').then(r => r.data);
const getHistory = (product_id) => api.get('/yield-alerts/history', { params: product_id ? { product_id } : {} }).then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const createRule = (data) => api.post('/yield-alerts/rules', data).then(r => r.data);
const updateRule = (id, data) => api.patch(`/yield-alerts/rules/${id}`, data).then(r => r.data);
const deleteRule = (id) => api.delete(`/yield-alerts/rules/${id}`).then(r => r.data);

function RuleForm({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const [form, setForm] = useState({ product_id: '', threshold_pct: 95, consecutive_wos: 3 });

  const mut = useMutation({
    mutationFn: () => createRule(form),
    onSuccess: () => { qc.invalidateQueries(['yield-rules']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">產品（選填，空白=所有產品）</label>
        <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">全部產品</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">良率預警閾值 (%)</label>
          <input type="number" min={50} max={100} className="input text-xl font-bold text-center py-4" value={form.threshold_pct} onChange={e => setForm(f => ({ ...f, threshold_pct: +e.target.value }))} />
        </div>
        <div>
          <label className="label">連續工單數</label>
          <input type="number" min={1} max={10} className="input text-xl font-bold text-center py-4" value={form.consecutive_wos} onChange={e => setForm(f => ({ ...f, consecutive_wos: +e.target.value }))} />
        </div>
      </div>
      <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
        當連續 {form.consecutive_wos} 張完工工單的良率均低於 {form.threshold_pct}%，系統將自動發送 LINE 預警。
      </div>
      <button className="btn-primary w-full py-3" disabled={mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立預警規則'}
      </button>
    </div>
  );
}

export default function YieldAlert() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');

  const { data: rules = [] } = useQuery({ queryKey: ['yield-rules'], queryFn: getRules });
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['yield-history', selectedProduct],
    queryFn: () => getHistory(selectedProduct || undefined),
  });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => updateRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries(['yield-rules']),
  });
  const deleteMut = useMutation({ mutationFn: deleteRule, onSuccess: () => qc.invalidateQueries(['yield-rules']) });

  // 統計：近期低良率工單
  const lowYield = history.filter(h => h.yield_pct < 95);
  const chartData = history.slice(0, 30).reverse().map((h, i) => ({
    i: i + 1,
    yield_pct: h.yield_pct,
    wo_no: h.wo_no,
    product: h.product_name,
  }));

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">良率預警</h1>
          <div className="text-xs text-slate-400 mt-0.5">連續低良率自動觸發 LINE 通知</div>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>新增規則</button>
      </div>

      {/* 低良率統計 */}
      {lowYield.length > 0 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <div className="font-semibold text-amber-800 mb-2">近期低良率工單（&lt; 95%）</div>
          <div className="space-y-1">
            {lowYield.slice(0, 5).map(h => (
              <div key={h.wo_no} className="flex items-center justify-between text-sm">
                <span className="text-amber-700">{h.wo_no} · {h.product_name}</span>
                <span className={`font-bold ${h.yield_pct < 85 ? 'text-red-600' : 'text-amber-600'}`}>{h.yield_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 預警規則 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-slate-700">預警規則</div>
          {rules.length === 0 && <span className="text-xs text-slate-400">尚未設定規則</span>}
        </div>
        {rules.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-4">新增規則後，良率下降時自動 LINE 通知</div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className={`flex items-center gap-3 p-3 rounded-xl ${rule.is_active ? 'bg-slate-50' : 'bg-slate-100 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{rule.product_name || '全部產品'}</div>
                  <div className="text-xs text-slate-400">連續 {rule.consecutive_wos} 張低於 {rule.threshold_pct}% 觸發</div>
                  {rule.last_triggered && <div className="text-xs text-amber-600">上次觸發：{dayjs(rule.last_triggered).format('MM/DD HH:mm')}</div>}
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  <button onClick={() => toggleMut.mutate({ id: rule.id, is_active: rule.is_active ? 0 : 1 })} className={`text-xs px-2 py-1 rounded-lg font-medium ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                    {rule.is_active ? '啟用' : '停用'}
                  </button>
                  <button onClick={() => { if (confirm('確定刪除此規則？')) deleteMut.mutate(rule.id); }} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 良率歷史圖表 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-slate-700">工單良率趨勢</div>
          <select className="select w-48 text-sm py-1.5" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">全部產品</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-600 border-t-transparent" /></div>
        ) : chartData.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">尚無完工工單資料</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="i" tick={{ fontSize: 10 }} label={{ value: '工單序', position: 'insideBottomRight', offset: -5, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[60, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow"><div className="font-bold">{d?.yield_pct}%</div><div className="text-slate-500">{d?.wo_no}</div><div className="text-slate-400">{d?.product}</div></div>;
                }} />
                <ReferenceLine y={95} stroke="#f97316" strokeDasharray="4 2" label={{ value: '95%', fontSize: 10, fill: '#f97316' }} />
                <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '85%', fontSize: 10, fill: '#ef4444' }} />
                <Line type="monotone" dataKey="yield_pct" name="良率" stroke="#0e7de8" strokeWidth={2} dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isLow = payload.yield_pct < 95;
                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={isLow ? 5 : 3} fill={isLow ? '#ef4444' : '#0e7de8'} stroke="white" strokeWidth={1} />;
                }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">新增預警規則</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4"><RuleForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
