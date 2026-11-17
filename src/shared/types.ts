export type RolUsuario = 'Administrador' | 'Cajero';

export type ModuloId =
  | 'resumen'
  | 'ventas'
  | 'compras'
  | 'inventario'
  | 'clientes'
  | 'proveedores'
  | 'usuarios'
  | 'configuracion';

export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia';
export type EstadoCompra = 'Pendiente' | 'Confirmada';
export type EstadoStock = 'Agotado' | 'Stock Bajo' | 'Óptimo';

export interface DatosNegocio {
  businessName: string;
  legalName: string;
  rtn: string;
  phone: string;
  email: string;
  address: string;
  cai: string;
  invoiceFooter: string;
  updatedAt: string;
}

export interface Usuario {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: RolUsuario;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UsuarioConPassword extends Usuario {
  passwordHash: string;
}

export interface Categoria {
  id: number;
  name: string;
  description: string;
}

export interface Producto {
  id: number;
  sku: string;
  name: string;
  description: string;
  categoryId: number;
  categoryName?: string;
  salePrice: number;
  costPrice: number;
  stock: number;
  minStock: number;
  active: boolean;
  updatedAt: string;
}

export interface Cliente {
  id: number;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface Proveedor {
  id: number;
  companyName: string;
  contactName: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface DetalleVenta {
  id: number;
  saleId: number;
  productId: number;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Venta {
  id: number;
  folio: string;
  invoiceNumber: string;
  customerId: number;
  customerName: string;
  customerTaxId: string;
  customerPhone: string;
  customerAddress: string;
  userId: number;
  userName: string;
  paymentMethod: MetodoPago;
  includeTax: boolean;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  businessSnapshot: DatosNegocio;
  createdAt: string;
  items: DetalleVenta[];
}

export interface DetalleCompra {
  id: number;
  purchaseId: number;
  productId: number;
  productSku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface Compra {
  id: number;
  folio: string;
  supplierId: number;
  supplierName: string;
  userId: number;
  userName: string;
  status: EstadoCompra;
  includeTax: boolean;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  createdAt: string;
  confirmedAt: string | null;
  items: DetalleCompra[];
}

export interface ResumenDashboard {
  totalSalesAmount: number;
  totalSalesCount: number;
  totalPurchasesAmount: number;
  pendingPurchasesCount: number;
  totalProductsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalCustomersCount: number;
  totalSuppliersCount: number;
  lowStockProducts: Producto[];
  recentSales: Venta[];
  recentPurchases: Compra[];
}
