import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getAllPerf = (month) => api.get('/performance', { params: { month } }).then(r => r.data);
const getOperatorPerf = (operator, month) => api.get(`/performance/${encodeURIComponent(operator)}`, { params: { month } }).then(r => r.data);

function RankBadge({ rank }) {
  const colors = ['bg-amber-400', 'bg-slate-400', 'bg-amber-700'];
  return (
    <div className={`w-7 h-7 rounded-full ${colors[rank - 1] || 'bg-slate-100'} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
      {rank}
    </div>
  );
}

function OperatorDetail({ operator, month, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['perf-detail', operator, month],
    queryFn: () => getOperatorPerf(operator, month),
  });

  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const { summary, by_product = [], trend = [], recent_logs = [] } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 text-lg">{operator}</div>
            <div className="text-sm text-slate-500">{month} 績效報告</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { l: '良品數量', v: summary?.total_ok?.toLocaleString(), c: 'text-green-600' },
              { l: '不良品', v: summary?.total_defect || 0, c: summary?.total_defect > 0 ? 'text-red-500' : 'text-slate-400' },
              { l: '良率', v: summary?.yield_rate !== null ? `${summary.yield_rate}%` : '-', c: (summary?.yield_rate || 0) >= 95 ? 'text-green-600' : 'text-amber-600' },
              { l: '計件薪資', v: summary?.net_pay ? `${summary.net_pay.toLocaleString()}元` : '-', c: 'text-brand-600' },
            ].map(item => (
              <div key={item.l} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${item.c}`}>{item.v}</div>
                <div className="text-xs text-slate-400 mt-0.5">{item.l}</div>
              </div>
            ))}
          </div>

          {/* 6個月趨勢 */}
          {trend.length > 0 && (
            <div className="card p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-3">6個月良品趨勢</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ok" name="良品" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="defect" name="不良" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 依產品 */}
          {by_product.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">依產品明細</div>
              <div className="space-y-2">
                {by_product.map(p => (
                  <div key={p.product_code || p.product_name} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{p.product_name}</div>
                      <div className="text-xs text-slate-400">{p.product_code}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold text-green-600">+{p.ok}</div>
                      {p.defect > 0 && <div className="text-red-500 text-xs">-{p.defect}</div>}
                    </div>
                    <div className={`text-xs font-bold w-14 text-right ${(p.yield_rate || 0) >= 95 ? 'text-green-600' : 'text-amber-600'}`}>
                      {p.yield_rate !== null ? `${p.yield_rate}%` : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 最近記錄 */}
          {recent_logs.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">最近回報記錄</div>
              <div className="space-y-1">
                {recent_logs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate">{log.product_name}</div>
                      <div className="text-xs text-slate-400">{log.wo_no} · {dayjs(log.logged_at).format('MM/DD HH:mm')}</div>
                    </div>
                    <div className="text-sm font-bold text-green-600">+{log.qty}</div>
                    {log.defect_qty > 0 && <div className="text-xs text-red-500">-{log.defect_qty}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [selected, setSelected] = useState(null);

  const { data = { operators: [], month: '' }, isLoading } = useQuery({
    queryKey: ['performance-all', month],
    queryFn: () => getAllPerf(month),
  });

  const { operators } = data;
  const totalOk = operators.reduce((s, o) => s + (o.total_ok || 0), 0);
  const totalDefect = operators.reduce((s, o) => s + (o.total_defect || 0), 0);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">師傅績效</h1>
          <div className="text-xs text-slate-400 mt-0.5">點擊師傅查看詳細績效報告</div>
        </div>
        <input type="month" className="input w-auto text-sm py-1.5" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {/* 月度合計 */}
      {operators.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-green-600">{totalOk.toLocaleString()}</div>
            <div className="text-xs text-slate-400">月度良品總量</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-red-500">{totalDefect}</div>
            <div className="text-xs text-slate-400">不良品總量</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-brand-600">{operators.length}</div>
            <div className="text-xs text-slate-400">參與師傅</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : operators.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">此月份尚無進度回報記錄</div>
      ) : (
        <div className="space-y-2">
          {operators.map((op, i) => (
            <div key={op.operator} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(op.operator)}>
              <div className="flex items-center gap-3">
                <RankBadge rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800">{op.operator}</div>
                  <div className="flex gap-3 mt-0.5 text-xs text-slate-400">
                    <span>{op.wo_count} 張工單</span>
                    <span>{op.log_count} 次回報</span>
                    <span>平均 {op.avg_per_log} 件/次</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-green-600">{op.total_ok?.toLocaleString()} 件</div>
                  <div className={`text-xs font-semibold ${(op.yield_rate || 0) >= 95 ? 'text-green-500' : (op.yield_rate || 0) >= 85 ? 'text-amber-500' : 'text-red-500'}`}>
                    良率 {op.yield_rate !== null ? `${op.yield_rate}%` : '-'}
                  </div>
                </div>
              </div>
              {/* 進度條 */}
              {totalOk > 0 && (
                <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round(op.total_ok / totalOk * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && <OperatorDetail operator={selected} month={month} onClose={() => setSelected(null)} />}
    </div>
  );
}
