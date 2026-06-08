import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const getSOP = (productId) => axios.get(`/api/public/sop/${productId}`).then(r => r.data).catch(() => null);

export default function SOPViewer({ productId, onClose }) {
  const { data: sop, isLoading } = useQuery({
    queryKey: ['public-sop', productId],
    queryFn: () => getSOP(productId),
    retry: false,
  });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="bg-brand-950 text-white px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div className="text-xs text-brand-400">作業標準書</div>
          <div className="text-sm font-medium">{sop?.title || '載入中...'}</div>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {isLoading && (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
        )}

        {!isLoading && !sop && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-lg font-medium mb-2">此產品尚未建立 SOP</div>
            <div className="text-sm">請聯絡品管人員建立作業標準書</div>
          </div>
        )}

        {sop && (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>v{sop.version}</span>
              {sop.product_name && <span>· {sop.product_name}</span>}
            </div>

            {sop.safety_notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs font-bold text-amber-700 uppercase mb-2">安全注意事項</div>
                <div className="text-sm text-amber-800 whitespace-pre-wrap">{sop.safety_notes}</div>
              </div>
            )}

            {sop.tools_required && (
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase mb-1">所需工具</div>
                <div className="text-sm text-slate-700">{sop.tools_required}</div>
              </div>
            )}

            <div className="space-y-3">
              {(sop.steps || []).map((step, i) => (
                <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {step.step_no}
                    </div>
                    <div className="font-semibold text-slate-800">{step.title}</div>
                    {step.expected_time_min > 0 && <span className="ml-auto text-xs text-slate-400">{step.expected_time_min}分</span>}
                  </div>
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
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-green-600 shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="text-xs text-green-700">品質確認：{step.quality_check}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
