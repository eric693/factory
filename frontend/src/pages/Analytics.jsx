import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import dayjs from 'dayjs';
import axios from 'axios';

const BASE = '/api';

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const PIE_COLORS = ['#0e7de8','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'];

function Section({ title, children, action }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, unit, sub, color }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color || 'text-slate-800'}`}>{value}<span className="text-lg ml-1">{unit}</span></div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const year = dayjs().format('YYYY');
  const [opMonth, setOpMonth] = useState(dayjs().format('YYYY-MM'));

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary', year],
    queryFn: () => axios.get(`${BASE}/analytics/summary?year=${year}`).then(r => r.data),
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['analytics-operators', opMonth],
    queryFn: () => axios.get(`${BASE}/analytics/operators?month=${opMonth}`).then(r => r.data),
  });

  // 補齊12個月的資料（無資料月份顯示0）
  const monthlyData = MONTHS.map((m, i) => {
    const found = summary?.monthlyOutput?.find(x => x.month === m);
    return {
      name: MONTH_NAMES[i],
      完成數: found?.ok_qty || 0,
      不良數: found?.defect_qty || 0,
      工單數: found?.wo_count || 0,
    };
  });

  const yieldData = MONTHS.map((m, i) => {
    const found = summary?.yieldTrend?.find(x => x.month === m);
    return { name: MONTH_NAMES[i], 良率: found?.yield_pct || null };
  }).filter(d => d.良率 !== null);

  const totalOk = summary?.monthlyOutput?.reduce((s, x) => s + (x.ok_qty || 0), 0) || 0;
  const totalDefect = summary?.monthlyOutput?.reduce((s, x) => s + (x.defect_qty || 0), 0) || 0;
  const avgYield = totalOk + totalDefect > 0 ? Math.round(totalOk / (totalOk + totalDefect) * 100) : 100;

  const exportOrders = () => window.open(`${BASE}/analytics/export/orders?year=${year}`);
  const exportWOs = () => window.open(`${BASE}/analytics/export/work-orders?year=${year}`);

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">分析報表</h1>
          <div className="text-sm text-slate-400">{year} 年度</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={exportOrders}>匯出訂單 CSV</button>
          <button className="btn-secondary text-sm" onClick={exportWOs}>匯出工單 CSV</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="年度總產量" value={totalOk.toLocaleString()} unit="件" />
        <KpiCard label="年度不良品" value={totalDefect.toLocaleString()} unit="件" color={totalDefect > 0 ? 'text-red-600' : 'text-green-600'} />
        <KpiCard label="年度平均良率" value={avgYield} unit="%" color={avgYield >= 95 ? 'text-green-600' : avgYield >= 85 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="客戶數" value={summary?.customerStats?.length || 0} unit="家" sub="本年度有訂單" />
      </div>

      {/* 月產量柱狀圖 */}
      <Section title={`${year} 月產量趨勢`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="完成數" fill="#0e7de8" radius={[3, 3, 0, 0]} />
            <Bar dataKey="不良數" fill="#fca5a5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid md:grid-cols-2 gap-5">
        {/* 良率趨勢 */}
        <Section title="月良率趨勢">
          {yieldData.length === 0
            ? <div className="py-10 text-center text-slate-400 text-sm">尚無完工資料</div>
            : <ResponsiveContainer width="100%" height={180}>
                <LineChart data={yieldData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={v => `${v}%`} />
                  <Line type="monotone" dataKey="良率" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
          }
        </Section>

        {/* 客戶別訂單 */}
        <Section title="客戶別訂單量">
          {!summary?.customerStats?.length
            ? <div className="py-10 text-center text-slate-400 text-sm">尚無資料</div>
            : <div className="space-y-2">
                {summary.customerStats.slice(0, 6).map((c, i) => (
                  <div key={c.customer_name} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="font-medium text-slate-700 truncate">{c.customer_name}</span>
                        <span className="text-slate-500 shrink-0 ml-2">{c.order_count} 張</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(c.order_count / (summary.customerStats[0]?.order_count || 1) * 100)}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </Section>
      </div>

      {/* 產品別生產量 */}
      <Section title="產品別完工量（前10）">
        {!summary?.productStats?.length
          ? <div className="py-10 text-center text-slate-400 text-sm">尚無完工資料</div>
          : <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-xs text-slate-400 font-semibold">產品</th>
                    <th className="text-right py-2 text-xs text-slate-400 font-semibold">完成量</th>
                    <th className="text-right py-2 text-xs text-slate-400 font-semibold">不良</th>
                    <th className="text-right py-2 text-xs text-slate-400 font-semibold">良率</th>
                    <th className="text-right py-2 text-xs text-slate-400 font-semibold">工單數</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.productStats.map(p => {
                    const total = (p.total_qty || 0) + (p.defect_qty || 0);
                    const yr = total > 0 ? Math.round(p.total_qty / total * 100) : 100;
                    return (
                      <tr key={p.product_code} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5">
                          <div className="font-medium text-slate-700">{p.product_name}</div>
                          <div className="text-xs text-slate-400">{p.product_code}</div>
                        </td>
                        <td className="text-right font-bold text-slate-700">{(p.total_qty || 0).toLocaleString()}</td>
                        <td className="text-right text-red-500">{(p.defect_qty || 0).toLocaleString()}</td>
                        <td className="text-right">
                          <span className={`font-bold ${yr >= 95 ? 'text-green-600' : yr >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{yr}%</span>
                        </td>
                        <td className="text-right text-slate-500">{p.wo_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </Section>

      {/* 操作員績效 */}
      <Section
        title="操作員績效"
        action={
          <input type="month" className="input w-auto text-sm py-1" value={opMonth}
            onChange={e => setOpMonth(e.target.value)} />
        }
      >
        {operators.length === 0
          ? <div className="py-10 text-center text-slate-400 text-sm">該月份無回報記錄</div>
          : <div className="space-y-3">
              {operators.map(op => (
                <div key={op.operator} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
                        {op.operator.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700">{op.operator}</div>
                        <div className="text-xs text-slate-400">{op.wo_count} 張工單 · {op.log_count} 次回報</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-slate-800">{(op.total_ok || 0).toLocaleString()}</div>
                      <div className="text-xs text-slate-400">件完成</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-lg p-2">
                      <div className={`font-bold ${op.yield_rate >= 95 ? 'text-green-600' : op.yield_rate >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{op.yield_rate}%</div>
                      <div className="text-xs text-slate-400">良率</div>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <div className="font-bold text-red-500">{op.total_defect || 0}</div>
                      <div className="text-xs text-slate-400">不良品</div>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <div className="font-bold text-brand-600">{op.avg_per_log}</div>
                      <div className="text-xs text-slate-400">件/次</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
        }
      </Section>
    </div>
  );
}
