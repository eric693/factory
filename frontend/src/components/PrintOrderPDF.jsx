import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const getOrderDetail = (id) => axios.get(`/api/orders/${id}`).then(r => r.data);

const STATUS_MAP = { pending: '待排產', scheduled: '已排產', in_production: '生產中', completed: '完成', shipped: '已出貨' };

export function PrintOrderPDF({ order, onClose }) {
  const cardRef = useRef(null);
  const { data: detail } = useQuery({ queryKey: ['order', order.id], queryFn: () => getOrderDetail(order.id) });
  const items = detail?.items || [];

  const handlePrint = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${order.order_no}-訂單確認書.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <span className="font-semibold text-slate-800">訂單確認書預覽</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary text-sm px-4 py-1.5">下載 PDF</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <div ref={cardRef} className="p-8 bg-white" style={{ fontFamily: 'system-ui, sans-serif', minWidth: 480 }}>
            {/* 標頭 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>Order Confirmation</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>訂單確認書</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{order.order_no}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>建立日期：{dayjs(order.created_at).format('YYYY-MM-DD')}</div>
                <div style={{ marginTop: 6, display: 'inline-block', background: '#eff6ff', color: '#2563eb', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  {STATUS_MAP[order.status] || order.status}
                </div>
              </div>
            </div>

            {/* 客戶 / 交期 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>客戶</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{order.customer_name}</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>交期</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{order.due_date}</div>
                {order.priority === 1 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>急件</div>}
              </div>
            </div>

            {/* 品項表 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>訂購品項</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    {['料號', '品名', '數量', '單位'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{item.product_code || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.product_name}</td>
                      <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.qty}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{item.unit || '個'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {order.note && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: '#92400e', fontWeight: 600, marginBottom: 4 }}>備註</div>
                <div style={{ fontSize: 12, color: '#92400e' }}>{order.note}</div>
              </div>
            )}

            {/* 簽核 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, borderTop: '2px solid #e2e8f0', paddingTop: 20 }}>
              {['客戶確認', '業務簽核', '廠長確認'].map(label => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 24 }}>{label}</div>
                  <div style={{ borderBottom: '1px solid #cbd5e1', marginBottom: 4 }} />
                  <div style={{ fontSize: 9, color: '#cbd5e1' }}>簽名 / 日期</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 9, color: '#cbd5e1' }}>
              FactoryOS · {dayjs().format('YYYY-MM-DD HH:mm')} · 本確認書以雙方簽署為準
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrintShipmentPDF({ shipment, onClose }) {
  const cardRef = useRef(null);

  const handlePrint = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${shipment.shipment_no}-出貨單.pdf`);
  };

  const items = shipment.items || [];

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <span className="font-semibold text-slate-800">出貨單預覽</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-primary text-sm px-4 py-1.5">下載 PDF</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <div ref={cardRef} className="p-6 bg-white" style={{ fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>Packing Slip / 出貨單</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{shipment.shipment_no}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                <div>出貨日期</div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{shipment.shipped_at?.slice(0,10) || dayjs().format('YYYY-MM-DD')}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: '收貨客戶', value: shipment.customer_name },
                { label: '關聯訂單', value: shipment.order_no || '-' },
                { label: '貨運商', value: shipment.carrier || '-' },
                { label: '追蹤號碼', value: shipment.tracking_no || '-' },
              ].map(row => (
                <div key={row.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{row.value}</div>
                </div>
              ))}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['料號', '品名', '數量'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748b' }}>{item.product_code || '-'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{item.product_name}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.qty}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>無明細</td></tr>
                )}
              </tbody>
            </table>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              {['收貨確認', '出貨確認'].map(label => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 20 }}>{label}</div>
                  <div style={{ borderBottom: '1px solid #cbd5e1', marginBottom: 4 }} />
                  <div style={{ fontSize: 9, color: '#cbd5e1' }}>簽名 / 日期</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 9, color: '#cbd5e1' }}>FactoryOS · {dayjs().format('YYYY-MM-DD HH:mm')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
