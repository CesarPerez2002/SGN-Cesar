import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { sgnApi } from '../api/client.ts';
import {
  calculateLineTotal,
  calculateOrderTotals,
  formatCurrency,
  formatDateTime,
  validatePurchaseCart,
} from '../shared/businessLogic.ts';
import type { Compra, EstadoCompra, ModuloId, Producto, Proveedor } from '../shared/types.ts';

interface ComprasModuleProps {
  purchases: Compra[];
  products: Producto[];
  suppliers: Proveedor[];
  onNavigate: (moduleId: ModuloId) => void;
  onDataChanged: () => Promise<void>;
}

interface PurchaseCartLine {
  productId: number;
  quantity: number;
  unitCost: number;
}

export function ComprasModule({
  purchases,
  products,
  suppliers,
  onNavigate,
  onDataChanged,
}: ComprasModuleProps) {
  const [activeTab, setActiveTab] = useState<'nueva' | 'historial'>('historial');
  const [supplierId, setSupplierId] = useState<number>(() => suppliers[0]?.id ?? 0);

  useEffect(() => {
    if (suppliers.length > 0 && !suppliers.some((s) => s.id === supplierId)) {
      setSupplierId(suppliers[0].id);
    } else if (suppliers.length === 0 && supplierId !== 0) {
      setSupplierId(0);
    }
  }, [suppliers, supplierId]);

  const [status, setStatus] = useState<EstadoCompra>('Confirmada');
  const [includeTax, setIncludeTax] = useState<boolean>(true);
  const [notes, setNotes] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [cart, setCart] = useState<PurchaseCartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | EstadoCompra>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<Compra | null>(null);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    });
  }, [products, productQuery]);

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const product = productsById.get(line.productId);
        if (!product) return null;
        return {
          ...line,
          product,
          lineTotal: calculateLineTotal(line.quantity, line.unitCost),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cart, productsById]);

  const totals = useMemo(() => {
    return calculateOrderTotals(
      cartDetails.map((d) => ({ quantity: d.quantity, unitPrice: d.unitCost })),
      includeTax,
    );
  }, [cartDetails, includeTax]);

  const filteredPurchases = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.folio.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q)
      );
    });
  }, [purchases, statusFilter, historyQuery]);

  function addProductToPurchase(product: Producto) {
    setError(null);
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          quantity: 1,
          unitCost: product.costPrice > 0 ? product.costPrice : 100,
        },
      ];
    });
  }

  function updateLine(productId: number, patch: Partial<PurchaseCartLine>) {
    setError(null);
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, ...patch } : item)),
    );
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleSubmitPurchase() {
    setError(null);
    setFeedback(null);
    if (!supplierId || !suppliers.some((s) => s.id === supplierId)) {
      setError('Debe registrar y seleccionar un proveedor antes de crear la compra.');
      return;
    }

    const validationError = validatePurchaseCart(cart);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const created = await sgnApi.createPurchase({
        supplierId,
        status,
        includeTax,
        notes,
        items: cart,
      });
      setCart([]);
      setNotes('');
      setFeedback(
        created.status === 'Confirmada'
          ? `Compra ${created.folio} confirmada. Las existencias en inventario han sido incrementadas.`
          : `Orden de compra ${created.folio} guardada como pendiente.`,
      );
      await onDataChanged();
      setActiveTab('historial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar la compra.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReceipt(purchase: Compra) {
    setError(null);
    setFeedback(null);
    setConfirmingId(purchase.id);
    try {
      const updated = await sgnApi.confirmPurchase(purchase.id);
      setFeedback(
        `Compra ${updated.folio} confirmada. El inventario fue actualizado con la mercancía recibida.`,
      );
      await onDataChanged();
      if (selectedPurchase?.id === purchase.id) {
        setSelectedPurchase(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la compra.');
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Vistas del módulo de compras"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'historial'}
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'historial'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Historial de compras ({purchases.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'nueva'}
            onClick={() => setActiveTab('nueva')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'nueva'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Registrar compra
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {activeTab === 'nueva' ? (
        products.length === 0 || suppliers.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-4">
            <Truck className="w-9 h-9 text-slate-300 mx-auto" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Complete los catálogos previos para registrar compras
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Para registrar una orden de compra necesita contar con al menos un proveedor y un
                producto registrado en el inventario.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {suppliers.length === 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('proveedores')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-medium text-white hover:from-amber-700 hover:to-orange-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar proveedor</span>
                </button>
              )}
              {products.length === 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('inventario')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar productos</span>
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Products Picker */}
            <section className="xl:col-span-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Buscar artículo para abastecer..."
                    aria-label="Buscar producto para compra"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-3 px-4">Producto</th>
                      <th className="py-3 px-4 text-right">Stock actual</th>
                      <th className="py-3 px-4 text-right">Último costo</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{product.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{product.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {product.stock}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatCurrency(product.costPrice)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => addProductToPurchase(product)}
                            aria-label={`Agregar ${product.name} a la compra`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:border-blue-500 hover:text-blue-700 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Purchase Form Panel */}
            <section className="xl:col-span-6 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="border-b border-slate-200 pb-3.5">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Orden de compra a proveedor
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Al confirmar la compra, las existencias se suman automáticamente al inventario.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="purchase-supplier"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Proveedor
                  </label>
                  <select
                    id="purchase-supplier"
                    value={supplierId}
                    onChange={(e) => setSupplierId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="purchase-status"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Estado de recepción
                  </label>
                  <select
                    id="purchase-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EstadoCompra)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Confirmada">Confirmada (ingresar a inventario ahora)</option>
                    <option value="Pendiente">Pendiente (por recibir mercancía)</option>
                  </select>
                </div>
              </div>

              {cartDetails.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-8 px-4 text-center">
                  <Truck className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">Sin artículos en la orden</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Seleccione los productos adquiridos e indique cantidad y costo unitario.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto border-y border-slate-200 py-3">
                  {cartDetails.map((line) => (
                    <div
                      key={line.productId}
                      className="grid grid-cols-12 gap-2 items-center text-sm"
                    >
                      <div className="col-span-5 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{line.product.name}</p>
                        <p className="text-xs font-mono text-slate-500">{line.product.sku}</p>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.productId, {
                              quantity: Math.max(1, Math.trunc(Number(e.target.value))),
                            })
                          }
                          aria-label={`Cantidad comprada de ${line.product.name}`}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) =>
                            updateLine(line.productId, {
                              unitCost: Number(e.target.value),
                            })
                          }
                          aria-label={`Costo unitario de ${line.product.name}`}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(line.lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          aria-label={`Quitar ${line.product.name}`}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTax}
                    onChange={(e) => setIncludeTax(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>Aplicar ISV (15%)</span>
                </label>

                <div>
                  <label
                    htmlFor="purchase-notes"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Notas o número de factura del proveedor
                  </label>
                  <input
                    id="purchase-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Factura F-9821, entrega en bodega"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{includeTax ? 'ISV (15%)' : 'ISV (Exento)'}</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totals.tax)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-1.5 border-t border-slate-100">
                  <span>Total de compra</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totals.total)}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || cartDetails.length === 0}
                onClick={handleSubmitPurchase}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Guardando compra...'
                    : status === 'Confirmada'
                      ? 'Confirmar compra e ingresar stock'
                      : 'Guardar orden pendiente'}
                </span>
              </button>
            </section>
          </div>
        )
      ) : (
        /* Historial de Compras */
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64 sm:w-72">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Buscar por folio o proveedor..."
                  aria-label="Buscar compras"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['all', 'Pendiente', 'Confirmada'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all' ? 'Todas' : st === 'Pendiente' ? 'Pendientes' : 'Confirmadas'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('nueva')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-3.5 py-2 text-xs font-medium text-white hover:from-amber-700 hover:to-orange-700 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva compra</span>
            </button>
          </div>

          {purchases.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Truck className="w-9 h-9 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Aún no hay compras registradas
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Registre una compra a proveedor para abastecer sus existencias en inventario.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('nueva')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-medium text-white hover:from-amber-700 hover:to-orange-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar primera compra</span>
              </button>
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay compras registradas bajo el filtro actual.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-3 px-5">Folio</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Proveedor</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {purchase.folio}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTime(purchase.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {purchase.supplierName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            purchase.status === 'Confirmada'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {purchase.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(purchase.total)}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap space-x-3">
                        {purchase.status === 'Pendiente' && (
                          <button
                            type="button"
                            disabled={confirmingId === purchase.id}
                            onClick={() => handleConfirmReceipt(purchase)}
                            aria-label={`Confirmar recepción de compra ${purchase.folio}`}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {confirmingId === purchase.id
                                ? 'Confirmando...'
                                : 'Confirmar recepción'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPurchase(purchase)}
                          aria-label={`Ver detalle de compra ${purchase.folio}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver detalle</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Purchase Detail Modal */}
      {selectedPurchase && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3
                  id="purchase-modal-title"
                  className="font-display text-base font-semibold text-slate-900"
                >
                  Detalle de Compra · <span className="font-mono">{selectedPurchase.folio}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedPurchase.status} · {formatDateTime(selectedPurchase.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchase(null)}
                aria-label="Cerrar detalle de compra"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Proveedor</span>
                  <span className="font-medium text-slate-900">
                    {selectedPurchase.supplierName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Registrado por</span>
                  <span className="font-medium text-slate-900">{selectedPurchase.userName}</span>
                </div>
                {selectedPurchase.confirmedAt && (
                  <div>
                    <span className="text-slate-500 block">Fecha de confirmación</span>
                    <span className="font-medium text-slate-900">
                      {formatDateTime(selectedPurchase.confirmedAt)}
                    </span>
                  </div>
                )}
                {selectedPurchase.notes && (
                  <div>
                    <span className="text-slate-500 block">Notas</span>
                    <span className="font-medium text-slate-900">{selectedPurchase.notes}</span>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2.5 px-3">Producto</th>
                      <th className="py-2.5 px-3 text-right">Cant.</th>
                      <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                      <th className="py-2.5 px-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPurchase.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">{item.productName}</div>
                          <div className="font-mono text-slate-500">{item.productSku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(item.unitCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5 text-sm border-t border-slate-200 pt-4">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedPurchase.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{selectedPurchase.includeTax ? 'ISV (15%)' : 'ISV (Exento)'}</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedPurchase.tax)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 text-base pt-1.5">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedPurchase.total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              {selectedPurchase.status === 'Pendiente' && (
                <button
                  type="button"
                  disabled={confirmingId === selectedPurchase.id}
                  onClick={() => handleConfirmReceipt(selectedPurchase)}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer"
                >
                  Confirmar recepción e inventario
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPurchase(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
