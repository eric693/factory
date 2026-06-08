import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getSOPs = (product_id) => api.get('/sop', { params: product_id ? { product_id } : {} }).then(r => r.data);
const getSOP = (id) => api.get(`/sop/${id}`).then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const createSOP = (data) => api.post('/sop', data).then(r => r.data);
const updateSOP = (id, data) => api.patch(`/sop/${id}`, data).then(r => r.data);
const archiveSOP = (id) => api.delete(`/sop/${id}`).then(r => r.data);

function StepEditor({ steps, onChange }) {
  const addStep = () => onChange([...steps, { step_no: steps.length + 1, title: '', description: '', warning: '', expected_time_min: 0, quality_check: '' }]);
  const removeStep = (i) => onChange(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_no: idx + 1 })));
  const updateStep = (i, field, value) => onChange(steps.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">步驟 {step.step_no}</span>
            {steps.length > 1 && (
              <button onClick={() => removeStep(i)} className="text-xs text-red-400 hover:text-red-600">移除</button>
            )}
          </div>
          <input className="input text-sm" placeholder="步驟標題 *" value={step.title} onChange={e => updateStep(i, 'title', e.target.value)} />
          <textarea className="input text-sm" rows={2} placeholder="詳細說明..." value={step.description} onChange={e => updateStep(i, 'description', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-xs" placeholder="注意事項/警告" value={step.warning} onChange={e => updateStep(i, 'warning', e.target.value)} />
            <input className="input text-xs" placeholder="品質確認點" value={step.quality_check} onChange={e => updateStep(i, 'quality_check', e.target.value)} />
          </div>
          <div>
            <input type="number" min={0} className="input text-xs w-32" placeholder="預估時間(分)" value={step.expected_time_min} onChange={e => updateStep(i, 'expected_time_min', +e.target.value)} />
          </div>
        </div>
      ))}
      <button onClick={addStep} className="btn-ghost w-full text-sm border-dashed border-2 border-slate-200 py-3">+ 新增步驟</button>
    </div>
  );
}

