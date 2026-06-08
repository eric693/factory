import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { formatDate } from '../utils';

const api = axios.create({ baseURL: '/api' });
const getInquiries = () => api.get('/quotes/inquiries').then(r => r.data);
const getQuotes = () => api.get('/quotes').then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getSettings = () => api.get('/settings').then(r => r.data);
const calculateQuote = (data) => api.post('/quotes/calculate', data).then(r => r.data);
const createQuote = (data) => api.post('/quotes', data).then(r => r.data);
const updateInquiryStatus = (id, data) => api.patch(`/quotes/inquiries/${id}/status`, data).then(r => r.data);
const updateQuoteStatus = (id, status) => api.patch(`/quotes/${id}/status`, { status }).then(r => r.data);
const setQuoteResult = (id, data) => api.patch(`/quotes/${id}/result`, data).then(r => r.data);
const getWinrate = (year) => api.get('/quotes/stats/winrate', { params: { year } }).then(r => r.data);

const RESULT_CLS = {
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-500',
};
const LOST_REASONS = ['價格太高', '交期太長', '品質疑慮', '產能不足', '競爭對手', '客戶取消專案', '其他'];

const STATUS_CLS = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  quoted: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};
const QUOTE_STATUS_CLS = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function Quotes() {
  const [tab, setTab] = useState('calculator');
  const [items, setItems] = useState([{ product_id: '', product_name: '', qty: 1, std_hours: 1 }]);
  const [marginPct, setMarginPct] = useState(25);
  const [laborRate, setLaborRate] = useState(300);
  const [calcResult, setCalcResult] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [selectedInquiry, setSelectedInquiry] = useState(null);

  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: inquiries = [] } = useQuery({ queryKey: ['inquiries'], queryFn: getInquiries });
  const { data: quotes = [] } = useQuery({ queryKey: ['quotes'], queryFn: getQuotes });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  // 從系統設定載入預設值
  useEffect(() => {
    if (settings) {
      if (settings.default_margin_pct) setMarginPct(parseFloat(settings.default_margin_pct.value));
      if (settings.default_labor_rate) setLaborRate(parseFloat(settings.default_labor_rate.value));
    }
  }, [settings]);

  const calcMutation = useMutation({
    mutationFn: calculateQuote,
    onSuccess: setCalcResult,
  });

  const createMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      alert(`報價單 ${data.quote_no} 已建立`);
      setCalcResult(null);
      setItems([{ product_id: '', product_name: '', qty: 1, std_hours: 1 }]);
      setTab('quotes');
    },
  });

  const updateQuoteStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateQuoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });

  const resultMutation = useMutation({
    mutationFn: ({ id, result, lost_reason }) => setQuoteResult(id, { result, lost_reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); qc.invalidateQueries({ queryKey: ['winrate'] }); },
  });

  const [resultModal, setResultModal] = useState(null);
  const [winrateYear, setWinrateYear] = useState(new Date().getFullYear().toString());
  const { data: winrate } = useQuery({ queryKey: ['winrate', winrateYear], queryFn: () => getWinrate(winrateYear), enabled: tab === 'winrate' });

  const calcItems = items.map(it => {
    const p = products.find(p => p.id === it.product_id);
    return { ...it, product_name: p?.name || it.product_name, product_code: p?.code || '' };
  });

  const handleCalc = () => {
    calcMutation.mutate({ items: calcItems, margin_pct: marginPct, labor_cost_per_hour: laborRate });
  };

  const handleCreateQuote = () => {
    if (!calcResult) return;
    const quoteItems = calcResult.items.map(i => ({
      ...i,
      material_cost: i.material_cost_unit,
      labor_cost: i.labor_cost_unit,
    }));
    createMutation.mutate({
      customer_name: customerName,
      inquiry_id: selectedInquiry?.id || null,
      items: quoteItems,
      margin_pct: marginPct,
      valid_days: 30,
      note,
    });
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', qty: 1, std_hours: 1 }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, key, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">報價管理</h1>
        <p className="text-sm text-slate-500 mt-1">依 BOM 自動計算成本，快速產出報價單</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[['calculator', '報價計算機'], ['inquiries', '詢價單'], ['quotes', '報價單'], ['winrate', '勝率分析']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === k ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'calculator' && (
        <div className="space-y-6">
          {/* From inquiry */}
          {inquiries.filter(i => i.status === 'pending').length > 0 && (
            <div className="card bg-amber-50 border-amber-200">
              <div className="text-sm font-semibold text-amber-800 mb-2">待處理詢價單</div>
              <div className="flex flex-wrap gap-2">
                {inquiries.filter(i => i.status === 'pending').map(inq => (
                  <button
                    key={inq.id}
                    onClick={() => {
                      setSelectedInquiry(inq);
                      setCustomerName(inq.company_name);
                      if (inq.items?.length > 0) {
                        setItems(inq.items.map(it => ({ product_id: '', product_name: it.product_name, qty: it.qty || 1, std_hours: 1 })));
                      }
                    }}
                    className="text-sm bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-1.5 hover:bg-amber-100"
                  >
                    {inq.inquiry_no} - {inq.company_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="card">
            <div className="text-sm font-semibold text-slate-700 mb-3">計算參數</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">毛利率 (%)</label>
                <input type="number" className="input" value={marginPct} onChange={e => setMarginPct(+e.target.value)} min={0} max={100} />
              </div>
              <div>
                <label className="label">人工工資 (元/小時)</label>
                <input type="number" className="input" value={laborRate} onChange={e => setLaborRate(+e.target.value)} min={0} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-700">報價品項</div>
              <button className="btn-ghost text-sm" onClick={addItem}>+ 新增品項</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <select
                        className="select"
                        value={item.product_id}
                        onChange={e => {
                          const p = products.find(p => p.id === e.target.value);
                          updateItem(i, 'product_id', e.target.value);
                          if (p) { updateItem(i, 'product_name', p.name); updateItem(i, 'std_hours', p.std_hours || 1); }
                        }}
                      >
                        <option value="">-- 選擇產品 --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {!item.product_id && (
                        <input className="input mt-1" placeholder="或手動輸入產品名" value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} />
                      )}
                    </div>
                    <div>
                      <input type="number" className="input" placeholder="數量" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', +e.target.value)} />
                    </div>
                    <div>
                      <input type="number" className="input" placeholder="標準工時(小時/件)" step={0.1} min={0.1} value={item.std_hours} onChange={e => updateItem(i, 'std_hours', +e.target.value)} />
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button className="text-slate-400 hover:text-red-500 pt-2" onClick={() => removeItem(i)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="btn-primary mt-4 w-full"
              onClick={handleCalc}
              disabled={calcMutation.isPending}
            >
              {calcMutation.isPending ? '計算中...' : '計算報價'}
            </button>
          </div>

          {/* Result */}
          {calcResult && (
            <div className="card">
              <div className="text-sm font-semibold text-slate-700 mb-3">報價計算結果（毛利率 {calcResult.margin_pct}%）</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="pb-2">產品</th><th className="pb-2 text-right">數量</th>
                      <th className="pb-2 text-right">原料/件</th><th className="pb-2 text-right">人工/件</th>
                      <th className="pb-2 text-right">成本/件</th><th className="pb-2 text-right">售價/件</th>
                      <th className="pb-2 text-right">小計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {calcResult.items.map((it, i) => (
                      <tr key={i}>
                        <td className="py-2 font-medium">{it.product_name}</td>
                        <td className="py-2 text-right">{it.qty}</td>
                        <td className="py-2 text-right text-slate-500">{it.material_cost_unit.toLocaleString()}</td>
                        <td className="py-2 text-right text-slate-500">{it.labor_cost_unit.toLocaleString()}</td>
                        <td className="py-2 text-right">{it.unit_cost.toLocaleString()}</td>
                        <td className="py-2 text-right font-semibold text-brand-700">{it.unit_price.toLocaleString()}</td>
                        <td className="py-2 text-right font-bold">{it.total_price.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td colSpan={4} className="pt-2 text-slate-500 text-xs">原料合計：{Math.round(calcResult.totalMaterial).toLocaleString()} | 人工合計：{Math.round(calcResult.totalLabor).toLocaleString()}</td>
                      <td colSpan={2} className="pt-2 text-right font-semibold">報價合計</td>
                      <td className="pt-2 text-right text-lg font-bold text-brand-700">{calcResult.totalPrice.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">客戶名稱</label>
                    <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="客戶名稱" />
                  </div>
                  <div>
                    <label className="label">備註</label>
                    <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="報價備註" />
                  </div>
                </div>
                <button
                  className="btn-primary w-full"
                  onClick={handleCreateQuote}
                  disabled={!customerName || createMutation.isPending}
                >
                  {createMutation.isPending ? '建立中...' : '建立報價單'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'inquiries' && (
        <div className="space-y-3">
          {inquiries.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">暫無詢價單</div>
          ) : inquiries.map(inq => (
            <div key={inq.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold">{inq.inquiry_no}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[inq.status]}`}>
                      {{ pending: '待報價', processing: '處理中', quoted: '已報價', cancelled: '取消' }[inq.status]}
                    </span>
                  </div>
                  <div className="text-slate-700">{inq.company_name} / {inq.contact_name}</div>
                  <div className="text-sm text-slate-500">{inq.contact_phone} {inq.contact_email}</div>
                  {inq.message && <div className="text-sm text-slate-600 mt-1">{inq.message}</div>}
                  {inq.items?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {inq.items.map(it => (
                        <span key={it.id} className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">{it.product_name} x{it.qty}</span>
                      ))}
                    </div>
                  )}
                </div>
                {inq.status === 'pending' && (
                  <button
                    className="btn-primary text-sm"
                    onClick={() => {
                      setSelectedInquiry(inq);
                      setCustomerName(inq.company_name);
                      if (inq.items?.length > 0) setItems(inq.items.map(it => ({ product_id: '', product_name: it.product_name, qty: it.qty || 1, std_hours: 1 })));
                      setTab('calculator');
                    }}
                  >
                    報價
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-3">
          {quotes.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">暫無報價單</div>
          ) : quotes.map(q => (
            <div key={q.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold">{q.quote_no}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_CLS[q.status]}`}>
                      {{ draft: '草稿', sent: '已送出', accepted: '已接受', rejected: '已拒絕' }[q.status]}
                    </span>
                  </div>
                  <div className="text-slate-700">{q.customer_name}</div>
                  <div className="text-sm text-slate-500">
                    毛利率 {q.margin_pct}% | 有效 {q.valid_days} 天
                  </div>
                  <div className="text-lg font-bold text-brand-700 mt-1">
                    NT$ {Math.round(q.final_price).toLocaleString()}
                  </div>
                  {q.items?.length > 0 && (
                    <div className="mt-2 text-sm text-slate-500">
                      {q.items.map(it => `${it.product_name} x${it.qty}`).join('、')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {q.result && q.result !== 'pending' ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${RESULT_CLS[q.result]}`}>
                      {q.result === 'won' ? '已得標' : '未得標'}
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      <button className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 font-medium hover:bg-green-200" onClick={() => resultMutation.mutate({ id: q.id, result: 'won' })}>得標</button>
                      <button className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100" onClick={() => setResultModal(q)}>失單</button>
                    </div>
                  )}
                  {q.status === 'draft' && (
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => updateQuoteStatusMutation.mutate({ id: q.id, status: 'sent' })}>標記送出</button>
                  )}
                  {q.result === 'lost' && q.lost_reason && (
                    <span className="text-xs text-slate-400">{q.lost_reason}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'winrate' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">報價得標率與失單原因分析</div>
            <input type="number" min={2020} max={2030} className="input w-24 text-sm py-1.5" value={winrateYear} onChange={e => setWinrateYear(e.target.value)} />
          </div>

          {/* 總覽 */}
          {winrate?.overall && (
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">{winrate.overall.total || 0}</div>
                <div className="text-xs text-slate-400 mt-0.5">總報價數</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{winrate.overall.won || 0}</div>
                <div className="text-xs text-slate-400 mt-0.5">得標數</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-brand-600">
                  {(winrate.overall.won + winrate.overall.lost) > 0
                    ? Math.round(winrate.overall.won / (winrate.overall.won + winrate.overall.lost) * 100)
                    : 0}%
                </div>
                <div className="text-xs text-slate-400 mt-0.5">得標率</div>
              </div>
            </div>
          )}

          {/* 月度趨勢 */}
          {winrate?.monthly?.length > 0 && (
            <div className="card p-4">
              <div className="font-semibold text-slate-700 mb-3 text-sm">月度得標金額</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={winrate.monthly} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v) => `${(v || 0).toLocaleString()} 元`} />
                    <Bar dataKey="won_amount" name="得標金額" fill="#10b981" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 失單原因 */}
          {winrate?.lostReasons?.length > 0 && (
            <div className="card p-4">
              <div className="font-semibold text-slate-700 mb-3 text-sm">失單原因分析</div>
              <div className="space-y-2">
                {winrate.lostReasons.map(r => {
                  const total = winrate.lostReasons.reduce((s, x) => s + x.cnt, 0);
                  const pct = total > 0 ? Math.round(r.cnt / total * 100) : 0;
                  return (
                    <div key={r.lost_reason}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{r.lost_reason}</span>
                        <span className="text-slate-400">{r.cnt} 件 ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 客戶別 */}
          {winrate?.byCustomer?.length > 0 && (
            <div className="card p-4">
              <div className="font-semibold text-slate-700 mb-3 text-sm">客戶別得標率</div>
              <div className="space-y-2">
                {winrate.byCustomer.map(c => {
                  const rate = c.total > 0 ? Math.round(c.won / c.total * 100) : 0;
                  return (
                    <div key={c.customer_name} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{c.customer_name}</div>
                        <div className="text-xs text-slate-400">{c.won}/{c.total} 得標 · 均價 {(c.avg_price || 0).toLocaleString()}</div>
                      </div>
                      <span className={`text-sm font-bold ${rate >= 60 ? 'text-green-600' : rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{rate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(!winrate || winrate.overall?.total === 0) && (
            <div className="card p-12 text-center text-slate-400">{winrateYear} 年尚無報價記錄</div>
          )}
        </div>
      )}

      {/* 失單原因 Modal */}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setResultModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-800">標記失單</div>
                <div className="text-sm text-slate-500">{resultModal.quote_no}</div>
              </div>
              <button onClick={() => setResultModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="text-sm text-slate-600 mb-2">選擇失單原因：</div>
              {LOST_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => { resultMutation.mutate({ id: resultModal.id, result: 'lost', lost_reason: reason }); setResultModal(null); }}
                  className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:border-red-300 hover:bg-red-50 transition-colors"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
