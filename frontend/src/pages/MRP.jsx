import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BASE = '/api';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function StockAdjustModal({ material, onClose }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: () => axios.patch(`${BASE}/materials/${material.id}/stock`, { delta: +delta, reason }),
    onSuccess: () => { qc.invalidateQueries(['materials']); qc.invalidateQueries(['mrp']); onClose(); },
  });

  return (
    <Modal title={`調整庫存 - ${material.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="card p-3 bg-slate-50">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">目前庫存</span>
            <span className="font-bold text-slate-800">{material.stock_qty} {material.unit}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-slate-500">安全庫存</span>
            <span className={material.stock_qty < material.safety_stock ? 'font-bold text-red-600' : 'text-slate-600'}>{material.safety_stock} {material.unit}</span>
          </div>
        </div>
        <div>
          <label className="label">調整數量（正數=入庫，負數=出庫）</label>
          <input type="number" className="input text-xl font-bold text-center py-4" value={delta} onChange={e => setDelta(e.target.value)} placeholder="例：+100 或 -50" />
        </div>
        <div>
          <label className="label">原因</label>
          <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="進料、領料..." />
        </div>
        {delta && (
          <div className="card p-3 bg-blue-50 border-blue-200">
            <div className="text-sm text-blue-700">調整後庫存：<strong>{(material.stock_qty + +delta).toFixed(2)} {material.unit}</strong></div>
          </div>
        )}
        <button className="btn-primary w-full py-3" disabled={!delta || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? '更新中...' : '確認調整'}
        </button>
      </div>
    </Modal>
  );
}

function AddMaterialModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', unit: '個', stock_qty: 0, safety_stock: 0, unit_cost: 0 });

  const mut = useMutation({
    mutationFn: () => axios.post(`${BASE}/materials`, form),
    onSuccess: () => { qc.invalidateQueries(['materials']); onClose(); },
  });

  return (
    <Modal title="新增物料" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">料號</label>
            <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="M001" />
          </div>
          <div>
            <label className="label">單位</label>
            <input className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">名稱</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="鋁合金板材" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">現有庫存</label>
            <input type="number" className="input" value={form.stock_qty} onChange={e => setForm(f => ({ ...f, stock_qty: +e.target.value }))} />
          </div>
          <div>
            <label className="label">安全庫存</label>
            <input type="number" className="input" value={form.safety_stock} onChange={e => setForm(f => ({ ...f, safety_stock: +e.target.value }))} />
          </div>
          <div>
            <label className="label">單價</label>
            <input type="number" className="input" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: +e.target.value }))} />
          </div>
        </div>
        <button className="btn-primary w-full py-3" disabled={!form.code || !form.name || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? '新增中...' : '新增物料'}
        </button>
      </div>
    </Modal>
  );
}

const STATUS_MRP = {
  shortage: { label: '缺料', color: 'bg-red-100 text-red-700' },
  low: { label: '低庫存', color: 'bg-amber-100 text-amber-700' },
  ok: { label: '充足', color: 'bg-green-100 text-green-700' },
};

const TABS = [
  { key: 'mrp', label: 'MRP 缺口分析' },
  { key: 'materials', label: '物料庫存' },
];

export default function MRP() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('mrp');
  const [adjusting, setAdjusting] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const createPOMut = useMutation({
    mutationFn: (shortages) => axios.post('/api/purchase/from-mrp', { shortages, expected_date: new Date(Date.now() + 7*86400000).toISOString().slice(0,10) }).then(r => r.data),
    onSuccess: (data) => { alert(`採購單 ${data.po_no} 已建立`); navigate('/purchase'); },
  });

  const { data: mrpData = [], isLoading: mrpLoading } = useQuery({
    queryKey: ['mrp'],
    queryFn: () => axios.get(`${BASE}/mrp/calculate`).then(r => r.data),
  });

  const { data: materials = [], isLoading: matLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => axios.get(`${BASE}/materials`).then(r => r.data),
  });

  const shortages = mrpData.filter(x => x.status === 'shortage');
  const lows = mrpData.filter(x => x.status === 'low');

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">物料需求 MRP</h1>
          <div className="text-xs text-slate-400 mt-0.5">依待生產訂單計算物料缺口</div>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>新增物料</button>
      </div>

      {/* 缺料警示 */}
      {shortages.length > 0 && (
        <div className="card p-4 bg-red-50 border-red-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-red-700 mb-1">缺料警示：{shortages.length} 項物料不足</div>
              <div className="text-sm text-red-600">{shortages.map(s => s.material_name).join('、')}</div>
            </div>
            <button
              onClick={() => createPOMut.mutate(shortages)}
              disabled={createPOMut.isPending}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {createPOMut.isPending ? '建立中...' : '一鍵建立採購單'}
            </button>
          </div>
        </div>
      )}
      {lows.length > 0 && shortages.length === 0 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <div className="font-semibold text-amber-700">{lows.length} 項物料低於安全庫存，請注意補料</div>
        </div>
      )}
      {mrpData.length > 0 && shortages.length === 0 && lows.length === 0 && (
        <div className="card p-4 bg-green-50 border-green-200">
          <div className="font-semibold text-green-700">所有物料庫存充足</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mrp' && (
        mrpLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
        : mrpData.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-slate-400 text-sm mb-2">無待生產訂單，或尚未設定 BOM</div>
            <div className="text-xs text-slate-300">請在「物料庫存」頁籤新增物料並設定 BOM</div>
          </div>
        ) : (
          <div className="space-y-2">
            {mrpData.map((item, i) => {
              const st = STATUS_MRP[item.status];
              const pct = item.required_qty > 0 ? Math.min(100, Math.round((item.stock_qty / item.required_qty) * 100)) : 100;
              return (
                <div key={i} className={`card p-4 ${item.status === 'shortage' ? 'ring-1 ring-red-300' : ''}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-800">{item.material_name}</span>
                        <span className={`badge ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-slate-400">{item.material_code} · 用於 {item.product_name}</div>
                    </div>
                    {item.status === 'shortage' && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-red-600">缺 {item.shortage}</div>
                        <div className="text-xs text-red-400">{item.unit}</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
                    <div className="bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-slate-700">{item.required_qty}</div>
                      <div className="text-xs text-slate-400">需求 ({item.unit})</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <div className={`font-bold ${item.stock_qty < item.required_qty ? 'text-red-600' : 'text-green-600'}`}>{item.stock_qty}</div>
                      <div className="text-xs text-slate-400">庫存 ({item.unit})</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-amber-600">{item.safety_stock}</div>
                      <div className="text-xs text-slate-400">安全庫存</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.status === 'shortage' ? 'bg-red-500' : item.status === 'low' ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'materials' && (
        matLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
        : materials.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">尚無物料，請點擊「新增物料」</div>
        ) : (
          <div className="space-y-2">
            {materials.map(m => {
              const isLow = m.stock_qty < m.safety_stock;
              return (
                <div key={m.id} className={`card p-4 ${isLow ? 'ring-1 ring-amber-300' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{m.name}</span>
                        {isLow && <span className="badge bg-amber-100 text-amber-700">低庫存</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{m.code} · 安全庫存 {m.safety_stock} {m.unit}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>{m.stock_qty}</div>
                        <div className="text-xs text-slate-400">{m.unit}</div>
                      </div>
                      <button className="btn-secondary text-xs" onClick={() => setAdjusting(m)}>調整</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {adjusting && <StockAdjustModal material={adjusting} onClose={() => setAdjusting(null)} />}
      {showAdd && <AddMaterialModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
