import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatDate } from '../utils';

const api = axios.create({ baseURL: '/api' });
const getReport = (date) => api.get('/morning-report', { params: { date } }).then(r => r.data);

const SEVERITY_CLS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-green-100 text-green-700' };
const ANOMALY_TYPES = { machine_breakdown: '機台故障', material_shortage: '缺料', quality_issue: '品質異常', safety: '安全', other: '其他' };

export default function MorningReport() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const { data: report, isLoading } = useQuery({
    queryKey: ['morning-report', date],
    queryFn: () => getReport(date),
  });

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const s = report?.stats || {};

  return (
    <div className="space-y-5 pb-20 md:pb-0 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">每日晨報</h1>
          <p className="text-sm text-slate-400 mt-0.5">生成於 {report?.generated_at}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input w-auto text-sm py-2" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn-secondary text-sm" onClick={() => window.print()}>列印</button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="昨日完工" value={s.yesterday_ok ?? 0} unit="件" accent="bg-slate-400" />
        <StatCard label="昨日良率" value={`${s.yesterday_yield ?? 100}%`} accent={s.yesterday_yield >= 95 ? 'bg-green-500' : 'bg-amber-500'} color={s.yesterday_yield >= 95 ? 'text-green-600' : 'text-amber-600'} />
        <StatCard label="今日在線工單" value={(s.today_scheduled || 0) + (s.today_in_progress || 0)} unit="筆" accent="bg-brand-500" />
        <StatCard label="逾期訂單" value={s.overdue_count ?? 0} unit="筆" accent={s.overdue_count > 0 ? 'bg-red-500' : 'bg-green-500'} color={s.overdue_count > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* Alert bar */}
      {(s.open_anomalies > 0 || s.material_shortage_count > 0 || s.overdue_count > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} className="w-5 h-5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-red-800 mb-1.5">需要關注</div>
            <div className="flex flex-wrap gap-2">
              {s.open_anomalies > 0 && <span className="text-xs font-medium bg-white text-red-700 px-2.5 py-1 rounded-full border border-red-100">未處理異常 {s.open_anomalies} 件</span>}
              {s.material_shortage_count > 0 && <span className="text-xs font-medium bg-white text-red-700 px-2.5 py-1 rounded-full border border-red-100">缺料項目 {s.material_shortage_count} 種</span>}
              {s.overdue_count > 0 && <span className="text-xs font-medium bg-white text-red-700 px-2.5 py-1 rounded-full border border-red-100">逾期訂單 {s.overdue_count} 筆</span>}
            </div>
          </div>
        </div>
      )}

      {/* Yesterday output */}
      {report?.yesterday_output?.length > 0 && (
        <Section title="昨日生產完成">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2">產品</th><th className="pb-2">機台</th><th className="pb-2">操作員</th>
                <th className="pb-2 text-right">完成</th><th className="pb-2 text-right">不良</th><th className="pb-2 text-right">良率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report.yesterday_output.map((w, i) => {
                const total = (w.ok_qty || 0) + (w.defect_qty || 0);
                const yr = total > 0 ? Math.round(w.ok_qty / total * 100) : 100;
                return (
                  <tr key={i}>
                    <td className="py-2 font-medium">{w.product_name}</td>
                    <td className="py-2 text-slate-500">{w.machine_name}</td>
                    <td className="py-2 text-slate-500">{w.operator}</td>
                    <td className="py-2 text-right font-semibold">{w.ok_qty}</td>
                    <td className="py-2 text-right text-red-600">{w.defect_qty || 0}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${yr >= 95 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{yr}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* Today's work orders */}
      {report?.today_work_orders?.length > 0 && (
        <Section title="今日生產計畫" count={report.today_work_orders.length}>
          <div className="space-y-3">
            {report.today_work_orders.map((w, i) => {
              const pct = w.planned_qty > 0 ? Math.round(w.completed_qty / w.planned_qty * 100) : 0;
              const inProgress = w.status === 'in_progress';
              return (
                <div key={i} className={`rounded-xl border p-3.5 ${inProgress ? 'border-brand-200 bg-brand-50/40' : 'border-slate-100'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-400">{w.wo_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${inProgress ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                          {inProgress ? '生產中' : '待開始'}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800">{w.product_name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                        <span>{w.machine_name}</span><span className="text-slate-200">·</span>
                        <span>{w.customer_name}</span><span className="text-slate-200">·</span>
                        <span>交期 {formatDate(w.due_date)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-slate-800 tabular-nums">{w.completed_qty}<span className="text-sm text-slate-400">/{w.planned_qty}</span></div>
                      <div className="text-xs text-slate-400">{pct}%</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : inProgress ? 'bg-brand-500' : 'bg-slate-300'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Urgent due */}
      {report?.urgent_due?.length > 0 && (
        <Section title="近 3 天交期訂單" count={report.urgent_due.length} accent="amber">
          <div className="space-y-1.5">
            {report.urgent_due.map((o, i) => (
              <div key={i} className="flex justify-between items-center py-2 px-3 bg-amber-50/60 rounded-lg">
                <div>
                  <span className="font-mono text-xs text-slate-400 mr-2">{o.order_no}</span>
                  <span className="font-medium text-slate-700 text-sm">{o.customer_name}</span>
                </div>
                <span className="text-amber-600 font-semibold text-sm">{formatDate(o.due_date)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Overdue */}
      {report?.overdue?.length > 0 && (
        <Section title="逾期未出貨" count={report.overdue.length} accent="red">
          <div className="space-y-1.5">
            {report.overdue.map((o, i) => (
              <div key={i} className="flex justify-between items-center py-2 px-3 bg-red-50/60 rounded-lg">
                <div>
                  <span className="font-mono text-xs text-slate-400 mr-2">{o.order_no}</span>
                  <span className="font-medium text-slate-700 text-sm">{o.customer_name}</span>
                </div>
                <span className="text-red-600 font-semibold text-sm">{formatDate(o.due_date)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Open anomalies */}
      {report?.open_anomalies?.length > 0 && (
        <Section title="未處理異常" count={report.open_anomalies.length} accent="red">
          <div className="space-y-2">
            {report.open_anomalies.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                <span className={`text-xs w-7 h-7 flex items-center justify-center rounded-lg font-semibold shrink-0 ${SEVERITY_CLS[a.severity]}`}>
                  {a.severity === 'high' ? '高' : a.severity === 'medium' ? '中' : '低'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{a.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{ANOMALY_TYPES[a.type]} · {a.machine_name} · {a.reporter}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Material shortages */}
      {report?.material_shortages?.length > 0 && (
        <Section title="原料低於安全庫存">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-2">材料</th><th className="pb-2 text-right">現有</th>
                <th className="pb-2 text-right">安全庫存</th><th className="pb-2 text-right">缺口</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report.material_shortages.map((m, i) => (
                <tr key={i}>
                  <td className="py-2 font-medium">{m.name} <span className="text-xs text-slate-400">{m.code}</span></td>
                  <td className="py-2 text-right text-red-600 font-semibold">{m.stock_qty} {m.unit}</td>
                  <td className="py-2 text-right text-slate-500">{m.safety_stock}</td>
                  <td className="py-2 text-right font-bold text-red-700">{Math.round(m.shortage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* FG Stock */}
      {report?.fg_stock?.length > 0 && (
        <Section title="成品在庫" count={report.fg_stock.length}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {report.fg_stock.map((fg, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div className="text-xs text-slate-400 truncate">{fg.product_name}</div>
                <div className="text-xl font-bold text-slate-800 mt-0.5">{fg.total_qty.toLocaleString()}<span className="text-sm font-normal text-slate-400 ml-1">件</span></div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color = 'text-slate-800', accent = 'bg-slate-400' }) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="text-xs font-medium text-slate-400 mb-1.5">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}{unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}</div>
    </div>
  );
}

const SECTION_ACCENT = {
  slate: 'text-slate-800',
  amber: 'text-amber-700',
  red: 'text-red-700',
};

function Section({ title, children, count, accent = 'slate' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className={`font-bold ${SECTION_ACCENT[accent]}`}>{title}</h2>
        {count !== undefined && <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>}
      </div>
      {children}
    </div>
  );
}
