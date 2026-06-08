import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkers, getAttendance } from '../api/workers';
import { exportSimpleExcel, exportHTMLToPDF } from '../utils/exportUtils';
import {
  getPayrollMeta, getPreview, settlePayroll, reverseSettle, getPeriodStatus, getRecords,
  getRates, addRate, deleteRate,
} from '../api/laborPayroll';

const SKILL_COLOR = {
  師傅: 'bg-indigo-100 text-indigo-700',
  半技: 'bg-green-100 text-green-700',
  學徒: 'bg-amber-100 text-amber-700',
};
const PERIOD_LABEL = { first: '上期 (1-15)', second: '下期 (16-月底)', full: '全月' };

const fmt = (n) => `NT$ ${Math.round(n || 0).toLocaleString()}`;

// 出勤明細展開列
function AttendanceDetail({ workerId, range }) {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['attendance', workerId, range.start, range.end],
    queryFn: () => getAttendance(workerId, range.start, range.end),
  });
  if (isLoading) return <div className="px-4 py-3 text-xs text-slate-400">載入中...</div>;
  if (jobs.length === 0) return <div className="px-4 py-3 text-xs text-slate-400">此期間無完工記錄</div>;
  return (
    <div className="px-4 py-2 bg-slate-50/60 space-y-1">
      {jobs.map(j => (
        <div key={j.id} className="flex items-center justify-between text-xs py-1">
          <span className="text-slate-600">{j.completed_at?.slice(0, 10)} · {j.project_name}{j.location ? ` @ ${j.location}` : ''}</span>
          {j.offer_price > 0 && <span className="text-green-600 font-medium">{j.offer_price.toLocaleString()} 元</span>}
        </div>
      ))}
    </div>
  );
}

