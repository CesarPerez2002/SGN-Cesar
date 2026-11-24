import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, Printer, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../shared/businessLogic.ts';
import type { Venta } from '../shared/types.ts';
import { AnimatedModal } from './MotionPrimitives.tsx';

interface FacturaModalProps {
  sale: Venta | null;
  onClose: () => void;
}

export function FacturaModal({ sale, onClose }: FacturaModalProps) {
  const [renderedSale, setRenderedSale] = useState<Venta | null>(sale);

  useEffect(() => {
    if (sale) {
      setRenderedSale(sale);
    }
  }, [sale]);

  const activeSale = sale ?? renderedSale;
  if (!activeSale) return null;

  const biz = activeSale.businessSnapshot;
  const invoiceCode = activeSale.invoiceNumber || activeSale.folio;

  function handlePrint() {
    window.print();
  }

  function handleDownloadPdf() {
    if (!activeSale) return;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 44;
    let y = 50;

    // Header: Issuer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(biz.businessName || 'Mi Negocio', margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(29, 78, 216);
    doc.text(`FACTURA ${invoiceCode}`, pageWidth - margin, y, { align: 'right' });

    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);

    if (biz.legalName) {
      doc.text(biz.legalName, margin, y);
      y += 13;
    }
    if (biz.rtn) {
      doc.text(`RTN: ${biz.rtn}`, margin, y);
      y += 13;
    }
    if (biz.cai) {
      doc.text(`CAI: ${biz.cai}`, margin, y);
      y += 13;
    }
    if (biz.address) {
      doc.text(biz.address, margin, y);
      y += 13;
    }
    const contactParts = [biz.phone ? `Tel: ${biz.phone}` : '', biz.email].filter(Boolean);
    if (contactParts.length > 0) {
      doc.text(contactParts.join(' · '), margin, y);
      y += 13;
    }

    // Right side metadata
    let rightY = 66;
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Fecha: ${formatDateTime(activeSale.createdAt)}`, pageWidth - margin, rightY, {
      align: 'right',
    });
    rightY += 13;
    doc.text(`Folio venta: ${activeSale.folio}`, pageWidth - margin, rightY, { align: 'right' });
    rightY += 13;
    doc.text(`Pago: ${activeSale.paymentMethod}`, pageWidth - margin, rightY, { align: 'right' });
    rightY += 13;
    doc.text(`Atendió: ${activeSale.userName}`, pageWidth - margin, rightY, { align: 'right' });

    y = Math.max(y, rightY) + 16;

    // Divider
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    // Customer block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Datos del cliente', margin, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Cliente: ${activeSale.customerName}`, margin, y);
    y += 13;
    const custMeta = [
      activeSale.customerTaxId ? `RTN: ${activeSale.customerTaxId}` : 'RTN: Consumidor Final',
      activeSale.customerPhone ? `Tel: ${activeSale.customerPhone}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    doc.text(custMeta, margin, y);
    y += 13;
    if (activeSale.customerAddress) {
      doc.text(`Dirección: ${activeSale.customerAddress}`, margin, y);
      y += 13;
    }

    y += 12;

    // Table Header
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    doc.line(margin, y + 22, pageWidth - margin, y + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('SKU', margin + 8, y + 14);
    doc.text('Descripción', margin + 80, y + 14);
    doc.text('Cant.', pageWidth - margin - 175, y + 14, { align: 'right' });
    doc.text('P. Unit.', pageWidth - margin - 95, y + 14, { align: 'right' });
    doc.text('Importe', pageWidth - margin - 8, y + 14, { align: 'right' });
    y += 22;

    // Items
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    for (const item of activeSale.items) {
      y += 18;
      doc.setTextColor(71, 85, 105);
      doc.text(item.productSku, margin + 8, y);
      doc.setTextColor(15, 23, 42);
      const truncatedName =
        item.productName.length > 42 ? `${item.productName.slice(0, 39)}...` : item.productName;
      doc.text(truncatedName, margin + 80, y);
      doc.text(String(item.quantity), pageWidth - margin - 175, y, { align: 'right' });
      doc.text(formatCurrency(item.unitPrice), pageWidth - margin - 95, y, { align: 'right' });
      doc.text(formatCurrency(item.lineTotal), pageWidth - margin - 8, y, { align: 'right' });

      y += 8;
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y, pageWidth - margin, y);
    }

    y += 24;

    // Totals
    const labelX = pageWidth - margin - 150;
    const valX = pageWidth - margin - 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal:', labelX, y);
    doc.text(formatCurrency(activeSale.subtotal), valX, y, { align: 'right' });
    y += 16;

    doc.text(activeSale.includeTax ? 'ISV (15%):' : 'ISV (Exento):', labelX, y);
    doc.text(formatCurrency(activeSale.tax), valX, y, { align: 'right' });
    y += 18;

    doc.setDrawColor(203, 213, 225);
    doc.line(labelX, y - 8, pageWidth - margin, y - 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('TOTAL:', labelX, y + 4);
    doc.setTextColor(29, 78, 216);
    doc.text(formatCurrency(activeSale.total), valX, y + 4, { align: 'right' });

    y += 32;
    if (activeSale.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Observaciones: ${activeSale.notes}`, margin, y);
      y += 18;
    }

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(biz.invoiceFooter || 'Gracias por su compra.', pageWidth / 2, y + 10, {
      align: 'center',
    });

    doc.save(`Factura-${invoiceCode}.pdf`);
  }

  return (
    <AnimatedModal
      open={Boolean(sale)}
      onClose={onClose}
      labelledBy="invoice-modal-title"
      maxWidthClass="max-w-2xl"
      overlayClassName="bg-slate-950/60"
    >
        {/* Top Modal Controls (hidden on print) */}
        <div className="sgn-no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3
            id="invoice-modal-title"
            className="font-display text-base font-semibold text-slate-900"
          >
            Factura Comercial · <span className="font-mono text-blue-700">{invoiceCode}</span>
          </h3>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir factura</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-teal-600 px-3.5 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-teal-700 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar factura"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Canvas */}
        <div className="sgn-printable-invoice p-6 sm:p-8 space-y-6 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="space-y-1">
              <h4 className="font-display text-xl font-bold text-slate-900">
                {biz.businessName || 'Mi Negocio'}
              </h4>
              {biz.legalName && <p className="text-xs text-slate-600">{biz.legalName}</p>}
              {biz.rtn && (
                <p className="text-xs font-mono text-slate-700">RTN: {biz.rtn}</p>
              )}
              {biz.cai && (
                <p className="text-xs font-mono text-slate-600">CAI: {biz.cai}</p>
              )}
              {biz.address && <p className="text-xs text-slate-600">{biz.address}</p>}
              {(biz.phone || biz.email) && (
                <p className="text-xs text-slate-600">
                  {[biz.phone ? `Tel: ${biz.phone}` : '', biz.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <div className="sm:text-right space-y-1">
              <p className="text-xs font-medium text-slate-500">FACTURA</p>
              <p className="font-mono text-lg font-bold text-blue-700">{invoiceCode}</p>
              <p className="text-xs text-slate-600">{formatDateTime(activeSale.createdAt)}</p>
              <p className="text-xs text-slate-500 font-mono">Folio: {activeSale.folio}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 rounded-lg border border-slate-200 p-4">
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">Facturado a</p>
              <p className="text-slate-800 font-medium">{activeSale.customerName}</p>
              <p className="text-slate-600 font-mono">
                RTN: {activeSale.customerTaxId || 'Consumidor Final'}
              </p>
              {activeSale.customerAddress && (
                <p className="text-slate-600">{activeSale.customerAddress}</p>
              )}
            </div>
            <div className="space-y-1 sm:text-right">
              <p className="font-semibold text-slate-900">Detalles de operación</p>
              <p className="text-slate-600">Método de pago: {activeSale.paymentMethod}</p>
              <p className="text-slate-600">Atendido por: {activeSale.userName}</p>
              {activeSale.customerPhone && (
                <p className="text-slate-600">Tel: {activeSale.customerPhone}</p>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Descripción</th>
                  <th className="py-2.5 px-3 text-right">Cant.</th>
                  <th className="py-2.5 px-3 text-right">P. Unit.</th>
                  <th className="py-2.5 px-3 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeSale.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {item.productSku}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{item.productName}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-2">
            <div className="text-xs text-slate-500 max-w-xs">
              {activeSale.notes && (
                <p className="mb-1 text-slate-700">Observaciones: {activeSale.notes}</p>
              )}
              <p>{biz.invoiceFooter || 'Gracias por su compra.'}</p>
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-sm border-t sm:border-t-0 border-slate-200 pt-3 sm:pt-0">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatCurrency(activeSale.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{activeSale.includeTax ? 'ISV (15%)' : 'ISV (Exento)'}</span>
                <span className="font-mono tabular-nums">{formatCurrency(activeSale.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-base pt-2 border-t border-slate-200">
                <span>Total</span>
                <span className="font-mono tabular-nums text-blue-700">
                  {formatCurrency(activeSale.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
    </AnimatedModal>
  );
}
