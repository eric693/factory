// 共用匯出工具：Excel (xlsx) 與 PDF (html2canvas + jsPDF，支援中文與多頁)

// ─── Excel ───
// sheets: [{ name, columns: [{ header, accessor: row=>value }], rows }]
export async function exportExcel(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, columns, rows }) => {
    const aoa = [columns.map(c => c.header)];
    rows.forEach(r => aoa.push(columns.map(c => c.accessor(r))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 欄寬自動估算
    ws['!cols'] = columns.map((c, i) => {
      const maxLen = Math.max(String(c.header).length * 2, ...aoa.slice(1).map(row => String(row[i] ?? '').length * 1.2));
      return { wch: Math.min(40, Math.max(8, maxLen)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

// 單表快捷
export function exportSimpleExcel(filename, sheetName, columns, rows) {
  return exportExcel(filename, [{ name: sheetName, columns, rows }]);
}

// ─── PDF（擷取 DOM 元素，中文正常，A4 多頁自動分頁）───
export async function exportElementToPDF(element, filename, opts = {}) {
  if (!element) return;
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  const imgData = canvas.toDataURL('image/png');
  const orientation = opts.orientation || 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const margin = opts.margin ?? 8;
  const usableW = pdfW - margin * 2;
  const imgH = canvas.height * usableW / canvas.width;

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(imgData, 'PNG', margin, position, usableW, imgH);
  heightLeft -= (pdfH - margin * 2);
  while (heightLeft > 0) {
    pdf.addPage();
    position = margin - (imgH - heightLeft);
    pdf.addImage(imgData, 'PNG', margin, position, usableW, imgH);
    heightLeft -= (pdfH - margin * 2);
  }
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

// 由 HTML 字串產生 PDF（離屏渲染，適合自訂版型如報表/薪資條）
export async function exportHTMLToPDF(htmlString, filename, opts = {}) {
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-9999px';
  holder.style.top = '0';
  holder.style.width = opts.width || '794px'; // A4 @96dpi
  holder.style.background = '#fff';
  holder.innerHTML = htmlString;
  document.body.appendChild(holder);
  try {
    await exportElementToPDF(holder, filename, opts);
  } finally {
    document.body.removeChild(holder);
  }
}
