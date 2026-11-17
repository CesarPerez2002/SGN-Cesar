import type { EstadoStock, ModuloId, RolUsuario } from './types.ts';

export const TAX_RATE = 0.15;

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0 || unitPrice < 0) {
    return 0;
  }
  return roundCurrency(quantity * unitPrice);
}

export function calculateOrderTotals(
  items: ReadonlyArray<{ quantity: number; unitPrice: number }>,
  includeTax: boolean = true,
): { subtotal: number; tax: number; total: number } {
  const subtotal = roundCurrency(
    items.reduce((sum, item) => sum + calculateLineTotal(item.quantity, item.unitPrice), 0),
  );
  const tax = includeTax ? roundCurrency(subtotal * TAX_RATE) : 0;
  const total = roundCurrency(subtotal + tax);
  return { subtotal, tax, total };
}

export function getStockStatus(stock: number, minStock: number): EstadoStock {
  if (stock <= 0) return 'Agotado';
  if (stock <= minStock) return 'Stock Bajo';
  return 'Óptimo';
}

export function validateSaleCart(
  items: ReadonlyArray<{ productId: number; quantity: number }>,
  productsById: ReadonlyMap<number, { name: string; stock: number }>,
): string | null {
  if (items.length === 0) {
    return 'Debe agregar al menos un producto para registrar la venta.';
  }

  const aggregatedQuantities = new Map<number, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return 'Las cantidades de los productos deben ser números enteros mayores a cero.';
    }
    const prev = aggregatedQuantities.get(item.productId) ?? 0;
    aggregatedQuantities.set(item.productId, prev + item.quantity);
  }

  for (const [productId, requestedQty] of aggregatedQuantities.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      return 'Uno de los productos seleccionados ya no existe en el inventario.';
    }
    if (requestedQty > product.stock) {
      return `Existencia insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${requestedQty}.`;
    }
  }

  return null;
}

export function validatePurchaseCart(
  items: ReadonlyArray<{ productId: number; quantity: number; unitCost: number }>,
): string | null {
  if (items.length === 0) {
    return 'Debe agregar al menos un producto para registrar la compra.';
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return 'Las cantidades compradas deben ser números enteros mayores a cero.';
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost <= 0) {
      return 'El costo unitario de cada producto debe ser mayor a cero.';
    }
  }

  return null;
}

const ROLE_ACCESS_MAP: Record<RolUsuario, ReadonlyArray<ModuloId>> = {
  Administrador: [
    'resumen',
    'ventas',
    'compras',
    'inventario',
    'clientes',
    'proveedores',
    'usuarios',
    'configuracion',
  ],
  Cajero: ['resumen', 'ventas', 'inventario', 'clientes'],
};

export function canAccessModule(role: RolUsuario, moduleId: ModuloId): boolean {
  return ROLE_ACCESS_MAP[role].includes(moduleId);
}

export function getAllowedModules(role: RolUsuario): ReadonlyArray<ModuloId> {
  return ROLE_ACCESS_MAP[role];
}

export function getDefaultModuleForRole(_role: RolUsuario): ModuloId {
  return 'resumen';
}

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formattedNumber = new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `L ${formattedNumber}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-HN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
