import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { getWorkOrders, getWorkOrder, updateWorkOrder, addProgress } from '../api';
import { STATUS_WO, formatDate, progressPct } from '../utils';
import dayjs from 'dayjs';

function PrintCard({ wo, onClose }) {
  const cardRef = useRef(null);
  const pct = progressPct(wo.completed_qty, wo.planned_qty);
  const qrUrl = `${window.location.origin}/scan/${wo.id}`;

  const handlePrint = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${wo.wo_no}-工作卡.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-semibold text-slate-800">工作卡預覽</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary text-sm px-4 py-1.5">下載 PDF</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        {/* Printable card */}
        <div ref={cardRef} className="p-6 bg-white" style={{ fontFamily: 'system-ui, sans-serif' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>工作卡 / Work Order</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>{wo.wo_no}</div>
            </div>
            <div className="p-1 border border-slate-200 rounded-lg bg-white">
              <QRCodeSVG value={qrUrl} size={72} />
            </div>
          </div>
          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#334155', marginBottom: 4 }}>{wo.product_name}</div>
            {wo.product_code && <div style={{ fontSize: 11, color: '#94a3b8' }}>{wo.product_code}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: '計畫數量', value: `${wo.planned_qty} 件` },
              { label: '機台', value: wo.machine_name || '-' },
              { label: '計畫開始', value: formatDate(wo.planned_start) },
              { label: '計畫完成', value: formatDate(wo.planned_end) },
              { label: '操作員', value: wo.operator || '___________' },
              { label: '訂單', value: wo.order_no || '-' },
            ].map(item => (
              <div key={item.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.value}</div>
              </div>
            ))}
          </div>
          {/* 簽核欄 */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['開工確認', '品檢簽核', '完工確認'].map(label => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                <div style={{ height: 28, borderBottom: '1px solid #cbd5e1' }} />
                <div style={{ fontSize: 8, color: '#cbd5e1', marginTop: 2 }}>簽名 / 日期</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 9, color: '#cbd5e1' }}>FactoryOS · {dayjs().format('YYYY-MM-DD HH:mm')}</div>
        </div>
      </div>
    </div>
  );
}

