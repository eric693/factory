import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getSkills = () => api.get('/skills').then(r => r.data);
const getOperatorSkills = (op) => api.get(`/skills/${encodeURIComponent(op)}`).then(r => r.data);
const getMachines = () => api.get('/machines').then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getSuggestions = () => api.get('/skills/suggest/auto').then(r => r.data);
const createSkill = (data) => api.post('/skills', data).then(r => r.data);
const updateSkill = (id, data) => api.patch(`/skills/${id}`, data).then(r => r.data);
const deleteSkill = (id) => api.delete(`/skills/${id}`).then(r => r.data);

const LEVELS = {
  1: { label: '學習中', color: 'bg-slate-100 text-slate-500', dots: 1 },
  2: { label: '可操作', color: 'bg-blue-100 text-blue-700', dots: 2 },
  3: { label: '熟練', color: 'bg-green-100 text-green-700', dots: 3 },
  4: { label: '專家', color: 'bg-brand-100 text-brand-700', dots: 4 },
};

function SkillDots({ level }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= level ? 'bg-brand-500' : 'bg-slate-200'}`} />
      ))}
    </div>
  );
}

function AddSkillModal({ operator, onClose }) {
  const qc = useQueryClient();
  const { data: machines = [] } = useQuery({ queryKey: ['machines'], queryFn: getMachines });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const [form, setForm] = useState({ operator: operator || '', machine_id: '', product_id: '', skill_level: 2, certified: false, note: '' });

  const mut = useMutation({
    mutationFn: () => createSkill(form),
    onSuccess: () => { qc.invalidateQueries(['skills']); qc.invalidateQueries(['operator-skills']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">新增技能認證</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">師傅姓名 *</label>
            <input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} disabled={!!operator} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">機台</label>
              <select className="select" value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
                <option value="">-- 不限 --</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">產品</label>
              <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">-- 不限 --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">技能等級</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(LEVELS).map(([lv, info]) => (
                <button key={lv} onClick={() => setForm(f => ({ ...f, skill_level: +lv }))} className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${form.skill_level === +lv ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>
                  {info.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.certified} onChange={e => setForm(f => ({ ...f, certified: e.target.checked }))} className="w-4 h-4" />
            <span className="text-sm text-slate-700">已通過正式認證</span>
          </label>
          <button className="btn-primary w-full py-3" disabled={!form.operator || (!form.machine_id && !form.product_id) || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '儲存中...' : '新增技能'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OperatorDetail({ operator, onClose }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['operator-skills', operator], queryFn: () => getOperatorSkills(operator) });
  const [adding, setAdding] = useState(false);

  const deleteMut = useMutation({ mutationFn: deleteSkill, onSuccess: () => qc.invalidateQueries(['operator-skills']) });
  const certifyMut = useMutation({
    mutationFn: ({ id, certified }) => updateSkill(id, { certified }),
    onSuccess: () => qc.invalidateQueries(['operator-skills']),
  });

  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const { skills = [], history = [] } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 text-lg">{operator}</div>
            <div className="text-sm text-slate-500">{skills.length} 項技能認證</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(true)} className="btn-secondary text-xs px-3 py-1.5">新增技能</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 認證技能 */}
          {skills.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">尚未建立技能認證</div>
          ) : (
            <div className="space-y-2">
              {skills.map(s => {
                const lv = LEVELS[s.skill_level] || LEVELS[1];
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {s.machine_name || '不限機台'}
                          {s.product_code && ` · ${s.product_code}`}
                        </span>
                        {s.certified ? (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">已認證</span>
                        ) : (
                          <button onClick={() => certifyMut.mutate({ id: s.id, certified: true })} className="text-xs text-brand-600 hover:underline">認證</button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <SkillDots level={s.skill_level} />
                        <span className="text-xs text-slate-400">{lv.label}</span>
                        {s.certified_at && <span className="text-xs text-slate-300">· {s.certified_at}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteMut.mutate(s.id)} className="text-xs text-slate-300 hover:text-red-500 shrink-0">移除</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 歷史實作經驗 */}
          {history.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">歷史生產經驗（自動統計）</div>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700">{h.product_name}</div>
                      <div className="text-xs text-slate-400">{h.machine_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-700">{(h.total_qty || 0).toLocaleString()} 件</div>
                      <div className="text-xs text-slate-400">{h.log_count} 次回報</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {adding && <AddSkillModal operator={operator} onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function Skills() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['skills'], queryFn: getSkills });
  const { data: suggestions = [] } = useQuery({ queryKey: ['skill-suggestions'], queryFn: getSuggestions });

  const createMut = useMutation({
    mutationFn: createSkill,
    onSuccess: () => { qc.invalidateQueries(['skills']); qc.invalidateQueries(['skill-suggestions']); },
  });

  const { skills = [], operators = [] } = data || {};

  // 依師傅分組統計
  const byOperator = {};
  operators.forEach(op => { byOperator[op] = { operator: op, count: 0, certified: 0, maxLevel: 0 }; });
  skills.forEach(s => {
    if (!byOperator[s.operator]) byOperator[s.operator] = { operator: s.operator, count: 0, certified: 0, maxLevel: 0 };
    byOperator[s.operator].count++;
    if (s.certified) byOperator[s.operator].certified++;
    byOperator[s.operator].maxLevel = Math.max(byOperator[s.operator].maxLevel, s.skill_level);
  });
  const operatorList = Object.values(byOperator).sort((a, b) => b.certified - a.certified);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">技能矩陣</h1>
          <div className="text-xs text-slate-400 mt-0.5">師傅 × 機台/產品 技能認證管理</div>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增認證
        </button>
      </div>

      {/* 自動建議 */}
      {suggestions.length > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-blue-800 text-sm">系統建議認證（依歷史產量）</div>
            <button onClick={() => setShowSuggest(v => !v)} className="text-xs text-blue-600">{showSuggest ? '收起' : `展開 ${suggestions.length} 項`}</button>
          </div>
          {showSuggest && (
            <div className="space-y-2">
              {suggestions.slice(0, 10).map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">{s.operator}</div>
                    <div className="text-xs text-slate-400">{s.machine_name} · {s.product_name} · 已產 {s.total_qty} 件 · 良率 {s.yield_rate}%</div>
                  </div>
                  <button
                    onClick={() => createMut.mutate({ operator: s.operator, machine_id: s.machine_id, product_id: s.product_id, skill_level: s.yield_rate >= 98 ? 3 : 2, certified: true })}
                    className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 shrink-0"
                  >
                    認證
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : operatorList.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">尚無師傅技能資料</div>
      ) : (
        <div className="space-y-2">
          {operatorList.map(op => (
            <div key={op.operator} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(op.operator)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
                  {op.operator[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800">{op.operator}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {op.count} 項技能 · {op.certified} 項已認證
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {op.maxLevel > 0 && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVELS[op.maxLevel]?.color}`}>
                      {LEVELS[op.maxLevel]?.label}
                    </span>
                  )}
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <OperatorDetail operator={selected} onClose={() => setSelected(null)} />}
      {adding && <AddSkillModal onClose={() => setAdding(false)} />}
    </div>
  );
}
