import { useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
const submitInquiry = (data) => api.post('/quotes/inquiries/public', data).then(r => r.data);

export default function InquiryPublic() {
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    message: '',
  });
  const [items, setItems] = useState([{ product_name: '', qty: 1, note: '' }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const addItem = () => setItems(prev => [...prev, { product_name: '', qty: 1, note: '' }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, key, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  const handleSubmit = async () => {
    if (!form.company_name) { setError('請填公司名稱'); return; }
    setLoading(true);
    setError('');
    try {
      const r = await submitInquiry({ ...form, items });
      setResult(r);
    } catch (err) {
      setError(err.response?.data?.error || '送出失敗');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8 text-green-600">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">詢價單已送出</h2>
          <p className="text-slate-600 mb-4">我們將盡快聯繫您</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <div className="text-xs text-slate-500 mb-1">詢價單編號</div>
            <div className="text-xl font-bold text-brand-700">{result.inquiry_no}</div>
          </div>
          <button className="btn-primary w-full" onClick={() => { setResult(null); setForm({ company_name: '', contact_name: '', contact_phone: '', contact_email: '', message: '' }); setItems([{ product_name: '', qty: 1, note: '' }]); }}>
            再次詢價
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-4 py-8">
        <div className="text-center mb-8">
          <div className="text-xs font-semibold text-brand-500 uppercase tracking-widest mb-1">線上詢價</div>
          <h1 className="text-3xl font-bold text-slate-900">FactoryOS</h1>
          <p className="text-slate-500 mt-2">填寫詢價資料，我們將在 24 小時內回覆</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <h2 className="text-base font-bold text-slate-800 mb-4">聯絡資訊</h2>
          <div className="space-y-4">
            <div>
              <label className="label">公司名稱 *</label>
              <input className="input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="貴公司全名" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">聯絡人</label>
                <input className="input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="姓名" />
              </div>
              <div>
                <label className="label">電話</label>
                <input className="input" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="0912-345-678" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="email@company.com" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-800">詢價品項</h2>
            <button className="btn-ghost text-sm" onClick={addItem}>+ 新增品項</button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-2">
                    <label className="label text-xs">產品/規格說明</label>
                    <input className="input" placeholder="產品名稱、規格" value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">數量</label>
                    <input type="number" className="input" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', +e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1 text-sm" placeholder="備註（材質、尺寸等）" value={item.note} onChange={e => updateItem(i, 'note', e.target.value)} />
                  {items.length > 1 && (
                    <button className="text-slate-400 hover:text-red-500" onClick={() => removeItem(i)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-base font-bold text-slate-800 mb-4">其他說明</h2>
          <textarea className="input" rows={4} placeholder="交期要求、特殊規格、其他說明..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
        )}

        <button className="btn-primary w-full py-4 text-base" onClick={handleSubmit} disabled={loading}>
          {loading ? '送出中...' : '送出詢價'}
        </button>
        <p className="text-center text-xs text-slate-400 mt-4">我們重視您的隱私，資料僅用於報價聯繫</p>
      </div>
    </div>
  );
}