function ProgressModal({ wo, onClose }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState('');
  const [defect, setDefect] = useState('');
  const [operator, setOperator] = useState(wo.operator || '');
  const [note, setNote] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  const { data: detail } = useQuery({ queryKey: ['wo', wo.id], queryFn: () => getWorkOrder(wo.id) });
  const pct = progressPct(wo.completed_qty, wo.planned_qty);
  const yieldRate = (wo.completed_qty || 0) + (wo.defect_qty || 0) > 0
    ? Math.round((wo.completed_qty / ((wo.completed_qty || 0) + (wo.defect_qty || 0))) * 100)
    : null;

  const startMut = useMutation({
    mutationFn: () => updateWorkOrder(wo.id, { status: 'in_progress', operator }),
    onSuccess: () => { qc.invalidateQueries(['work-orders']); qc.invalidateQueries(['wo', wo.id]); },
  });

  const progMut = useMutation({
    mutationFn: () => addProgress(wo.id, { qty: +qty, defect_qty: +defect || 0, operator, note }),
    onSuccess: () => {
      qc.invalidateQueries(['work-orders']);
      qc.invalidateQueries(['dashboard']);
      qc.invalidateQueries(['wo', wo.id]);
      setQty(''); setDefect(''); setNote('');
    },
  });

  const qrUrl = `${window.location.origin}/scan/${wo.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">{wo.wo_no}</div>
            <div className="text-sm text-slate-500">{wo.product_name}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPrint(true)} className="btn-secondary text-xs px-2 py-1.5" title="列印工作卡">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              列印
            </button>
            <button onClick={() => setShowQR(true)} className="btn-secondary text-xs px-2 py-1.5" title="顯示 QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <line x1="14" y1="14" x2="14" y2="14.01"/><line x1="18" y1="14" x2="18" y2="14.01"/>
                <line x1="21" y1="17" x2="21" y2="17.01"/><line x1="14" y1="21" x2="14" y2="21.01"/>
                <line x1="21" y1="21" x2="21" y2="21.01"/>
              </svg>
              QR
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Print Modal */}
        {showPrint && <PrintCard wo={wo} onClose={() => setShowPrint(false)} />}

        {/* QR Modal */}
        {showQR && (
          <div className="absolute inset-0 z-10 bg-white rounded-t-2xl md:rounded-2xl flex flex-col items-center justify-center p-6" onClick={() => setShowQR(false)}>
            <div className="text-lg font-bold text-slate-800 mb-1">{wo.wo_no}</div>
            <div className="text-sm text-slate-500 mb-6">{wo.product_name}</div>
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <div className="mt-4 text-xs text-slate-400 text-center">師傅掃描此 QR Code 即可用手機報工</div>
            <div className="mt-2 text-xs text-slate-300 break-all text-center max-w-xs">{qrUrl}</div>
            <button className="btn-secondary mt-6 text-sm" onClick={() => setShowQR(false)}>關閉</button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 進度 */}
          <div className="card p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-600">完工進度</span>
              <div className="flex items-center gap-3">
                {yieldRate !== null && (
                  <span className={`text-sm font-semibold ${yieldRate >= 95 ? 'text-green-600' : yieldRate >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                    良率 {yieldRate}%
                  </span>
                )}
                <span className="text-2xl font-bold text-brand-600">{pct}%</span>
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-slate-400 flex justify-between">
              <span>完成 {wo.completed_qty} {wo.defect_qty > 0 ? `（不良 ${wo.defect_qty}）` : ''} / 計畫 {wo.planned_qty}</span>
              <span>{wo.machine_name}</span>
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">計畫開始</div>
              <div className="font-medium">{formatDate(wo.planned_start)}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">計畫結束</div>
              <div className="font-medium">{formatDate(wo.planned_end)}</div>
            </div>
          </div>

          {/* Start button */}
          {['scheduled', 'pending'].includes(wo.status) && (
            <button className="btn-primary w-full py-3" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              開始生產
            </button>
          )}

          {/* Progress input */}
          {wo.status === 'in_progress' && (
            <div className="space-y-3">
              <div>
                <label className="label">操作員</label>
                <input className="input" value={operator} onChange={e => setOperator(e.target.value)} placeholder="姓名" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">完成數量</label>
                  <input type="number" min={1} className="input text-2xl font-bold text-center py-4" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="label">不良品數量</label>
                  <input type="number" min={0} className="input text-2xl font-bold text-center py-4 text-red-500" value={defect} onChange={e => setDefect(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="label">備註</label>
                <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="選填" />
              </div>
              <button className="btn-primary w-full py-3" disabled={!qty || +qty <= 0 || progMut.isPending} onClick={() => progMut.mutate()}>
                {progMut.isPending ? '送出中...' : '回報進度'}
              </button>
            </div>
          )}

          {/* Logs */}
          {detail?.logs?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">回報記錄</div>
              <div className="space-y-2">
                {detail.logs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {(log.operator || '?').slice(0, 1)}
                    </div>
                    <div className="flex-1 text-sm text-slate-600">{log.operator}</div>
                    <div className="text-sm font-bold text-green-600">+{log.qty}</div>
                    {log.defect_qty > 0 && <div className="text-sm text-red-500">-{log.defect_qty}</div>}
                    <div className="text-xs text-slate-400">{dayjs(log.logged_at).format('MM/DD HH:mm')}</div>
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

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待開工' },
  { key: 'scheduled', label: '已排程' },
  { key: 'in_progress', label: '生產中' },
  { key: 'completed', label: '完工' },
];

export default function WorkOrders() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: wos = [], isLoading } = useQuery({
    queryKey: ['work-orders', tab, search],
    queryFn: () => getWorkOrders({ status: tab !== 'all' ? tab : undefined, search: search || undefined }),
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold text-slate-800">工單管理</h1>

      <input className="input" placeholder="搜尋工單編號、產品、機台..." value={search} onChange={e => setSearch(e.target.value)} />

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : wos.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無工單</div>
      ) : (
        <div className="space-y-2">
          {wos.map(wo => {
            const st = STATUS_WO[wo.status] || STATUS_WO.pending;
            const pct = progressPct(wo.completed_qty, wo.planned_qty);
            const isActive = wo.status === 'in_progress';
            const totalForYield = (wo.completed_qty || 0) + (wo.defect_qty || 0);
            const yieldRate = totalForYield > 0 ? Math.round((wo.completed_qty / totalForYield) * 100) : null;

            return (
              <div key={wo.id} className={`card p-4 cursor-pointer hover:shadow-md transition-shadow ${isActive ? 'ring-1 ring-indigo-300' : ''}`} onClick={() => setSelected(wo)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-400">{wo.wo_no}</span>
                      <span className={`badge ${st.color}`}>{st.label}</span>
                      {yieldRate !== null && yieldRate < 95 && (
                        <span className={`badge ${yieldRate >= 85 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>良率 {yieldRate}%</span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800 truncate">{wo.product_name}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{wo.machine_name}</span>
                      {wo.operator && <span>· {wo.operator}</span>}
                      <span>· {formatDate(wo.planned_start)} - {formatDate(wo.planned_end)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-700">{wo.completed_qty}/{wo.planned_qty}</div>
                    {wo.defect_qty > 0 && <div className="text-xs text-red-500">不良 {wo.defect_qty}</div>}
                    <div className="text-xs text-slate-400">{pct}%</div>
                  </div>
                </div>
                {pct > 0 && (
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && <ProgressModal wo={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
