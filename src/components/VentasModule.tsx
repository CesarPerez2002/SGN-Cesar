import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { sgnApi } from '../api/client.ts';
import {
  calculateLineTotal,
  calculateOrderTotals,
  formatCurrency,
  formatDateTime,
  validateSaleCart,
} from '../shared/businessLogic.ts';
import type {
  Categoria,
  Cliente,
  MetodoPago,
  ModuloId,
  Producto,
  RolUsuario,
  Venta,
} from '../shared/types.ts';
import { motion } from 'motion/react';
import { FacturaModal } from './FacturaModal.tsx';
import {
  AnimatedModal,
  AnimatedNotice,
  AnimatedTabPanel,
  SPRING_SNAPPY,
} from './MotionPrimitives.tsx';

interface VentasModuleProps {
  sales: Venta[];
  products: Producto[];
  categories: Categoria[];
  customers: Cliente[];
  userRole: RolUsuario;
  onNavigate: (moduleId: ModuloId) => void;
  onDataChanged: () => Promise<void>;
}

interface CartLine {
  productId: number;
  quantity: number;
}

export function VentasModule({
  sales,
  products,
  categories,
  customers,
  userRole,
  onNavigate,
  onDataChanged,
}: VentasModuleProps) {
  const isAdmin = userRole === 'Administrador';
  const [activeTab, setActiveTab] = useState<'nueva' | 'historial'>('nueva');
  const [productQuery, setProductQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [customerId, setCustomerId] = useState<number>(customers[0]?.id ?? 0);

  useEffect(() => {
    if (customers.length > 0 && !customers.some((c) => c.id === customerId)) {
      setCustomerId(customers[0].id);
    } else if (customers.length === 0 && customerId !== 0) {
      setCustomerId(0);
    }
  }, [customers, customerId]);

  const [paymentMethod, setPaymentMethod] = useState<MetodoPago>('Efectivo');
  const [includeTax, setIncludeTax] = useState<boolean>(true);
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successSale, setSuccessSale] = useState<Venta | null>(null);

  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedInvoiceSale, setSelectedInvoiceSale] = useState<Venta | null>(null);

  // Quick customer creation modal
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [qcName, setQcName] = useState('');
  const [qcTaxId, setQcTaxId] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [qcAddress, setQcAddress] = useState('');
  const [qcSaving, setQcSaving] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.active) return false;
      if (categoryFilter !== 'all' && String(p.categoryId) !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.categoryName ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, productQuery, categoryFilter]);

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const product = productsById.get(line.productId);
        if (!product) return null;
        return {
          ...line,
          product,
          lineTotal: calculateLineTotal(line.quantity, product.salePrice),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cart, productsById]);

  const totals = useMemo(() => {
    return calculateOrderTotals(
      cartDetails.map((d) => ({ quantity: d.quantity, unitPrice: d.product.salePrice })),
      includeTax,
    );
  }, [cartDetails, includeTax]);

  const filteredSales = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.folio.toLowerCase().includes(q) ||
        (s.invoiceNumber ?? '').toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.userName.toLowerCase().includes(q),
    );
  }, [sales, historyQuery]);

  function addProductToCart(product: Producto) {
    setError(null);
    setSuccessSale(null);
    if (product.stock <= 0) {
      setError(`"${product.name}" se encuentra agotado.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stock) {
          setError(
            `No puede agregar más unidades de "${product.name}". Existencia máxima: ${product.stock}.`,
          );
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { productId: product.id, quantity: 1 }];
    });
  }

  function updateQuantity(productId: number, nextQty: number) {
    setError(null);
    const product = productsById.get(productId);
    if (!product) return;

    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    if (nextQty > product.stock) {
      setError(
        `Cantidad solicitada excede la existencia de "${product.name}" (${product.stock} disponibles).`,
      );
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: nextQty } : item,
      ),
    );
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  async function handleQuickCustomerSubmit(e: FormEvent) {
    e.preventDefault();
    setQcError(null);
    setQcSaving(true);
    try {
      const created = await sgnApi.createCustomer({
        name: qcName,
        taxId: qcTaxId,
        phone: qcPhone,
        email: qcEmail,
        address: qcAddress,
      });
      await onDataChanged();
      setCustomerId(created.id);
      setQuickCustOpen(false);
      setQcName('');
      setQcTaxId('');
      setQcPhone('');
      setQcEmail('');
      setQcAddress('');
      setError(null);
    } catch (err) {
      setQcError(err instanceof Error ? err.message : 'No se pudo registrar el cliente.');
    } finally {
      setQcSaving(false);
    }
  }

  async function handleSubmitSale() {
    setError(null);
    setSuccessSale(null);

    if (!customerId || !customers.some((c) => c.id === customerId)) {
      setError('Seleccione o registre un cliente mediante "+ Cliente rápido" para emitir la factura.');
      return;
    }

    const validationError = validateSaleCart(cart, productsById);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const createdSale = await sgnApi.createSale({
        customerId,
        paymentMethod,
        includeTax,
        notes,
        items: cart,
      });
      setCart([]);
      setNotes('');
      setSuccessSale(createdSale);
      setSelectedInvoiceSale(createdSale);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar la venta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Vistas del módulo de ventas"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1"
        >
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
            Nueva venta
          </button>
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
            Facturas y ventas ({sales.length})
          </button>
        </div>
      </div>

      <AnimatedTabPanel tabKey={activeTab}>
      {activeTab === 'nueva' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Catalog Selection */}
          <section className="xl:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Buscar producto por nombre o SKU..."
                  aria-label="Buscar producto para venta"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar catálogo por categoría"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {products.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Package className="w-9 h-9 text-slate-300 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    No hay productos registrados en el inventario
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Agregue sus categorías y artículos en el módulo de Inventario para comenzar a
                    vender y emitir facturas.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onNavigate('inventario')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-medium text-white hover:from-emerald-700 hover:to-teal-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ir a Inventario</span>
                  </button>
                )}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No se encontraron productos activos con los filtros actuales.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-3 px-4">Producto</th>
                      <th className="py-3 px-4 text-right">Existencia</th>
                      <th className="py-3 px-4 text-right">Precio</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredProducts.map((product) => {
                      const inCartQty =
                        cart.find((c) => c.productId === product.id)?.quantity ?? 0;
                      const outOfStock = product.stock <= 0;
                      return (
                        <tr key={product.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{product.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              <span className="font-mono">{product.sku}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{product.categoryName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={
                                outOfStock
                                  ? 'text-red-700 font-medium'
                                  : product.stock <= product.minStock
                                    ? 'text-amber-700 font-medium'
                                    : 'text-slate-700'
                              }
                            >
                              {product.stock}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                            {formatCurrency(product.salePrice)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              disabled={outOfStock}
                              onClick={() => addProductToCart(product)}
                              aria-label={`Agregar ${product.name} a la venta`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 hover:border-blue-500 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{inCartQty > 0 ? `Agregar (${inCartQty})` : 'Agregar'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Checkout / Sale Ticket Panel */}
          <section className="xl:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Detalle de venta y facturación
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {cartDetails.reduce((sum, l) => sum + l.quantity, 0)} unidades
              </span>
            </div>

            <AnimatedNotice visible={Boolean(error)} noticeKey={error ?? 'sale-error'}>
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            </AnimatedNotice>

            <AnimatedNotice
              visible={Boolean(successSale)}
              noticeKey={successSale ? `sale-ok-${successSale.id}` : 'sale-ok'}
            >
              {successSale && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Factura <strong className="font-mono">{successSale.invoiceNumber}</strong>{' '}
                      generada. Existencias actualizadas.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceSale(successSale)}
                    className="font-medium text-emerald-800 underline hover:text-emerald-950 whitespace-nowrap cursor-pointer"
                  >
                    Abrir factura
                  </button>
                </div>
              )}
            </AnimatedNotice>

            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="sale-customer"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Cliente
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQcError(null);
                      setQuickCustOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Cliente rápido</span>
                  </button>
                </div>
                <select
                  id="sale-customer"
                  value={customerId}
                  onChange={(e) => setCustomerId(Number(e.target.value))}
                  disabled={customers.length === 0}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  {customers.length === 0 ? (
                    <option value={0}>Sin clientes registrados — use "Cliente rápido"</option>
                  ) : (
                    customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.taxId ? `(${c.taxId})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="sale-payment"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Método de pago
                </label>
                <select
                  id="sale-payment"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as MetodoPago)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            {/* Cart Lines */}
            {cartDetails.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 py-8 px-4 text-center">
                <ShoppingBag className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">Sin productos seleccionados</p>
                <p className="text-xs text-slate-500 mt-1">
                  Seleccione productos del catálogo para calcular el importe de la factura.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border-y border-slate-200 max-h-72 overflow-y-auto">
                {cartDetails.map((line) => (
                  <div key={line.productId} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {line.product.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        {formatCurrency(line.product.salePrice)} c/u · Disp: {line.product.stock}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.productId, line.quantity - 1)}
                        aria-label={`Disminuir cantidad de ${line.product.name}`}
                        className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={line.product.stock}
                        value={line.quantity}
                        onChange={(e) =>
                          updateQuantity(line.productId, Math.trunc(Number(e.target.value)))
                        }
                        aria-label={`Cantidad de ${line.product.name}`}
                        className="w-12 text-center font-mono text-sm border border-slate-300 rounded py-1 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.productId, line.quantity + 1)}
                        aria-label={`Aumentar cantidad de ${line.product.name}`}
                        className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.productId)}
                        aria-label={`Quitar ${line.product.name}`}
                        className="ml-1 p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="w-24 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatCurrency(line.lineTotal)}
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
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Calcular ISV (15%)</span>
              </label>

              <div>
                <label
                  htmlFor="sale-notes"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Observaciones (opcional)
                </label>
                <input
                  id="sale-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Referencia de entrega o condición..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{includeTax ? 'ISV (15%)' : 'ISV (Exento)'}</span>
                <span className="font-mono tabular-nums">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-slate-900 pt-2 border-t border-slate-100">
                <span>Total a cobrar</span>
                <span className="font-mono tabular-nums text-blue-800">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>

            <motion.button
              type="button"
              disabled={submitting || cartDetails.length === 0}
              whileHover={submitting || cartDetails.length === 0 ? undefined : { scale: 1.015 }}
              whileTap={submitting || cartDetails.length === 0 ? undefined : { scale: 0.97 }}
              transition={SPRING_SNAPPY}
              onClick={handleSubmitSale}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-4 h-4" />
              <span>{submitting ? 'Generando factura...' : 'Confirmar venta y generar factura'}</span>
            </motion.button>
          </section>
        </div>
      ) : (
        /* Historial de Facturas y Ventas */
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Buscar por factura, folio, cliente..."
                aria-label="Buscar en historial de ventas"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-500 tabular-nums">
              {filteredSales.length} {filteredSales.length === 1 ? 'factura' : 'facturas'}
            </p>
          </div>

          {sales.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Receipt className="w-9 h-9 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Aún no se han emitido facturas
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Registre una venta en la pestaña "Nueva venta" para generar su primera factura.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('nueva')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-medium text-white hover:from-emerald-700 hover:to-teal-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva venta</span>
              </button>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay facturas que coincidan con el criterio de búsqueda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-3 px-5">Factura</th>
                    <th className="py-3 px-4">Folio</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Pago</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                        {sale.invoiceNumber || sale.folio}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {sale.folio}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTime(sale.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{sale.customerName}</td>
                      <td className="py-3 px-4 text-slate-600">{sale.paymentMethod}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(sale.total)}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceSale(sale)}
                          aria-label={`Ver factura ${sale.invoiceNumber || sale.folio}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver factura</span>
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
      </AnimatedTabPanel>

      {/* Quick Customer Modal */}
      <AnimatedModal
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        labelledBy="quick-cust-title"
        maxWidthClass="max-w-md"
      >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3
                id="quick-cust-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                Registro rápido de cliente
              </h3>
              <button
                type="button"
                onClick={() => setQuickCustOpen(false)}
                aria-label="Cerrar registro rápido de cliente"
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCustomerSubmit} className="p-6 space-y-4">
              {qcError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{qcError}</span>
                </div>
              )}

              <div>
                <label htmlFor="qc-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre o razón social *
                </label>
                <input
                  id="qc-name"
                  type="text"
                  required
                  value={qcName}
                  onChange={(e) => setQcName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="qc-rtn" className="block text-xs font-medium text-slate-700 mb-1">
                    RTN
                  </label>
                  <input
                    id="qc-rtn"
                    type="text"
                    value={qcTaxId}
                    onChange={(e) => setQcTaxId(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="qc-phone"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Teléfono *
                  </label>
                  <input
                    id="qc-phone"
                    type="tel"
                    required
                    value={qcPhone}
                    onChange={(e) => setQcPhone(e.target.value)}
                    placeholder="9999-0000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="qc-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  id="qc-email"
                  type="email"
                  value={qcEmail}
                  onChange={(e) => setQcEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="qc-address"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Dirección
                </label>
                <input
                  id="qc-address"
                  type="text"
                  value={qcAddress}
                  onChange={(e) => setQcAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setQuickCustOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={qcSaving}
                  className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-medium text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  {qcSaving ? 'Guardando...' : 'Guardar y seleccionar'}
                </button>
              </div>
            </form>
      </AnimatedModal>

      {/* Invoice Modal */}
      <FacturaModal
        sale={selectedInvoiceSale}
        onClose={() => setSelectedInvoiceSale(null)}
      />
    </div>
  );
}
