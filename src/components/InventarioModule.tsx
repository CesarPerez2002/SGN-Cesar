import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderPlus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { sgnApi } from '../api/client.ts';
import { formatCurrency, getStockStatus } from '../shared/businessLogic.ts';
import type { Categoria, Producto, RolUsuario } from '../shared/types.ts';

interface InventarioModuleProps {
  products: Producto[];
  categories: Categoria[];
  userRole: RolUsuario;
  onDataChanged: () => Promise<void>;
}

export function InventarioModule({
  products,
  categories,
  userRole,
  onDataChanged,
}: InventarioModuleProps) {
  const isAdmin = userRole === 'Administrador';
  const [activeTab, setActiveTab] = useState<'productos' | 'categorias'>('productos');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState<number>(categories[0]?.id ?? 0);
  const [prodSalePrice, setProdSalePrice] = useState('0');
  const [prodCostPrice, setProdCostPrice] = useState('0');
  const [prodStock, setProdStock] = useState('0');
  const [prodMinStock, setProdMinStock] = useState('5');
  const [prodActive, setProdActive] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Categoria | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && String(p.categoryId) !== categoryFilter) return false;
      const status = getStockStatus(p.stock, p.minStock);
      if (stockFilter === 'low' && status === 'Óptimo') return false;
      if (stockFilter === 'out' && status !== 'Agotado') return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.categoryName ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, query, categoryFilter, stockFilter]);

  function openNewProduct() {
    if (categories.length === 0) {
      setActiveTab('categorias');
      openNewCategory();
      return;
    }
    setEditingProduct(null);
    setProdSku('');
    setProdName('');
    setProdDesc('');
    setProdCategoryId(categories[0]?.id ?? 0);
    setProdSalePrice('0');
    setProdCostPrice('0');
    setProdStock('0');
    setProdMinStock('5');
    setProdActive(true);
    setError(null);
    setProductModalOpen(true);
  }

  function openEditProduct(p: Producto) {
    setEditingProduct(p);
    setProdSku(p.sku);
    setProdName(p.name);
    setProdDesc(p.description);
    setProdCategoryId(p.categoryId);
    setProdSalePrice(String(p.salePrice));
    setProdCostPrice(String(p.costPrice));
    setProdStock(String(p.stock));
    setProdMinStock(String(p.minStock));
    setProdActive(p.active);
    setError(null);
    setProductModalOpen(true);
  }

  async function handleSaveProduct(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingProduct(true);
    try {
      const payload = {
        sku: prodSku,
        name: prodName,
        description: prodDesc,
        categoryId: prodCategoryId,
        salePrice: Number(prodSalePrice),
        costPrice: Number(prodCostPrice),
        stock: Number(prodStock),
        minStock: Number(prodMinStock),
        active: prodActive,
      };
      if (editingProduct) {
        await sgnApi.updateProduct(editingProduct.id, payload);
        setFeedback(`Producto "${prodName}" actualizado correctamente.`);
      } else {
        await sgnApi.createProduct(payload);
        setFeedback(`Producto "${prodName}" agregado al inventario.`);
      }
      setProductModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar producto.');
    } finally {
      setSavingProduct(false);
    }
  }

  function openNewCategory() {
    setEditingCategory(null);
    setCatName('');
    setCatDesc('');
    setError(null);
    setCategoryModalOpen(true);
  }

  function openEditCategory(c: Categoria) {
    setEditingCategory(c);
    setCatName(c.name);
    setCatDesc(c.description);
    setError(null);
    setCategoryModalOpen(true);
  }

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await sgnApi.updateCategory(editingCategory.id, { name: catName, description: catDesc });
        setFeedback(`Categoría "${catName}" actualizada.`);
      } else {
        await sgnApi.createCategory({ name: catName, description: catDesc });
        setFeedback(`Categoría "${catName}" creada.`);
      }
      setCategoryModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar categoría.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(category: Categoria) {
    setError(null);
    setFeedback(null);
    try {
      await sgnApi.deleteCategory(category.id);
      setFeedback(`Categoría "${category.name}" eliminada.`);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la categoría.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Secciones de inventario"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'productos'}
            onClick={() => setActiveTab('productos')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer whitespace-nowrap ${
              activeTab === 'productos'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Productos ({products.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'categorias'}
            onClick={() => setActiveTab('categorias')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md cursor-pointer whitespace-nowrap ${
              activeTab === 'categorias'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categorías ({categories.length})
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2.5">
            {activeTab === 'productos' ? (
              <button
                type="button"
                onClick={openNewProduct}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>{categories.length === 0 ? 'Crear categoría primero' : 'Nuevo producto'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openNewCategory}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Nueva categoría</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && !productModalOpen && !categoryModalOpen && (
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

      {activeTab === 'productos' ? (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full sm:w-72">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  aria-label="Buscar productos en inventario"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filtrar inventario por categoría"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {[
                { id: 'all' as const, label: 'Todos' },
                { id: 'low' as const, label: 'Bajo / Agotado' },
                { id: 'out' as const, label: 'Agotados' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStockFilter(opt.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    stockFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {products.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Package className="w-9 h-9 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Su inventario está vacío
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {categories.length === 0
                    ? 'Primero cree al menos una categoría para organizar sus artículos y luego registre su primer producto.'
                    : 'Registre su primer producto con su SKU, precio en Lempiras, existencia inicial y stock mínimo.'}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openNewProduct}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {categories.length === 0
                      ? 'Crear primera categoría'
                      : 'Registrar primer producto'}
                  </span>
                </button>
              )}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No se encontraron productos con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="py-3 pl-5 pr-3 whitespace-nowrap">SKU</th>
                    <th className="py-3 px-3">Producto</th>
                    <th className="py-3 px-3 whitespace-nowrap">Categoría</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Precio</th>
                    {isAdmin && <th className="py-3 px-3 text-right whitespace-nowrap">Costo</th>}
                    <th className="py-3 px-3 text-right whitespace-nowrap">Stock</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Mín.</th>
                    <th className="py-3 px-3 whitespace-nowrap">Nivel stock</th>
                    {isAdmin && <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(product.stock, product.minStock);
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/80">
                        <td className="py-3 pl-5 pr-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {product.sku}
                        </td>
                        <td className="py-3 px-3 max-w-[230px]">
                          <div className="font-medium text-slate-900 truncate">{product.name}</div>
                          {product.description && (
                            <div className="text-xs text-slate-500 truncate">
                              {product.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {product.categoryName}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                          {formatCurrency(product.salePrice)}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {formatCurrency(product.costPrice)}
                          </td>
                        )}
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {product.stock}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {product.minStock}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              status === 'Agotado'
                                ? 'text-red-700'
                                : status === 'Stock Bajo'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {status !== 'Óptimo' && (
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{status}</span>
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditProduct(product)}
                              aria-label={`Editar producto ${product.name}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        /* Categorías */
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {categories.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FolderPlus className="w-9 h-9 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  No hay categorías registradas
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Cree categorías para clasificar sus productos en inventario.
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openNewCategory}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Crear primera categoría</span>
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-6">Categoría</th>
                  <th className="py-3 px-4">Descripción</th>
                  <th className="py-3 px-4 text-right">Productos</th>
                  {isAdmin && <th className="py-3 px-6 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {categories.map((cat) => {
                  const count = products.filter((p) => p.categoryId === cat.id).length;
                  return (
                    <tr key={cat.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-6 font-medium text-slate-900">{cat.name}</td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {cat.description || 'Sin descripción'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {count}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-6 text-right whitespace-nowrap space-x-3">
                          <button
                            type="button"
                            onClick={() => openEditCategory(cat)}
                            aria-label={`Editar categoría ${cat.name}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            aria-label={`Eliminar categoría ${cat.name}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Product Create/Edit Modal */}
      {productModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3
                id="product-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editingProduct ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Cerrar formulario de producto"
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="prod-sku" className="block text-xs font-medium text-slate-700 mb-1">
                    Código SKU *
                  </label>
                  <input
                    id="prod-sku"
                    type="text"
                    required
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    placeholder="PROD-001"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="prod-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Nombre del producto *
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="prod-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Categoría *
                </label>
                <select
                  id="prod-cat"
                  value={prodCategoryId}
                  onChange={(e) => setProdCategoryId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-600 focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="prod-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Descripción
                </label>
                <input
                  id="prod-desc"
                  type="text"
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="prod-sale" className="block text-xs font-medium text-slate-700 mb-1">
                    Precio venta (L)
                  </label>
                  <input
                    id="prod-sale"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={prodSalePrice}
                    onChange={(e) => setProdSalePrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Costo compra (L)
                  </label>
                  <input
                    id="prod-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={prodCostPrice}
                    onChange={(e) => setProdCostPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-stock" className="block text-xs font-medium text-slate-700 mb-1">
                    Existencia
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    min="0"
                    required
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-min" className="block text-xs font-medium text-slate-700 mb-1">
                    Stock mínimo
                  </label>
                  <input
                    id="prod-min"
                    type="number"
                    min="0"
                    required
                    value={prodMinStock}
                    onChange={(e) => setProdMinStock(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prodActive}
                  onChange={(e) => setProdActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                <span>Producto activo para la venta</span>
              </label>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingProduct ? 'Guardando...' : 'Guardar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {categoryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3
                id="category-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editingCategory ? 'Editar categoría' : 'Nueva categoría'}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                aria-label="Cerrar formulario de categoría"
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="cat-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de la categoría *
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cat-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Descripción
                </label>
                <input
                  id="cat-desc"
                  type="text"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingCategory ? 'Guardando...' : 'Guardar categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
