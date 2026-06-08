import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getInsights = () => api.get('/ai/schedule-insights').then(r => r.data);
const applyStdHours = (product_id, std_hours) => api.patch('/ai/apply-std-hours', { product_id, std_hours }).then(r => r.data);

function DeviationBar({ pct }) {
  const abs = Math.abs(pct);
  const capped = Math.min(abs, 100);
  const color = abs > 30 ? 'bg-red-500' : abs > 15 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${capped}%` }} />
      </div>
      <span className={`text-xs font-bold w-14 text-right ${pct > 0 ? 'text-red-500' : 'text-green-600'}`}>
        {pct > 0 ? '+' : ''}{pct}%
      </span>
    </div>
  );
}

export default function AISchedule() {
  const qc = useQueryClient();
  const [applied, setApplied] = useState({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: getInsights,
    staleTime: 60000,
  });

  const applyMut = useMutation({
    mutationFn: ({ product_id, std_hours }) => applyStdHours(product_id, std_hours),
    onSuccess: (_, vars) => {
      setApplied(a => ({ ...a, [vars.product_id]: true }));
      qc.invalidateQueries(['products']);
    },
  });

  const { suggestions = [], bottlenecks = [], atRisk = [], generated_at } = data || {};
  const needAdjust = suggestions.filter(s => s.action !== 'ok');

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">AI 智慧排程建議</h1>
          {generated_at && <div className="text-xs text-slate-400 mt-0.5">分析時間：{generated_at}</div>}
        </div>
        <button className="btn-secondary text-sm" onClick={() => refetch()}>重新分析</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : (
        <>
          {/* 風險訂單 */}
          {atRisk.length > 0 && (
            <div className="card p-4 bg-red-50 border-red-200">
              <div className="font-semibold text-red-800 mb-2">交期風險訂單（5天內到期，進度 &lt; 80%）</div>
              <div className="space-y-2">
                {atRisk.map(o => (
                  <div key={o.order_no} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-mono text-red-700 font-semibold">{o.order_no}</span>
                      <span className="text-red-600 ml-2">{o.customer_name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-700">{o.progress_pct}%</div>
                      <div className="text-xs text-red-500">{o.due_date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 瓶頸機台 */}
          {bottlenecks.length > 0 && (
            <div className="card p-4">
              <div className="font-semibold text-slate-800 mb-3">未來 14 天瓶頸機台</div>
              <div className="space-y-3">
                {bottlenecks.map(b => (
                  <div key={b.machine_id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{b.machine_name}</span>
                      <span className="font-bold text-indigo-600">{Math.round(b.load_hours)} 小時</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, Math.round(b.load_hours / (14 * 8) * 100))}%` }} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{b.pending_wos} 件工單待生產</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 標準工時建議 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-slate-800">標準工時校準建議</div>
                <div className="text-xs text-slate-400">依歷史實際工時自動學習，偏差 &gt; 20% 建議調整</div>
              </div>
              {needAdjust.length > 0 && <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{needAdjust.length} 項建議</span>}
            </div>

            {suggestions.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-6">工單資料不足，需至少 2 張完工工單才能分析</div>
            ) : (
              <div className="space-y-3">
                {suggestions.map(s => {
                  const isApplied = applied[s.product_id];
                  return (
                    <div key={s.product_id} className={`rounded-xl p-3 ${s.action !== 'ok' ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{s.product_name}</div>
                          <div className="text-xs text-slate-400">{s.product_code} · {s.wo_count} 張工單</div>
                        </div>
                        {s.action !== 'ok' && !isApplied && (
                          <button
                            onClick={() => applyMut.mutate({ product_id: s.product_id, std_hours: s.recommended_std_hours })}
                            disabled={applyMut.isPending}
                            className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 shrink-0"
                          >
                            套用建議
                          </button>
                        )}
                        {isApplied && <span className="text-xs text-green-600 font-semibold shrink-0">已套用</span>}
                        {s.action === 'ok' && <span className="text-xs text-green-500 font-semibold shrink-0">準確</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600 mb-2">
                        <div>
                          <span className="text-slate-400">現在</span>
                          <span className="font-bold text-slate-800 ml-1">{s.current_std_hours}h</span>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-slate-400"><polyline points="9 18 15 12 9 6"/></svg>
                        <div>
                          <span className="text-slate-400">建議</span>
                          <span className={`font-bold ml-1 ${s.action === 'increase' ? 'text-red-600' : s.action === 'decrease' ? 'text-green-600' : 'text-slate-800'}`}>{s.recommended_std_hours}h</span>
                        </div>
                        <div className="text-xs text-slate-400">實際 {s.actual_hours_per_unit}h/件</div>
                      </div>
                      <DeviationBar pct={s.deviation_pct} />
                      <div className="text-xs text-slate-400 mt-1">排程準確度：{s.accuracy_pct}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 說明 */}
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 space-y-1">
            <div className="font-semibold">如何運作</div>
            <div>系統比對每張已完工工單的「計畫工時」vs「實際工時」，找出長期偏差最大的產品，建議調整標準工時（std_hours），讓未來排程更準確。</div>
            <div>套用後，新建工單的計畫日期將自動使用修正後的工時計算。</div>
          </div>
        </>
      )}
    </div>
  );
}
