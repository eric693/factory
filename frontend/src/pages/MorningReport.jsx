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

  if (isLoading) return <div className="text-center py-12 text-slate-400">載入中...</div>;

  const s = report?.stats || {};

  return (
    <div className="space-y-6 pb-20 md:pb-0 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">每日晨報</h1>
          <p className="text-sm text-slate-500 mt-1">生成於 {report?.generated_at}</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" className="input w-auto" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn-ghost" onClick={() => window.print()}>列印</button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="昨日完工" value={s.yesterday_ok} unit="件" />
        <StatCard label="昨日良率" value={`${s.yesterday_yield}%`} color={s.yesterday_yield >= 95 ? 'text-green-600' : 'text-amber-600'} />
        <StatCard label="今日在線工單" value={(s.today_scheduled || 0) + (s.today_in_progress || 0)} unit="筆" />
        <StatCard label="逾期訂單" value={s.overdue_count} unit="筆" color={s.overdue_count > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* Alert bar */}
      {(s.open_anomalies > 0 || s.material_shortage_count > 0 || s.overdue_count > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="text-sm font-bold text-red-800 mb-2">需要關注</div>
          <div className="flex flex-wrap gap-3 text-sm text-red-700">
            {s.open_anomalies > 0 && <span>未處理異常 {s.open_anomalies} 件</span>}
            {s.material_shortage_count > 0 && <span>缺料項目 {s.material_shortage_count} 種</span>}
            {s.overdue_count > 0 && <span>逾期訂單 {s.overdue_count} 筆</span>}
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
        <Section title="今日生產計畫">
          <div className="space-y-2">
            {report.today_work_orders.map((w, i) => {
              const pct = w.planned_qty > 0 ? Math.round(w.completed_qty / w.planned_qty * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">{w.wo_no}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${w.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {w.status === 'in_progress' ? '生產中' : '待開始'}
                      </span>
                    </div>
                    <div className="font-medium text-sm">{w.product_name}</div>
                    <div className="text-xs text-slate-400">{w.machine_name} | {w.customer_name} | 交期 {formatDate(w.due_date)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">{w.completed_qty}/{w.planned_qty}</div>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full mt-1">
                      <div className="h-1.5 bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Urgent due */}
      {report?.urgent_due?.length > 0 && (
        <Section title="近 3 天交期訂單" headerClass="text-amber-700">
          <div className="space-y-2">
            {report.urgent_due.map((o, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1">
                <span className="font-medium">{o.order_no} - {o.customer_name}</span>
                <span className="text-amber-600 font-semibold">{formatDate(o.due_date)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Overdue */}
      {report?.overdue?.length > 0 && (
        <Section title="逾期未出貨" headerClass="text-red-700">
          <div className="space-y-2">
            {report.overdue.map((o, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1">
                <span className="font-medium">{o.order_no} - {o.customer_name}</span>
                <span className="text-red-600 font-semibold">{formatDate(o.due_date)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Open anomalies */}
      {report?.open_anomalies?.length > 0 && (
        <Section title="未處理異常" headerClass="text-red-700">
          <div className="space-y-2">
            {report.open_anomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${SEVERITY_CLS[a.severity]}`}>
                  {a.severity === 'high' ? '高' : a.severity === 'medium' ? '中' : '低'}
                </span>
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-slate-400">{ANOMALY_TYPES[a.type]} | {a.machine_name} | {a.reporter}</div>
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
        <Section title="成品在庫">
          <div className="flex flex-wrap gap-3">
            {report.fg_stock.map((fg, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-xs text-slate-500">{fg.product_name}</div>
                <div className="text-xl font-bold text-slate-900">{fg.total_qty.toLocaleString()} 件</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color = 'text-slate-900' }) {
  return (
    <div className="card text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}{unit && <span className="text-sm font-normal text-slate-500 ml-1">{unit}</span>}</div>
    </div>
  );
}

function Section({ title, children, headerClass = 'text-slate-900' }) {
  return (
    <div className="card">
      <div className={`text-sm font-bold mb-3 ${headerClass}`}>{title}</div>
      {children}
    </div>
  );
}
