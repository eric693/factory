import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { formatDate, formatDateTime } from '../utils';

const api = axios.create({ baseURL: '/api' });
const getFG = (status) => api.get('/finished-goods', { params: { status } }).then(r => r.data);
const getSummary = () => api.get('/finished-goods/summary').then(r => r.data);
const getLogs = (id) => api.get(`/finished-goods/${id}/logs`).then(r => r.data);
const createFG = (data) => api.post('/finished-goods', data).then(r => r.data);
const shipFG = (id, data) => api.patch(`/finished-goods/${id}/ship`, data).then(r => r.data);
const updateLocation = (id, location) => api.patch(`/finished-goods/${id}/location`, { location }).then(r => r.data);

const STATUS_CLS = {
  in_stock: 'bg-green-100 text-green-700',
  shipped: 'bg-slate-100 text-slate-500',
  reserved: 'bg-blue-100 text-blue-700',
};

export default function FinishedGoods() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('in_stock');
  const [showCreate, setShowCreate] = useState(false);
  const [shipModal, setShipModal] = useState(null);
  const [logsModal, setLogsModal] = useState(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['fg', status],
    queryFn: () => getFG(status),
  });

  const { data: summary = [] } = useQuery({
    queryKey: ['fg-summary'],
    queryFn: getSummary,
  });

  const createMutation = useMutation({
    mutationFn: createFG,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fg'] }); qc.invalidateQueries({ queryKey: ['fg-summary'] }); setShowCreate(false); },
  });

  const shipMutation = useMutation({
    mutationFn: ({ id, data }) => shipFG(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fg'] }); qc.invalidateQueries({ queryKey: ['fg-summary'] }); setShipModal(null); },
  });

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">成品庫存</h1>
          <p className="text-sm text-slate-500 mt-1">完工品入庫、出庫管理</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>入庫</button>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <div className="card">
          <div className="text-sm font-semibold text-slate-700 mb-3">庫存概況</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2">產品</th><th className="pb-2">料號</th>
                  <th className="pb-2 text-right">在庫數量</th><th className="pb-2 text-right">批次數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summary.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium">{s.product_name}</td>
                    <td className="py-2 text-slate-500">{s.product_code}</td>
                    <td className="py-2 text-right font-bold text-green-700">{s.total_qty.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-500">{s.lot_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {[['in_stock', '在庫'], ['shipped', '已出庫'], ['all', '全部']].map(([s, l]) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${status === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : data.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">暫無記錄</div>
      ) : (
        <div className="space-y-3">
          {data.map(fg => (
            <div key={fg.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[fg.status]}`}>
                      {{ in_stock: '在庫', shipped: '已出庫', reserved: '預留' }[fg.status]}
                    </span>
                    {fg.product_code && <span className="text-xs text-slate-500">{fg.product_code}</span>}
                  </div>
                  <div className="font-semibold text-slate-900">{fg.product_name}</div>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span className="font-bold text-2xl text-slate-900">{fg.qty.toLocaleString()}</span>
                    {fg.location && <span className="text-slate-500 self-end pb-1">位置：{fg.location}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex gap-3 flex-wrap">
                    {fg.order_no && <span>訂單：{fg.order_no}</span>}
                    {fg.order_customer && <span>客戶：{fg.order_customer}</span>}
                    <span>入庫：{formatDate(fg.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {fg.status === 'in_stock' && (
                    <button className="btn-primary text-sm" onClick={() => setShipModal(fg)}>出庫</button>
                  )}
                  <button className="btn-ghost text-sm" onClick={() => setLogsModal(fg)}>記錄</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSubmit={createMutation.mutate} loading={createMutation.isPending} />}
      {shipModal && (
        <ShipModal
          fg={shipModal}
          onClose={() => setShipModal(null)}
          onSubmit={(data) => shipMutation.mutate({ id: shipModal.id, data })}
          loading={shipMutation.isPending}
        />
      )}
      {logsModal && <LogsModal fg={logsModal} onClose={() => setLogsModal(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ product_name: '', product_code: '', qty: 0, location: '', operator: '' });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100"><h3 className="text-lg font-bold">成品入庫</h3></div>
        <div className="p-5 space-y-4">
          <div><label className="label">產品名稱</label><input className="input" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} /></div>
          <div><label className="label">料號</label><input className="input" value={form.product_code} onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))} /></div>
          <div><label className="label">入庫數量</label><input type="number" className="input" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: +e.target.value }))} /></div>
          <div><label className="label">庫位</label><input className="input" placeholder="如：A-01-02" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          <div><label className="label">操作人員</label><input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} /></div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(form)} disabled={!form.product_name || !form.qty || loading}>
            {loading ? '入庫中...' : '確認入庫'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShipModal({ fg, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ qty: fg.qty, note: '', operator: '' });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold">成品出庫</h3>
          <p className="text-sm text-slate-500 mt-1">{fg.product_name}（在庫 {fg.qty} 件）</p>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="label">出庫數量</label><input type="number" className="input" min={1} max={fg.qty} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: +e.target.value }))} /></div>
          <div><label className="label">備註</label><input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
          <div><label className="label">操作人員</label><input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} /></div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(form)} disabled={loading}>{loading ? '出庫中...' : '確認出庫'}</button>
        </div>
      </div>
    </div>
  );
}

function LogsModal({ fg, onClose }) {
  const { data: logs = [] } = useQuery({
    queryKey: ['fg-logs', fg.id],
    queryFn: () => getLogs(fg.id),
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold">異動記錄</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center text-slate-400 py-6">無記錄</div>
          ) : logs.map(log => (
            <div key={log.id} className="flex items-center gap-3 text-sm">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${log.action === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {log.action === 'in' ? '入' : '出'}
              </span>
              <div className="flex-1">
                <div className="font-medium">{log.note} {log.qty > 0 ? `+${log.qty}` : log.qty} 件</div>
                <div className="text-slate-400 text-xs">{log.operator} | {formatDateTime(log.logged_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