// ───── 薪資結算作業 ─────
function SettlementTab() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [periodType, setPeriodType] = useState('second');
  const [adjustments, setAdjustments] = useState({});
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-preview', year, month, periodType],
    queryFn: () => getPreview({ year, month, period_type: periodType }),
  });

  const { data: periodStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['period-status', year, month, periodType],
    queryFn: () => getPeriodStatus({ year, month, period_type: periodType }),
  });

  const settleMut = useMutation({
    mutationFn: () => settlePayroll({
      year, month, period_type: periodType,
      adjustments: Object.entries(adjustments).map(([worker_id, a]) => ({ worker_id, ...a })),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries(['payroll-records']);
      const msg = d.negative_count > 0
        ? `已結算 ${d.settled} 位（實發合計 ${d.total_net.toLocaleString()} 元）\n注意：${d.negative_count} 位淨額為負（扣墊付高於應發）`
        : `已結算 ${d.settled} 位（實發合計 ${d.total_net.toLocaleString()} 元）`;
      alert(msg);
      refetch(); refetchStatus();
    },
  });

  const reverseMut = useMutation({
    mutationFn: () => reverseSettle({ year, month, period_type: periodType }),
    onSuccess: (d) => { qc.invalidateQueries(['payroll-records']); alert(`已反結算,移除 ${d.removed} 筆紀錄`); refetchStatus(); },
  });

  const setAdj = (wid, field, val) => setAdjustments(a => ({ ...a, [wid]: { ...a[wid], [field]: +val || 0 } }));

  // 即時試算淨額（含扣墊付）以警示負數
  const previewNet = (r) => {
    const adv = adjustments[r.worker_id]?.advance_deduction || 0;
    return r.base_pay - adv;
  };
  const negativeCount = (data?.rows || []).filter(r => r.can_settle && previewNet(r) < 0).length;

  return (
    <div className="space-y-4">
      {/* 期別選擇 + 結算按鈕 */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select className="select w-auto" value={year} onChange={e => setYear(+e.target.value)}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <select className="select w-auto" value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
        </select>
        <select className="select w-auto" value={periodType} onChange={e => setPeriodType(e.target.value)}>
          {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex gap-2 ml-auto">
          <button className="btn-secondary text-sm" onClick={() => refetch()}>重新 Preview</button>
          {periodStatus?.settled ? (
            <button className="text-sm px-4 py-2 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100" disabled={reverseMut.isPending} onClick={() => { if (confirm('確定反結算此期別？將移除已產生的薪資紀錄。')) reverseMut.mutate(); }}>
              {reverseMut.isPending ? '處理中...' : '反結算'}
            </button>
          ) : (
            <button className="btn-primary text-sm" disabled={settleMut.isPending || !data?.settleable} onClick={() => { if (negativeCount > 0 && !confirm(`有 ${negativeCount} 位淨額為負（扣墊付高於應發）,仍要結算？`)) return; settleMut.mutate(); }}>
              {settleMut.isPending ? '結算中...' : '執行結算'}
            </button>
          )}
        </div>
      </div>

      {/* 已結算狀態列 */}
      {periodStatus?.settled && (
        <div className="card p-3 bg-green-50 border-green-200 flex items-center justify-between">
          <span className="text-sm text-green-800">
            此期別已結算 · {periodStatus.count} 筆 · 實發合計 <strong>{(periodStatus.total_net || 0).toLocaleString()}</strong> 元
            {periodStatus.settled_at && <span className="text-green-500 ml-2 text-xs">{periodStatus.settled_at}</span>}
          </span>
        </div>
      )}

      {/* 負薪資警示 */}
      {negativeCount > 0 && !periodStatus?.settled && (
        <div className="card p-3 bg-red-50 border-red-200 text-sm text-red-700 flex items-start gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mt-0.5 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{negativeCount} 位點工的扣墊付高於應發薪資,淨額將為負數,請確認扣款金額是否正確。</span>
        </div>
      )}

      {/* 統計卡 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">可結算</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2} className="w-5 h-5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div className="text-3xl font-bold text-green-700 mt-1">{data?.settleable ?? '-'}</div>
        </div>
        <div className="card p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">需處理</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div className="text-3xl font-bold text-amber-700 mt-1">{data?.need_attention ?? '-'}</div>
        </div>
        <div className="card p-4 bg-indigo-50 border-indigo-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">適用結構</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth={2} className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <div className="text-xl font-bold text-indigo-700 mt-2">{data?.applied_structure ?? '-'}</div>
        </div>
      </div>

      {data?.need_attention > 0 && (
        <div className="card p-3 bg-blue-50 border-blue-100 text-sm text-blue-700 flex items-start gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>「缺少 SkillLevel」→ 人員基本資料設定；「無適用費率」→ 薪資結構 Tab 建立級距日薪。</span>
        </div>
      )}

      {/* 名單 */}
      {isError ? (
        <div className="card p-8 text-center">
          <div className="text-red-500 font-medium">載入結算資料失敗</div>
          <button className="btn-secondary text-sm mt-3" onClick={() => refetch()}>重新載入</button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-7 w-7 border-2 border-indigo-600 border-t-transparent" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
            <div className="col-span-3">姓名</div>
            <div className="col-span-2">級距</div>
            <div className="col-span-2 text-right">日薪</div>
            <div className="col-span-1 text-center">出勤</div>
            <div className="col-span-2 text-center">扣墊付</div>
            <div className="col-span-2 text-center">警示 / 處理</div>
          </div>
          {data?.rows?.length === 0 ? (
            <div className="p-8 text-center text-slate-400">此期別無點工資料</div>
          ) : data?.rows?.map(r => (
            <div key={r.worker_id} className="border-b border-slate-50 last:border-0">
              <div className="grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 items-center">
                <div className="md:col-span-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">{r.worker_name?.[0]}</div>
                  <span className="font-medium text-slate-800 truncate">{r.worker_name}</span>
                </div>
                <div className="md:col-span-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SKILL_COLOR[r.skill_level] || 'bg-slate-100 text-slate-600'}`}>{r.skill_level}</span>
                </div>
                <div className="md:col-span-2 md:text-right font-semibold text-slate-700">{r.day_rate?.toLocaleString()}</div>
                <div className="md:col-span-1 md:text-center text-sm">
                  <button onClick={() => setExpanded(expanded === r.worker_id ? null : r.worker_id)} className="text-indigo-600 hover:underline">
                    {r.work_days} 天
                  </button>
                </div>
                <div className="md:col-span-2 md:text-center">
                  <input
                    type="number"
                    className="input text-center py-1.5 text-sm w-full md:w-20 md:mx-auto"
                    placeholder="0"
                    value={adjustments[r.worker_id]?.advance_deduction || ''}
                    onChange={e => setAdj(r.worker_id, 'advance_deduction', e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 md:text-center">
                  {r.can_settle ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
                      可結算
                    </span>
                  ) : (
                    <span className="text-xs text-red-500">{r.issues.join('、')}</span>
                  )}
                </div>
              </div>
              {expanded === r.worker_id && <AttendanceDetail workerId={r.worker_id} range={data.range} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───── 薪資結構（級距日薪設定）─────
function StructureTab({ meta }) {
  const qc = useQueryClient();
  const { data: workers = [] } = useQuery({ queryKey: ['my-worker'], queryFn: () => getWorkers({ status: 'all' }) });
  const [selectedWorker, setSelectedWorker] = useState('');
  const wid = selectedWorker || workers[0]?.id;

  const { data: rates = [] } = useQuery({ queryKey: ['rates', wid], queryFn: () => getRates(wid), enabled: !!wid });
  const [form, setForm] = useState({ skill_level: '師傅', day_rate: '', overtime_hourly: '', effective_date: new Date().toISOString().slice(0, 10) });

  const addMut = useMutation({
    mutationFn: () => addRate(wid, { ...form, day_rate: +form.day_rate, overtime_hourly: +form.overtime_hourly }),
    onSuccess: () => { qc.invalidateQueries(['rates']); setForm(f => ({ ...f, day_rate: '', overtime_hourly: '' })); },
  });
  const delMut = useMutation({ mutationFn: deleteRate, onSuccess: () => qc.invalidateQueries(['rates']) });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label">選擇點工</label>
        <select className="select" value={wid || ''} onChange={e => setSelectedWorker(e.target.value)}>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}（{w.skill_level || '師傅'}）</option>)}
        </select>
      </div>

      {/* 新增設定 */}
      <div className="card p-5">
        <h2 className="font-bold text-slate-800 mb-4">新增薪資設定</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">技能級距</label>
            <select className="select" value={form.skill_level} onChange={e => setForm(f => ({ ...f, skill_level: e.target.value }))}>
              {meta.skill_levels.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">生效日</label>
            <input type="date" className="input" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">日薪（元）</label>
            <input type="number" className="input" value={form.day_rate} onChange={e => setForm(f => ({ ...f, day_rate: e.target.value }))} placeholder="3000" />
          </div>
          <div>
            <label className="label">加班時薪（元）</label>
            <input type="number" className="input" value={form.overtime_hourly} onChange={e => setForm(f => ({ ...f, overtime_hourly: e.target.value }))} placeholder="600" />
          </div>
        </div>
        <button className="btn-primary w-full py-2.5" disabled={!form.day_rate || !wid || addMut.isPending} onClick={() => addMut.mutate()}>
          {addMut.isPending ? '新增中...' : '新增設定'}
        </button>
      </div>

      {/* 現有設定（多生效日）*/}
      <div className="card p-5">
        <h2 className="font-bold text-slate-800 mb-3">薪資設定（依生效日）</h2>
        {rates.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-4">尚無薪資設定</div>
        ) : (
          <div className="space-y-2">
            {rates.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
                <div>
                  <div className="text-lg font-bold text-indigo-600">{r.skill_level}　日薪：NT$ {r.day_rate?.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-0.5">生效：{r.effective_date} 起　加班時薪 NT${r.overtime_hourly}</div>
                </div>
                <button className="text-red-400 hover:text-red-600" onClick={() => delMut.mutate(r.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───── 薪資紀錄 ─────
function RecordsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState('');
  const { data: records = [] } = useQuery({ queryKey: ['payroll-records', year, month], queryFn: () => getRecords({ year, month: month || undefined }) });

  const totalNet = records.reduce((s, r) => s + (r.net_pay || 0), 0);

  const PERIOD = { first: '上期', second: '下期', full: '全月' };

  const exportExcelFn = () => {
    exportSimpleExcel(
      `薪資紀錄_${year}${month ? '_' + month + '月' : ''}`, '薪資紀錄',
      [
        { header: '期間', accessor: r => `${r.year}/${r.month} ${PERIOD[r.period_type] || ''}` },
        { header: '姓名', accessor: r => r.worker_name },
        { header: '級距', accessor: r => r.skill_level },
        { header: '日薪', accessor: r => r.day_rate },
        { header: '出勤天數', accessor: r => r.work_days },
        { header: '底薪', accessor: r => Math.round(r.base_pay) },
        { header: '加班費', accessor: r => Math.round(r.overtime_pay) },
        { header: '獎金', accessor: r => Math.round(r.bonus) },
        { header: '扣款', accessor: r => Math.round(r.deduction) },
        { header: '扣墊付', accessor: r => Math.round(r.advance_deduction) },
        { header: '實發', accessor: r => Math.round(r.net_pay) },
        { header: '狀態', accessor: r => r.status },
      ],
      records
    );
  };

  const payslipHTML = () => `<div style="font-family:system-ui,'Microsoft JhengHei',sans-serif;padding:24px;color:#1e293b">
      <h2 style="margin:0 0 16px">薪資條 ${year}年${month || ''}</h2>
      ${records.map(r => `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:16px 20px;margin-bottom:16px;page-break-inside:avoid">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">${r.worker_name} <span style="font-size:12px;color:#6366f1;font-weight:500">${r.skill_level}</span></div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:12px">${r.year}/${r.month} ${PERIOD[r.period_type] || ''} · 日薪 ${r.day_rate?.toLocaleString()} × 出勤 ${r.work_days} 天</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:4px 0">底薪</td><td style="padding:4px 0;text-align:right;font-weight:600">NT$ ${Math.round(r.base_pay).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0">加班費</td><td style="padding:4px 0;text-align:right;font-weight:600">NT$ ${Math.round(r.overtime_pay).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0">獎金</td><td style="padding:4px 0;text-align:right;font-weight:600">NT$ ${Math.round(r.bonus).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0">扣款</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#ef4444">- NT$ ${Math.round(r.deduction).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0">扣墊付</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#ef4444">- NT$ ${Math.round(r.advance_deduction).toLocaleString()}</td></tr>
          <tr><td style="border-top:2px solid #e2e8f0;padding:8px 0 0;font-size:16px;color:#4f46e5">實發金額</td><td style="border-top:2px solid #e2e8f0;padding:8px 0 0;text-align:right;font-weight:700;font-size:16px;color:#4f46e5">NT$ ${Math.round(r.net_pay).toLocaleString()}</td></tr>
        </table>
      </div>`).join('')}
    </div>`;

  const exportPayslipPDF = () => exportHTMLToPDF(payslipHTML(), `薪資條_${year}${month ? '_' + month + '月' : ''}`);
  const printPayslips = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>薪資條</title></head><body>${payslipHTML()}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-3">
        <select className="select w-auto" value={year} onChange={e => setYear(+e.target.value)}>
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <select className="select w-auto" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">全部月份</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-sm hidden md:block">
            <span className="text-slate-500">累計實發 </span>
            <span className="font-bold text-indigo-600">{fmt(totalNet)}</span>
          </div>
          {records.length > 0 && (
            <>
              <button onClick={exportPayslipPDF} className="btn-secondary text-xs">薪資條 PDF</button>
              <button onClick={printPayslips} className="btn-secondary text-xs">列印</button>
              <button onClick={exportExcelFn} className="btn-secondary text-xs">匯出 Excel</button>
            </>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">尚無薪資紀錄</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
            <div className="col-span-3">期間</div>
            <div className="col-span-2">姓名</div>
            <div className="col-span-2 text-right">底薪</div>
            <div className="col-span-1 text-right">加給</div>
            <div className="col-span-2 text-right">扣墊付</div>
            <div className="col-span-1 text-right">實發</div>
            <div className="col-span-1 text-center">狀態</div>
          </div>
          {records.map(r => (
            <div key={r.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-50 last:border-0 items-center text-sm">
              <div className="md:col-span-3 font-medium text-slate-700">{r.year}/{r.month} {PERIOD_LABEL[r.period_type]?.split(' ')[0]}</div>
              <div className="md:col-span-2 text-slate-600">{r.worker_name}</div>
              <div className="md:col-span-2 md:text-right">{Math.round(r.base_pay).toLocaleString()}</div>
              <div className="md:col-span-1 md:text-right text-green-600">{Math.round(r.overtime_pay + r.bonus).toLocaleString()}</div>
              <div className="md:col-span-2 md:text-right text-red-500">{Math.round(r.deduction + r.advance_deduction).toLocaleString()}</div>
              <div className="md:col-span-1 md:text-right font-bold text-indigo-600">{Math.round(r.net_pay).toLocaleString()}</div>
              <div className="md:col-span-1 md:text-center"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{r.status}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'settle', label: '薪資結算作業' },
  { key: 'structure', label: '薪資結構' },
  { key: 'records', label: '薪資紀錄' },
];

export default function LaborPayroll() {
  const [tab, setTab] = useState('settle');
  const { data: meta } = useQuery({ queryKey: ['payroll-meta'], queryFn: getPayrollMeta });

  if (!meta) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>;

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">薪資中心</h1>
        <div className="text-sm text-slate-500">薪資結構設定、期別結算與薪資紀錄管理</div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'bg-slate-100 text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settle' && <SettlementTab />}
      {tab === 'structure' && <StructureTab meta={meta} />}
      {tab === 'records' && <RecordsTab />}
    </div>
  );
}
