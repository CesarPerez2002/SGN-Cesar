import type {
  Categoria,
  Cliente,
  Compra,
  DatosNegocio,
  EstadoCompra,
  MetodoPago,
  Producto,
  Proveedor,
  ResumenDashboard,
  RolUsuario,
  Usuario,
  Venta,
} from '../shared/types.ts';

const TOKEN_STORAGE_KEY = 'sgn_auth_token';

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Error de comunicación con el servidor (${response.status}).`;
    throw new Error(message);
  }

  return data as T;
}

export const sgnApi = {
  getPublicBusinessInfo() {
    return apiRequest<{ businessName: string }>('/api/public/business-info');
  },
  login(identifier: string, password: string) {
    return apiRequest<{ token: string; user: Usuario }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },
  getMe() {
    return apiRequest<{ user: Usuario }>('/api/auth/me');
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  getBusinessProfile() {
    return apiRequest<DatosNegocio>('/api/business-profile');
  },
  updateBusinessProfile(payload: Partial<DatosNegocio>) {
    return apiRequest<DatosNegocio>('/api/business-profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  getDashboard() {
    return apiRequest<ResumenDashboard>('/api/dashboard');
  },

  // Categorías
  listCategories() {
    return apiRequest<Categoria[]>('/api/categories');
  },
  createCategory(payload: { name: string; description: string }) {
    return apiRequest<Categoria>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateCategory(id: number, payload: { name: string; description: string }) {
    return apiRequest<Categoria>(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteCategory(id: number) {
    return apiRequest<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' });
  },

  // Productos
  listProducts() {
    return apiRequest<Producto[]>('/api/products');
  },
  createProduct(payload: {
    sku: string;
    name: string;
    description: string;
    categoryId: number;
    salePrice: number;
    costPrice: number;
    stock: number;
    minStock: number;
    active: boolean;
  }) {
    return apiRequest<Producto>('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateProduct(
    id: number,
    payload: {
      sku: string;
      name: string;
      description: string;
      categoryId: number;
      salePrice: number;
      costPrice: number;
      stock: number;
      minStock: number;
      active: boolean;
    },
  ) {
    return apiRequest<Producto>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Clientes
  listCustomers() {
    return apiRequest<Cliente[]>('/api/customers');
  },
  createCustomer(payload: {
    name: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }) {
    return apiRequest<Cliente>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateCustomer(
    id: number,
    payload: {
      name: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ) {
    return apiRequest<Cliente>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Proveedores
  listSuppliers() {
    return apiRequest<Proveedor[]>('/api/suppliers');
  },
  createSupplier(payload: {
    companyName: string;
    contactName: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }) {
    return apiRequest<Proveedor>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateSupplier(
    id: number,
    payload: {
      companyName: string;
      contactName: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ) {
    return apiRequest<Proveedor>(`/api/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Ventas
  listSales() {
    return apiRequest<Venta[]>('/api/sales');
  },
  createSale(payload: {
    customerId: number;
    paymentMethod: MetodoPago;
    includeTax: boolean;
    notes?: string;
    items: Array<{ productId: number; quantity: number }>;
  }) {
    return apiRequest<Venta>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Compras
  listPurchases() {
    return apiRequest<Compra[]>('/api/purchases');
  },
  createPurchase(payload: {
    supplierId: number;
    status: EstadoCompra;
    includeTax: boolean;
    notes?: string;
    items: Array<{ productId: number; quantity: number; unitCost: number }>;
  }) {
    return apiRequest<Compra>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  confirmPurchase(id: number) {
    return apiRequest<Compra>(`/api/purchases/${id}/confirm`, {
      method: 'POST',
    });
  },

  // Usuarios
  listUsers() {
    return apiRequest<Usuario[]>('/api/users');
  },
  createUser(payload: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: RolUsuario;
    active: boolean;
  }) {
    return apiRequest<Usuario>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateUser(
    id: number,
    payload: {
      fullName: string;
      username: string;
      email: string;
      password?: string;
      role: RolUsuario;
      active: boolean;
    },
  ) {
    return apiRequest<Usuario>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};
