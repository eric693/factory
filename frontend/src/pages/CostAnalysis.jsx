import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getOrderCosts = (month) => api.get('/cost/orders', { params: { month } }).then(r => r.data);
const getProductCosts = (year) => api.get('/cost/products', { params: { year } }).then(r => r.data);
const getLaborEfficiency = (month) => api.get('/cost/labor-efficiency', { params: { month } }).then(r => r.data);

function fmt(n) { return Math.round(n || 0).toLocaleString(); }

export default function CostAnalysis() {
  const [tab, setTab] = useState('orders');
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [year, setYear] = useState(dayjs().format('YYYY'));

  const { data: orderData, isLoading: loadingOrders } = useQuery({
    queryKey: ['cost-orders', month],
    queryFn: () => getOrderCosts(month),
    enabled: tab === 'orders',
  });

  const { data: productData, isLoading: loadingProducts } = useQuery({
    queryKey: ['cost-products', year],
    queryFn: () => getProductCosts(year),
    enabled: tab === 'products',
  });

  const { data: laborData, isLoading: loadingLabor } = useQuery({
    queryKey: ['cost-labor', month],
    queryFn: () => getLaborEfficiency(month),
    enabled: tab === 'labor',
  });

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">成本分析</h1>
        <p className="text-sm text-slate-500 mt-1">原料、人工成本拆解，標準 vs 實際工時效率</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[['orders', '訂單成本'], ['products', '產品成本'], ['labor', '人工效率']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === k ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {(tab === 'orders' || tab === 'labor') && (
        <div className="flex items-center gap-3">
          <label className="label whitespace-nowrap">月份</label>
          <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      )}
      {tab === 'products' && (
        <div className="flex items-center gap-3">
          <label className="label whitespace-nowrap">年份</label>
          <input type="number" className="input w-32" value={year} onChange={e => setYear(e.target.value)} min={2020} max={2030} />
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          {orderData?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['原料成本', orderData.totals.total_material],
                ['人工成本', orderData.totals.total_labor],
                ['標準人工', orderData.totals.total_std_labor],
                ['工時差異', orderData.totals.total_variance],
              ].map(([label, val]) => (
                <div key={label} className="card text-center">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-xl font-bold ${label === '工時差異' && val > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                    NT$ {fmt(val)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {loadingOrders ? (
            <div className="text-center py-12 text-slate-400">載入中...</div>
          ) : orderData?.orders?.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">本月無完工訂單</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2">訂單</th><th className="pb-2">客戶</th>
                    <th className="pb-2 text-right">原料成本</th><th className="pb-2 text-right">人工成本</th>
                    <th className="pb-2 text-right">標準工</th><th className="pb-2 text-right">差異</th>
                    <th className="pb-2 text-right">合計成本</th><th className="pb-2 text-right">良率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orderData?.orders?.map(o => (
                    <tr key={o.id}>
                      <td className="py-2 font-medium">{o.order_no}</td>
                      <td className="py-2 text-slate-600">{o.customer_name}</td>
                      <td className="py-2 text-right">{fmt(o.material_cost)}</td>
                      <td className="py-2 text-right">{fmt(o.labor_cost)}</td>
                      <td className="py-2 text-right text-slate-400">{fmt(o.std_labor_cost)}</td>
                      <td className={`py-2 text-right font-medium ${o.labor_variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {o.labor_variance > 0 ? '+' : ''}{fmt(o.labor_variance)}
                      </td>
                      <td className="py-2 text-right font-bold">{fmt(o.total_cost)}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${o.yield_rate >= 95 ? 'bg-green-100 text-green-700' : o.yield_rate >= 85 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {o.yield_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-4">
          {loadingProducts ? (
            <div className="text-center py-12 text-slate-400">載入中...</div>
          ) : productData?.products?.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">本年無完工資料</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2">產品</th><th className="pb-2 text-right">完工數</th>
                    <th className="pb-2 text-right">原料/件</th><th className="pb-2 text-right">人工/件</th>
                    <th className="pb-2 text-right">成本/件</th><th className="pb-2 text-right">總成本</th>
                    <th className="pb-2 text-right">良率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {productData?.products?.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2">
                        <div className="font-medium">{p.product_name}</div>
                        <div className="text-xs text-slate-400">{p.product_code}</div>
                      </td>
                      <td className="py-2 text-right">{(p.total_qty || 0).toLocaleString()}</td>
                      <td className="py-2 text-right">{fmt(p.material_cost_unit)}</td>
                      <td className="py-2 text-right">{fmt(p.labor_cost_unit)}</td>
                      <td className="py-2 text-right font-semibold">{fmt(p.total_cost_unit)}</td>
                      <td className="py-2 text-right font-bold text-brand-700">{fmt(p.total_cost)}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.yield_rate >= 95 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.yield_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'labor' && (
        <div className="space-y-4">
          {laborData?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['標準工時', `${laborData.summary.total_std_hours} h`],
                ['實際工時', `${laborData.summary.total_actual_hours} h`],
                ['平均效率', `${laborData.summary.avg_efficiency}%`],
                ['工時成本差異', `NT$ ${fmt(laborData.summary.total_variance_cost)}`],
              ].map(([label, val]) => (
                <div key={label} className="card text-center">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className="text-xl font-bold text-slate-900">{val}</div>
                </div>
              ))}
            </div>
          )}
          {loadingLabor ? (
            <div className="text-center py-12 text-slate-400">載入中...</div>
          ) : laborData?.items?.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">本月無完工工單</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2">工單</th><th className="pb-2">產品</th><th className="pb-2">操作員</th>
                    <th className="pb-2 text-right">標準工時</th><th className="pb-2 text-right">實際工時</th>
                    <th className="pb-2 text-right">效率</th><th className="pb-2 text-right">差異成本</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {laborData?.items?.map(w => (
                    <tr key={w.id}>
                      <td className="py-2 font-medium">{w.wo_no}</td>
                      <td className="py-2 text-slate-600 max-w-[120px] truncate">{w.product_name}</td>
                      <td className="py-2 text-slate-500">{w.operator || '-'}</td>
                      <td className="py-2 text-right">{w.std_hours}h</td>
                      <td className="py-2 text-right">{w.actual_hours}h</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${w.efficiency_pct >= 100 ? 'bg-green-100 text-green-700' : w.efficiency_pct >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {w.efficiency_pct}%
                        </span>
                      </td>
                      <td className={`py-2 text-right font-medium ${w.variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {w.variance > 0 ? '+' : ''}{fmt(w.variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
