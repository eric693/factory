import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProjects, createProject, getProjectDetail,
  addReceipt, addCost, returnCost, deleteCost, deleteProject,
} from '../api/laborPayroll';
import { exportExcel, exportHTMLToPDF } from '../utils/exportUtils';

const COST_TYPE_STYLE = {
  labor: { label: '人工', color: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  material: { label: '材料', color: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  other: { label: '其他', color: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
};
const SOURCE_STYLE = {
  manual: { label: '手動新增', color: 'bg-slate-100 text-slate-600' },
  auto: { label: '打卡自動', color: 'bg-green-100 text-green-700' },
  return: { label: '退回沖銷', color: 'bg-red-100 text-red-600' },
};
const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

function DetailDrawer({ projectId, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('cost');
  const [showAddCost, setShowAddCost] = useState(false);
  const [showAddReceipt, setShowAddReceipt] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);
  const { data, isLoading } = useQuery({ queryKey: ['project-detail', projectId], queryFn: () => getProjectDetail(projectId) });

  const exportExcelFn = () => {
    if (!data) return;
    exportExcel(`專案財務_${data.project.name}`, [
      { name: '收款明細', columns: [
        { header: '收款日期', accessor: r => r.received_date },
        { header: '金額', accessor: r => r.amount },
        { header: '付款方式', accessor: r => r.method || '' },
        { header: '備註', accessor: r => r.note || '' },
      ], rows: data.receipts },
      { name: '成本明細', columns: [
        { header: '日期', accessor: r => r.cost_date },
        { header: '類型', accessor: r => ({ labor: '人工', material: '材料', other: '其他' }[r.cost_type] || r.cost_type) },
        { header: '科目', accessor: r => r.subject || '' },
        { header: '任務', accessor: r => r.task_name || '' },
        { header: '數量', accessor: r => r.qty },
        { header: '單價', accessor: r => r.unit_price },
        { header: '金額', accessor: r => r.amount },
        { header: '員工', accessor: r => r.worker_name || '' },
        { header: '來源', accessor: r => ({ manual: '手動', auto: '打卡自動', return: '退回沖銷' }[r.source] || r.source) },
        { header: '說明', accessor: r => r.description || '' },
      ], rows: data.costs },
    ]);
  };

  const exportPDFFn = async () => {
    if (!data) return;
    setExporting(true);
    const s = data.summary || {};
    const TYPE = { labor: '人工', material: '材料', other: '其他' };
    const SRC = { manual: '手動', auto: '打卡自動', return: '退回沖銷' };
    const html = `<div style="font-family:system-ui,'Microsoft JhengHei',sans-serif;padding:24px;color:#1e293b">
      <h2 style="margin:0 0 4px">${data.project.name}</h2>
      <div style="color:#94a3b8;font-size:13px;margin-bottom:16px">專案財務明細報表 · ${new Date().toLocaleDateString()}</div>
      <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap">
        <div><div style="font-size:11px;color:#94a3b8">合約金額</div><div style="font-size:20px;font-weight:700">$${(s.contract_amount||0).toLocaleString()}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">已收款 ${s.received_pct}%</div><div style="font-size:20px;font-weight:700;color:#2563eb">$${(s.received||0).toLocaleString()}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">總成本 ${s.cost_pct}%</div><div style="font-size:20px;font-weight:700;color:#ea580c">$${(s.total_cost||0).toLocaleString()}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">盈虧 毛利${s.margin_pct}%</div><div style="font-size:20px;font-weight:700;color:${(s.profit||0)>=0?'#16a34a':'#dc2626'}">$${(s.profit||0).toLocaleString()}</div></div>
      </div>
      <h3 style="font-size:14px;margin:16px 0 8px">收款明細</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#f1f5f9"><th style="padding:6px 8px;text-align:left">日期</th><th style="padding:6px 8px;text-align:left">付款方式</th><th style="padding:6px 8px;text-align:right">金額</th></tr>
        ${data.receipts.map(r => `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 8px">${r.received_date}</td><td style="padding:6px 8px">${r.method||'-'}</td><td style="padding:6px 8px;text-align:right">$${(r.amount||0).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:8px;color:#94a3b8">無</td></tr>'}
      </table>
      <h3 style="font-size:14px;margin:16px 0 8px">成本明細</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#f1f5f9"><th style="padding:6px 8px;text-align:left">日期</th><th style="padding:6px 8px;text-align:left">類型</th><th style="padding:6px 8px;text-align:left">科目</th><th style="padding:6px 8px;text-align:left">來源</th><th style="padding:6px 8px;text-align:right">金額</th></tr>
        ${data.costs.map(c => `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 8px">${c.cost_date}</td><td style="padding:6px 8px">${TYPE[c.cost_type]||c.cost_type}</td><td style="padding:6px 8px">${c.subject||c.description||'-'}</td><td style="padding:6px 8px">${SRC[c.source]||c.source}</td><td style="padding:6px 8px;text-align:right;color:${c.amount<0?'#dc2626':'#1e293b'}">$${(c.amount||0).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="5" style="padding:8px;color:#94a3b8">無</td></tr>'}
      </table>
    </div>`;
    try { await exportHTMLToPDF(html, `專案財務_${data.project.name}`); }
    finally { setExporting(false); }
  };

  const [costForm, setCostForm] = useState({ cost_type: 'material', subject: '', task_name: '', qty: '', unit_price: '', worker_name: '', description: '' });
  const [receiptForm, setReceiptForm] = useState({ amount: '', received_date: new Date().toISOString().slice(0, 10), method: '', note: '' });

  const addCostMut = useMutation({
    mutationFn: () => addCost(projectId, { ...costForm, qty: +costForm.qty || 0, unit_price: +costForm.unit_price || 0, amount: (+costForm.qty || 0) * (+costForm.unit_price || 0) }),
    onSuccess: () => { qc.invalidateQueries(['project-detail']); qc.invalidateQueries(['projects']); setShowAddCost(false); setCostForm({ cost_type: 'material', subject: '', task_name: '', qty: '', unit_price: '', worker_name: '', description: '' }); },
  });
  const addReceiptMut = useMutation({
    mutationFn: () => addReceipt(projectId, { ...receiptForm, amount: +receiptForm.amount }),
    onSuccess: () => { qc.invalidateQueries(['project-detail']); qc.invalidateQueries(['projects']); setShowAddReceipt(false); setReceiptForm({ amount: '', received_date: new Date().toISOString().slice(0, 10), method: '', note: '' }); },
  });
  const returnMut = useMutation({
    mutationFn: (costId) => returnCost(projectId, { original_cost_id: costId }),
    onSuccess: () => { qc.invalidateQueries(['project-detail']); qc.invalidateQueries(['projects']); },
  });
  const delCostMut = useMutation({ mutationFn: deleteCost, onSuccess: () => { qc.invalidateQueries(['project-detail']); qc.invalidateQueries(['projects']); } });

  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>;

  const { project, summary = {}, receipts = [], costs = [], cost_by_type = [] } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 text-lg">{project.name}</div>
            <div className="text-sm text-slate-500">專案財務明細</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcelFn} className="btn-secondary text-xs px-3 py-1.5">Excel</button>
            <button onClick={exportPDFFn} disabled={exporting} className="btn-secondary text-xs px-3 py-1.5">{exporting ? '產生中' : 'PDF'}</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* 財務摘要 */}
        <div className="grid grid-cols-4 gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
          {[
            { l: '合約金額', v: fmt(summary.contract_amount), sub: '1 份合約', c: 'text-slate-800' },
            { l: '已收款', v: fmt(summary.received), sub: `進度 ${summary.received_pct}%`, c: 'text-blue-600' },
            { l: '總成本', v: fmt(summary.total_cost), sub: `佔比 ${summary.cost_pct}%`, c: 'text-orange-600' },
            { l: '盈虧', v: fmt(summary.profit), sub: `毛利率 ${summary.margin_pct}%`, c: summary.profit >= 0 ? 'text-green-600' : 'text-red-600' },
          ].map(s => (
            <div key={s.l} className="text-center">
              <div className="text-xs text-slate-400">{s.l}</div>
              <div className={`text-base md:text-xl font-bold mt-0.5 ${s.c}`}>{s.v}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5 shrink-0">
          {[['cost', '成本明細'], ['receipt', '收款明細']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-3 px-3 text-sm font-semibold border-b-2 ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>{l}</button>
          ))}
          <button onClick={() => tab === 'cost' ? setShowAddCost(true) : setShowAddReceipt(true)} className="ml-auto self-center text-xs text-indigo-600 font-semibold">+ 新增{tab === 'cost' ? '成本' : '收款'}</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {tab === 'cost' && (
            <div className="space-y-3">
              {cost_by_type.map(t => {
                const style = COST_TYPE_STYLE[t.type] || COST_TYPE_STYLE.other;
                const isExpanded = expanded === t.type;
                return (
                  <div key={t.type} className={`border rounded-xl overflow-hidden ${isExpanded ? 'border-indigo-200' : 'border-slate-200'}`}>
                    <div className="p-3.5 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : t.type)}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.color}`}>{t.label}費用</span>
                          <span className="text-xs text-slate-400">{t.count} 筆記錄 · {t.pct}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{fmt(t.total)}</span>
                          <span className="text-xs text-indigo-600">{isExpanded ? '收起' : '展開明細'}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${style.bar} rounded-full`} style={{ width: `${t.pct}%` }} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50">
                        {t.items.map(c => {
                          const src = SOURCE_STYLE[c.source] || SOURCE_STYLE.manual;
                          return (
                            <div key={c.id} className="px-3.5 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-medium text-slate-700">{c.description || c.subject}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
                                  </div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {c.cost_date}{c.task_name && ` · ${c.task_name}`}{c.worker_name && ` · ${c.worker_name}`}
                                  </div>
                                  <div className="text-xs text-slate-400">{c.qty} × {fmt(c.unit_price)}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className={`font-semibold ${c.amount < 0 ? 'text-red-500' : 'text-slate-700'}`}>{c.amount < 0 ? `(${fmt(-c.amount)})` : fmt(c.amount)}</div>
                                  <div className="flex gap-2 mt-1 justify-end">
                                    {c.cost_type === 'material' && c.source !== 'return' && c.amount > 0 && (
                                      <button onClick={() => { if (confirm('確認退回沖銷此材料成本？')) returnMut.mutate(c.id); }} className="text-xs text-amber-600">退回</button>
                                    )}
                                    <button onClick={() => delCostMut.mutate(c.id)} className="text-xs text-slate-300 hover:text-red-500">刪除</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {costs.length === 0 && <div className="text-center text-slate-400 py-8">尚無成本記錄</div>}
            </div>
          )}

          {tab === 'receipt' && (
            <div className="space-y-2">
              {receipts.length === 0 ? <div className="text-center text-slate-400 py-8">尚無收款記錄</div> : receipts.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <div className="font-semibold text-slate-800">{fmt(r.amount)}</div>
                    <div className="text-xs text-slate-400">{r.received_date}{r.method && ` · ${r.method}`}{r.note && ` · ${r.note}`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新增成本 */}
        {showAddCost && (
          <div className="absolute inset-0 bg-white rounded-t-2xl md:rounded-2xl flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="font-bold text-slate-800">新增成本記錄</span>
              <button onClick={() => setShowAddCost(false)} className="text-slate-400">取消</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div>
                <label className="label">類型</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(COST_TYPE_STYLE).map(([k, v]) => (
                    <button key={k} onClick={() => setCostForm(f => ({ ...f, cost_type: k }))} className={`py-2 rounded-xl text-sm font-medium border-2 ${costForm.cost_type === k ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">科目</label><input className="input" value={costForm.subject} onChange={e => setCostForm(f => ({ ...f, subject: e.target.value }))} placeholder="例：漢堡" /></div>
                <div><label className="label">任務名稱</label><input className="input" value={costForm.task_name} onChange={e => setCostForm(f => ({ ...f, task_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">數量/工時</label><input type="number" className="input" value={costForm.qty} onChange={e => setCostForm(f => ({ ...f, qty: e.target.value }))} /></div>
                <div><label className="label">單價</label><input type="number" className="input" value={costForm.unit_price} onChange={e => setCostForm(f => ({ ...f, unit_price: e.target.value }))} /></div>
              </div>
              {costForm.cost_type === 'labor' && (
                <div><label className="label">員工</label><input className="input" value={costForm.worker_name} onChange={e => setCostForm(f => ({ ...f, worker_name: e.target.value }))} /></div>
              )}
              <div><label className="label">說明</label><input className="input" value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="text-sm text-slate-500 text-center">金額：<strong>{fmt((+costForm.qty || 0) * (+costForm.unit_price || 0))}</strong></div>
              <button className="btn-primary w-full py-3" disabled={addCostMut.isPending} onClick={() => addCostMut.mutate()}>{addCostMut.isPending ? '新增中...' : '新增成本記錄'}</button>
            </div>
          </div>
        )}

        {/* 新增收款 */}
        {showAddReceipt && (
          <div className="absolute inset-0 bg-white rounded-t-2xl md:rounded-2xl flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="font-bold text-slate-800">新增收款記錄</span>
              <button onClick={() => setShowAddReceipt(false)} className="text-slate-400">取消</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div><label className="label">金額 *</label><input type="number" className="input" value={receiptForm.amount} onChange={e => setReceiptForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">收款日期</label><input type="date" className="input" value={receiptForm.received_date} onChange={e => setReceiptForm(f => ({ ...f, received_date: e.target.value }))} /></div>
                <div><label className="label">付款方式</label><input className="input" value={receiptForm.method} onChange={e => setReceiptForm(f => ({ ...f, method: e.target.value }))} placeholder="匯款/現金" /></div>
              </div>
              <div><label className="label">備註</label><input className="input" value={receiptForm.note} onChange={e => setReceiptForm(f => ({ ...f, note: e.target.value }))} /></div>
              <button className="btn-primary w-full py-3" disabled={!receiptForm.amount || addReceiptMut.isPending} onClick={() => addReceiptMut.mutate()}>{addReceiptMut.isPending ? '新增中...' : '新增收款'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', client_name: '', contract_amount: '', note: '' });
  const mut = useMutation({
    mutationFn: () => createProject({ ...form, contract_amount: +form.contract_amount || 0 }),
    onSuccess: () => { qc.invalidateQueries(['projects']); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-bold text-slate-800">新增專案</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div><label className="label">專案名稱 *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">發案客戶</label><input className="input" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
          <div><label className="label">合約金額</label><input type="number" className="input" value={form.contract_amount} onChange={e => setForm(f => ({ ...f, contract_amount: e.target.value }))} /></div>
          <button className="btn-primary w-full py-3" disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? '建立中...' : '建立專案'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectFinance() {
  const [detailId, setDetailId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">專案財務</h1>
          <div className="text-sm text-slate-500">合約收款、成本記錄與盈虧分析</div>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增專案
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">尚無專案，點擊「新增專案」開始</div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <div key={p.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailId(p.id)}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold text-slate-800">{p.name}</div>
                  {p.client_name && <div className="text-sm text-slate-500">{p.client_name}</div>}
                </div>
                <div className={`text-right shrink-0 ${(p.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <div className="font-bold">{fmt(p.profit)}</div>
                  <div className="text-xs">毛利率 {p.margin_pct}%</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-50 rounded-lg py-1.5">
                  <div className="font-bold text-slate-700">{fmt(p.contract_amount)}</div>
                  <div className="text-slate-400">合約</div>
                </div>
                <div className="bg-blue-50 rounded-lg py-1.5">
                  <div className="font-bold text-blue-600">{fmt(p.received)}</div>
                  <div className="text-slate-400">已收 {p.received_pct}%</div>
                </div>
                <div className="bg-orange-50 rounded-lg py-1.5">
                  <div className="font-bold text-orange-600">{fmt(p.total_cost)}</div>
                  <div className="text-slate-400">成本 {p.cost_pct}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailId && <DetailDrawer projectId={detailId} onClose={() => setDetailId(null)} />}
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