function SOPForm({ sop, products, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    product_id: sop?.product_id || '',
    title: sop?.title || '',
    version: sop?.version || '1.0',
    safety_notes: sop?.safety_notes || '',
    tools_required: sop?.tools_required || '',
    note: sop?.note || '',
  });
  const [steps, setSteps] = useState(sop?.steps?.length ? sop.steps : [{ step_no: 1, title: '', description: '', warning: '', expected_time_min: 0, quality_check: '' }]);

  const mut = useMutation({
    mutationFn: () => sop?.id ? updateSOP(sop.id, { ...form, steps }) : createSOP({ ...form, steps }),
    onSuccess: () => { qc.invalidateQueries(['sops']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">對應產品</label>
          <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
            <option value="">-- 選填 --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">版本</label>
          <input className="input" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.0" />
        </div>
      </div>
      <div>
        <label className="label">文件標題 *</label>
        <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="鋁合金外殼加工作業指導書" />
      </div>
      <div>
        <label className="label">安全注意事項</label>
        <textarea className="input" rows={2} value={form.safety_notes} onChange={e => setForm(f => ({ ...f, safety_notes: e.target.value }))} placeholder="防護具、安全規定..." />
      </div>
      <div>
        <label className="label">所需工具/設備</label>
        <input className="input" value={form.tools_required} onChange={e => setForm(f => ({ ...f, tools_required: e.target.value }))} placeholder="游標尺、扭力扳手..." />
      </div>
      <div>
        <label className="label">作業步驟</label>
        <StepEditor steps={steps} onChange={setSteps} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.title || steps.some(s => !s.title) || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '儲存中...' : sop?.id ? '更新文件' : '建立 SOP'}
      </button>
    </div>
  );
}

function SOPViewer({ sop, onClose, onEdit }) {
  const totalMin = sop.steps?.reduce((s, st) => s + (st.expected_time_min || 0), 0) || 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-brand-600 font-semibold uppercase tracking-wider mb-0.5">作業標準書 v{sop.version}</div>
              <div className="font-bold text-slate-900 text-lg leading-tight">{sop.title}</div>
              {sop.product_name && <div className="text-sm text-slate-500 mt-0.5">{sop.product_code} · {sop.product_name}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              {onEdit && <button onClick={onEdit} className="btn-secondary text-xs px-3 py-1.5">編輯</button>}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-400">
            <span>{sop.steps?.length || 0} 個步驟</span>
            {totalMin > 0 && <span>預估 {totalMin} 分鐘</span>}
            <span>更新：{dayjs(sop.updated_at).format('YYYY/MM/DD')}</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {sop.safety_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-xs font-bold text-amber-700 uppercase mb-1">安全注意</div>
              <div className="text-sm text-amber-800 whitespace-pre-wrap">{sop.safety_notes}</div>
            </div>
          )}
          {sop.tools_required && (
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs font-bold text-slate-500 uppercase mb-1">所需工具</div>
              <div className="text-sm text-slate-700">{sop.tools_required}</div>
            </div>
          )}

          <div className="space-y-3">
            {(sop.steps || []).map((step, i) => (
              <div key={step.id || i} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                  <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {step.step_no}
                  </div>
                  <div className="font-semibold text-slate-800">{step.title}</div>
                  {step.expected_time_min > 0 && <span className="ml-auto text-xs text-slate-400 shrink-0">{step.expected_time_min} 分</span>}
                </div>
                {(step.description || step.warning || step.quality_check) && (
                  <div className="px-4 py-3 space-y-2">
                    {step.description && <div className="text-sm text-slate-700 whitespace-pre-wrap">{step.description}</div>}
                    {step.warning && (
                      <div className="flex items-start gap-2 bg-red-50 rounded-lg px-3 py-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-red-500 shrink-0 mt-0.5">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span className="text-xs text-red-700">{step.warning}</span>
                      </div>
                    )}
                    {step.quality_check && (
                      <div className="flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-green-600 shrink-0 mt-0.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span className="text-xs text-green-700">品質確認：{step.quality_check}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SOPPage() {
  const qc = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: sops = [], isLoading } = useQuery({
    queryKey: ['sops', selectedProduct],
    queryFn: () => getSOPs(selectedProduct || undefined),
  });

  const viewMut = useMutation({ mutationFn: getSOP, onSuccess: (data) => setViewing(data) });
  const archiveMut = useMutation({ mutationFn: archiveSOP, onSuccess: () => qc.invalidateQueries(['sops']) });

  const editingSOPQuery = useQuery({
    queryKey: ['sop', editing],
    queryFn: () => getSOP(editing),
    enabled: !!editing,
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">作業標準書 SOP</h1>
          <div className="text-xs text-slate-400 mt-0.5">數位化作業指導書，QR 掃碼即可查閱</div>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增 SOP
        </button>
      </div>

      <select className="select" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
        <option value="">全部產品</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
      </select>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : sops.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <div className="text-lg font-medium mb-2">尚無作業標準書</div>
          <div className="text-sm mb-4">建立 SOP 後，師傅可透過工單 QR Code 掃碼查閱</div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>建立第一份 SOP</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sops.map(sop => (
            <div key={sop.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => viewMut.mutate(sop.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">v{sop.version}</span>
                    {sop.product_code && <span className="text-xs text-slate-400">{sop.product_code}</span>}
                  </div>
                  <div className="font-semibold text-slate-800">{sop.title}</div>
                  {sop.product_name && <div className="text-sm text-slate-500">{sop.product_name}</div>}
                  <div className="text-xs text-slate-400 mt-1">更新：{dayjs(sop.updated_at).format('YYYY/MM/DD')}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={e => { e.stopPropagation(); setEditing(sop.id); }} className="btn-ghost text-xs py-1 px-2">編輯</button>
                  <button onClick={e => { e.stopPropagation(); if (confirm('確定封存此文件？')) archiveMut.mutate(sop.id); }} className="text-xs text-slate-300 hover:text-red-500 py-1 px-2">封存</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 建立 Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">新增作業標準書</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <SOPForm products={products} onClose={() => setShowCreate(false)} />
            </div>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {editing && editingSOPQuery.data && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">編輯 SOP</h2>
              <button onClick={() => setEditing(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <SOPForm sop={editingSOPQuery.data} products={products} onClose={() => setEditing(null)} />
            </div>
          </div>
        </div>
      )}

      {/* 閱覽 Modal */}
      {viewing && <SOPViewer sop={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing.id); setViewing(null); }} />}
    </div>
  );
}
