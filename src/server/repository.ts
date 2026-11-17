import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateLineTotal,
  calculateOrderTotals,
  getStockStatus,
  roundCurrency,
  validatePurchaseCart,
  validateSaleCart,
} from '../shared/businessLogic.ts';
import type {
  Categoria,
  Cliente,
  Compra,
  DatosNegocio,
  DetalleCompra,
  DetalleVenta,
  EstadoCompra,
  MetodoPago,
  Producto,
  Proveedor,
  ResumenDashboard,
  RolUsuario,
  Usuario,
  UsuarioConPassword,
  Venta,
} from '../shared/types.ts';

interface DatabaseState {
  schemaVersion: number;
  nextIds: {
    user: number;
    category: number;
    product: number;
    customer: number;
    supplier: number;
    sale: number;
    saleItem: number;
    purchase: number;
    purchaseItem: number;
  };
  businessProfile: DatosNegocio;
  users: UsuarioConPassword[];
  categories: Categoria[];
  products: Producto[];
  customers: Cliente[];
  suppliers: Proveedor[];
  sales: Venta[];
  purchases: Compra[];
}

export class DomainError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function sanitizeUser(user: UsuarioConPassword): Usuario {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

function createCleanInitialState(): DatabaseState {
  const nowIso = new Date().toISOString();

  const users: UsuarioConPassword[] = [
    {
      id: 1,
      fullName: 'Administrador General',
      username: 'admin',
      email: 'admin@sgn-negocios.com',
      passwordHash: hashPassword('Admin123!'),
      role: 'Administrador',
      active: true,
      createdAt: nowIso,
      lastLoginAt: null,
    },
  ];

  const businessProfile: DatosNegocio = {
    businessName: 'Mi Negocio',
    legalName: '',
    rtn: '',
    phone: '',
    email: '',
    address: '',
    cai: '',
    invoiceFooter: 'Gracias por su compra.',
    updatedAt: nowIso,
  };

  return {
    schemaVersion: 2,
    nextIds: {
      user: 2,
      category: 1,
      product: 1,
      customer: 1,
      supplier: 1,
      sale: 1,
      saleItem: 1,
      purchase: 1,
      purchaseItem: 1,
    },
    businessProfile,
    users,
    categories: [],
    products: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
  };
}

export class SgnRepository {
  private filePath: string;
  private state: DatabaseState;

  constructor(dataDir: string = path.resolve(process.cwd(), 'data')) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'sgn-db.json');
    this.state = this.loadOrInitialize();
  }

  private loadOrInitialize(): DatabaseState {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (
          parsed &&
          parsed.schemaVersion === 2 &&
          Array.isArray(parsed.users) &&
          Array.isArray(parsed.products)
        ) {
          return parsed;
        }
      } catch {
        // Fallback to clean empty initial state
      }
    }
    const clean = createCleanInitialState();
    this.persistState(clean);
    return clean;
  }

  private persistState(stateToSave: DatabaseState = this.state): void {
    fs.writeFileSync(this.filePath, JSON.stringify(stateToSave, null, 2), 'utf-8');
  }

  getBusinessProfile(): DatosNegocio {
    return { ...this.state.businessProfile };
  }

  updateBusinessProfile(input: Partial<DatosNegocio>): DatosNegocio {
    const businessName = (input.businessName ?? '').trim();
    if (!businessName) {
      throw new DomainError('El nombre comercial del negocio es obligatorio.');
    }

    this.state.businessProfile = {
      businessName,
      legalName: (input.legalName ?? '').trim(),
      rtn: (input.rtn ?? '').trim().toUpperCase(),
      phone: (input.phone ?? '').trim(),
      email: (input.email ?? '').trim().toLowerCase(),
      address: (input.address ?? '').trim(),
      cai: (input.cai ?? '').trim().toUpperCase(),
      invoiceFooter: (input.invoiceFooter ?? '').trim() || 'Gracias por su compra.',
      updatedAt: new Date().toISOString(),
    };
    this.persistState();
    return { ...this.state.businessProfile };
  }

  authenticate(identifier: string, password: string): Usuario {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId || !password) {
      throw new DomainError(
        'Por favor ingrese su usuario o correo electrónico y su contraseña.',
        400,
      );
    }

    const found = this.state.users.find(
      (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId,
    );

    if (!found || !verifyPassword(password, found.passwordHash)) {
      throw new DomainError(
        'Las credenciales proporcionadas no son válidas. Verifique su usuario/correo y contraseña.',
        401,
      );
    }

    if (!found.active) {
      throw new DomainError(
        'Esta cuenta se encuentra desactivada. Contacte al Administrador del sistema.',
        403,
      );
    }

    found.lastLoginAt = new Date().toISOString();
    this.persistState();
    return sanitizeUser(found);
  }

  getUserById(id: number): Usuario | null {
    const found = this.state.users.find((u) => u.id === id);
    return found ? sanitizeUser(found) : null;
  }

  listUsers(): Usuario[] {
    return this.state.users.map(sanitizeUser);
  }

  createUser(input: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: RolUsuario;
    active: boolean;
  }): Usuario {
    const fullName = input.fullName.trim();
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();

    if (!fullName || !username || !email || !input.password) {
      throw new DomainError('Todos los campos del usuario son obligatorios.');
    }
    if (input.password.length < 6) {
      throw new DomainError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (this.state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new DomainError('El nombre de usuario ya se encuentra registrado.');
    }
    if (this.state.users.some((u) => u.email.toLowerCase() === email)) {
      throw new DomainError('El correo electrónico ya se encuentra registrado.');
    }

    const newUser: UsuarioConPassword = {
      id: this.state.nextIds.user++,
      fullName,
      username,
      email,
      passwordHash: hashPassword(input.password),
      role: input.role === 'Administrador' ? 'Administrador' : 'Cajero',
      active: Boolean(input.active),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    this.state.users.push(newUser);
    this.persistState();
    return sanitizeUser(newUser);
  }

  updateUser(
    id: number,
    actingUserId: number,
    input: {
      fullName: string;
      username: string;
      email: string;
      password?: string;
      role: RolUsuario;
      active: boolean;
    },
  ): Usuario {
    const user = this.state.users.find((u) => u.id === id);
    if (!user) throw new DomainError('Usuario no encontrado.', 404);

    const fullName = input.fullName.trim();
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();

    if (!fullName || !username || !email) {
      throw new DomainError('Nombre completo, usuario y correo son obligatorios.');
    }
    if (
      this.state.users.some(
        (u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase(),
      )
    ) {
      throw new DomainError('El nombre de usuario ya está en uso por otra cuenta.');
    }
    if (this.state.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) {
      throw new DomainError('El correo electrónico ya está en uso por otra cuenta.');
    }
    if (id === actingUserId && (!input.active || input.role !== 'Administrador')) {
      throw new DomainError(
        'No puede desactivar su propia cuenta ni retirar sus privilegios de Administrador.',
      );
    }

    user.fullName = fullName;
    user.username = username;
    user.email = email;
    user.role = input.role === 'Administrador' ? 'Administrador' : 'Cajero';
    user.active = Boolean(input.active);
    if (input.password && input.password.trim().length > 0) {
      if (input.password.trim().length < 6) {
        throw new DomainError('La nueva contraseña debe tener al menos 6 caracteres.');
      }
      user.passwordHash = hashPassword(input.password.trim());
    }

    this.persistState();
    return sanitizeUser(user);
  }

  listCategories(): Categoria[] {
    return [...this.state.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  createCategory(input: { name: string; description: string }): Categoria {
    const name = input.name.trim();
    if (!name) throw new DomainError('El nombre de la categoría es obligatorio.');
    if (this.state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new DomainError('Ya existe una categoría con ese nombre.');
    }
    const category: Categoria = {
      id: this.state.nextIds.category++,
      name,
      description: (input.description ?? '').trim(),
    };
    this.state.categories.push(category);
    this.persistState();
    return category;
  }

  updateCategory(id: number, input: { name: string; description: string }): Categoria {
    const category = this.state.categories.find((c) => c.id === id);
    if (!category) throw new DomainError('Categoría no encontrada.', 404);
    const name = input.name.trim();
    if (!name) throw new DomainError('El nombre de la categoría es obligatorio.');
    if (
      this.state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new DomainError('Ya existe otra categoría con ese nombre.');
    }
    category.name = name;
    category.description = (input.description ?? '').trim();
    this.persistState();
    return category;
  }

  deleteCategory(id: number): void {
    const index = this.state.categories.findIndex((c) => c.id === id);
    if (index === -1) throw new DomainError('Categoría no encontrada.', 404);
    const inUse = this.state.products.some((p) => p.categoryId === id);
    if (inUse) {
      throw new DomainError(
        'No se puede eliminar la categoría porque tiene productos asociados.',
      );
    }
    this.state.categories.splice(index, 1);
    this.persistState();
  }

  listProducts(): Producto[] {
    const categoryMap = new Map(this.state.categories.map((c) => [c.id, c.name]));
    return this.state.products
      .map((p) => ({
        ...p,
        categoryName: categoryMap.get(p.categoryId) ?? 'Sin categoría',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  createProduct(input: {
    sku: string;
    name: string;
    description: string;
    categoryId: number;
    salePrice: number;
    costPrice: number;
    stock: number;
    minStock: number;
    active?: boolean;
  }): Producto {
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      throw new DomainError('El código SKU y el nombre del producto son obligatorios.');
    }
    if (this.state.products.some((p) => p.sku.toUpperCase() === sku)) {
      throw new DomainError('Ya existe un producto con ese código SKU.');
    }
    const category = this.state.categories.find((c) => c.id === Number(input.categoryId));
    if (!category) {
      throw new DomainError('Seleccione una categoría válida.');
    }
    const salePrice = roundCurrency(Number(input.salePrice));
    const costPrice = roundCurrency(Number(input.costPrice));
    const stock = Math.trunc(Number(input.stock));
    const minStock = Math.trunc(Number(input.minStock));

    if (salePrice < 0 || costPrice < 0 || stock < 0 || minStock < 0) {
      throw new DomainError('Precios y existencias deben ser valores iguales o mayores a cero.');
    }

    const product: Producto = {
      id: this.state.nextIds.product++,
      sku,
      name,
      description: (input.description ?? '').trim(),
      categoryId: category.id,
      salePrice,
      costPrice,
      stock,
      minStock,
      active: input.active ?? true,
      updatedAt: new Date().toISOString(),
    };

    this.state.products.push(product);
    this.persistState();
    return { ...product, categoryName: category.name };
  }

  updateProduct(
    id: number,
    input: {
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
  ): Producto {
    const product = this.state.products.find((p) => p.id === id);
    if (!product) throw new DomainError('Producto no encontrado.', 404);

    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      throw new DomainError('El código SKU y el nombre del producto son obligatorios.');
    }
    if (this.state.products.some((p) => p.id !== id && p.sku.toUpperCase() === sku)) {
      throw new DomainError('Ya existe otro producto con ese código SKU.');
    }
    const category = this.state.categories.find((c) => c.id === Number(input.categoryId));
    if (!category) {
      throw new DomainError('Seleccione una categoría válida.');
    }

    const salePrice = roundCurrency(Number(input.salePrice));
    const costPrice = roundCurrency(Number(input.costPrice));
    const stock = Math.trunc(Number(input.stock));
    const minStock = Math.trunc(Number(input.minStock));

    if (salePrice < 0 || costPrice < 0 || stock < 0 || minStock < 0) {
      throw new DomainError('Precios y existencias deben ser valores iguales o mayores a cero.');
    }

    product.sku = sku;
    product.name = name;
    product.description = (input.description ?? '').trim();
    product.categoryId = category.id;
    product.salePrice = salePrice;
    product.costPrice = costPrice;
    product.stock = stock;
    product.minStock = minStock;
    product.active = Boolean(input.active);
    product.updatedAt = new Date().toISOString();

    this.persistState();
    return { ...product, categoryName: category.name };
  }

  listCustomers(): Cliente[] {
    return [...this.state.customers].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  createCustomer(input: {
    name: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }): Cliente {
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) {
      throw new DomainError('El nombre y teléfono del cliente son obligatorios.');
    }
    const customer: Cliente = {
      id: this.state.nextIds.customer++,
      name,
      taxId: (input.taxId ?? '').trim().toUpperCase(),
      phone,
      email: (input.email ?? '').trim().toLowerCase(),
      address: (input.address ?? '').trim(),
      createdAt: new Date().toISOString(),
    };
    this.state.customers.push(customer);
    this.persistState();
    return customer;
  }

  updateCustomer(
    id: number,
    input: {
      name: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ): Cliente {
    const customer = this.state.customers.find((c) => c.id === id);
    if (!customer) throw new DomainError('Cliente no encontrado.', 404);
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) {
      throw new DomainError('El nombre y teléfono del cliente son obligatorios.');
    }
    customer.name = name;
    customer.taxId = (input.taxId ?? '').trim().toUpperCase();
    customer.phone = phone;
    customer.email = (input.email ?? '').trim().toLowerCase();
    customer.address = (input.address ?? '').trim();
    this.persistState();
    return customer;
  }

  listSuppliers(): Proveedor[] {
    return [...this.state.suppliers].sort((a, b) =>
      a.companyName.localeCompare(b.companyName, 'es'),
    );
  }

  createSupplier(input: {
    companyName: string;
    contactName: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }): Proveedor {
    const companyName = input.companyName.trim();
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    if (!companyName || !contactName || !phone) {
      throw new DomainError(
        'La razón social, contacto principal y teléfono del proveedor son obligatorios.',
      );
    }
    const supplier: Proveedor = {
      id: this.state.nextIds.supplier++,
      companyName,
      contactName,
      taxId: (input.taxId ?? '').trim().toUpperCase(),
      phone,
      email: (input.email ?? '').trim().toLowerCase(),
      address: (input.address ?? '').trim(),
      createdAt: new Date().toISOString(),
    };
    this.state.suppliers.push(supplier);
    this.persistState();
    return supplier;
  }

  updateSupplier(
    id: number,
    input: {
      companyName: string;
      contactName: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ): Proveedor {
    const supplier = this.state.suppliers.find((s) => s.id === id);
    if (!supplier) throw new DomainError('Proveedor no encontrado.', 404);
    const companyName = input.companyName.trim();
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    if (!companyName || !contactName || !phone) {
      throw new DomainError(
        'La razón social, contacto principal y teléfono del proveedor son obligatorios.',
      );
    }
    supplier.companyName = companyName;
    supplier.contactName = contactName;
    supplier.taxId = (input.taxId ?? '').trim().toUpperCase();
    supplier.phone = phone;
    supplier.email = (input.email ?? '').trim().toLowerCase();
    supplier.address = (input.address ?? '').trim();
    this.persistState();
    return supplier;
  }

  listSales(): Venta[] {
    return [...this.state.sales].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  createSale(
    user: Usuario,
    input: {
      customerId: number;
      paymentMethod: MetodoPago;
      includeTax: boolean;
      notes?: string;
      items: Array<{ productId: number; quantity: number }>;
    },
  ): Venta {
    const customer = this.state.customers.find((c) => c.id === Number(input.customerId));
    if (!customer) {
      throw new DomainError('Debe seleccionar o registrar un cliente válido.');
    }

    const productsById = new Map(this.state.products.map((p) => [p.id, p]));
    const normalizedItems = (input.items ?? []).map((item) => ({
      productId: Number(item.productId),
      quantity: Math.trunc(Number(item.quantity)),
    }));

    const validationError = validateSaleCart(normalizedItems, productsById);
    if (validationError) {
      throw new DomainError(validationError);
    }

    const saleId = this.state.nextIds.sale++;
    const padded = String(saleId).padStart(4, '0');
    const folio = `VTA-${padded}`;
    const invoiceNumber = `FAC-${padded}`;
    const lineItems: DetalleVenta[] = [];

    for (const item of normalizedItems) {
      const product = productsById.get(item.productId)!;
      const lineTotal = calculateLineTotal(item.quantity, product.salePrice);
      lineItems.push({
        id: this.state.nextIds.saleItem++,
        saleId,
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.salePrice,
        lineTotal,
      });
    }

    const totals = calculateOrderTotals(
      lineItems.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
      Boolean(input.includeTax),
    );

    const nowIso = new Date().toISOString();
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId)!;
      product.stock -= item.quantity;
      product.updatedAt = nowIso;
    }

    const sale: Venta = {
      id: saleId,
      folio,
      invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerTaxId: customer.taxId,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      userId: user.id,
      userName: user.fullName,
      paymentMethod: input.paymentMethod ?? 'Efectivo',
      includeTax: Boolean(input.includeTax),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      notes: (input.notes ?? '').trim(),
      businessSnapshot: { ...this.state.businessProfile },
      createdAt: nowIso,
      items: lineItems,
    };

    this.state.sales.push(sale);
    this.persistState();
    return sale;
  }

  listPurchases(): Compra[] {
    return [...this.state.purchases].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  createPurchase(
    user: Usuario,
    input: {
      supplierId: number;
      status: EstadoCompra;
      includeTax: boolean;
      notes?: string;
      items: Array<{ productId: number; quantity: number; unitCost: number }>;
    },
  ): Compra {
    const supplier = this.state.suppliers.find((s) => s.id === Number(input.supplierId));
    if (!supplier) {
      throw new DomainError('Debe seleccionar un proveedor válido.');
    }

    const productsById = new Map(this.state.products.map((p) => [p.id, p]));
    const normalizedItems = (input.items ?? []).map((item) => ({
      productId: Number(item.productId),
      quantity: Math.trunc(Number(item.quantity)),
      unitCost: roundCurrency(Number(item.unitCost)),
    }));

    const validationError = validatePurchaseCart(normalizedItems);
    if (validationError) {
      throw new DomainError(validationError);
    }

    for (const item of normalizedItems) {
      if (!productsById.has(item.productId)) {
        throw new DomainError('Uno de los productos seleccionados no existe en el inventario.');
      }
    }

    const purchaseId = this.state.nextIds.purchase++;
    const folio = `CMP-${String(purchaseId).padStart(4, '0')}`;
    const status: EstadoCompra = input.status === 'Confirmada' ? 'Confirmada' : 'Pendiente';
    const nowIso = new Date().toISOString();

    const lineItems: DetalleCompra[] = normalizedItems.map((item) => {
      const product = productsById.get(item.productId)!;
      return {
        id: this.state.nextIds.purchaseItem++,
        purchaseId,
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineTotal: calculateLineTotal(item.quantity, item.unitCost),
      };
    });

    const totals = calculateOrderTotals(
      lineItems.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost })),
      Boolean(input.includeTax),
    );

    if (status === 'Confirmada') {
      for (const item of normalizedItems) {
        const product = productsById.get(item.productId)!;
        product.stock += item.quantity;
        product.costPrice = item.unitCost;
        product.updatedAt = nowIso;
      }
    }

    const purchase: Compra = {
      id: purchaseId,
      folio,
      supplierId: supplier.id,
      supplierName: supplier.companyName,
      userId: user.id,
      userName: user.fullName,
      status,
      includeTax: Boolean(input.includeTax),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      notes: (input.notes ?? '').trim(),
      createdAt: nowIso,
      confirmedAt: status === 'Confirmada' ? nowIso : null,
      items: lineItems,
    };

    this.state.purchases.push(purchase);
    this.persistState();
    return purchase;
  }

  confirmPurchase(id: number): Compra {
    const purchase = this.state.purchases.find((p) => p.id === id);
    if (!purchase) throw new DomainError('Compra no encontrada.', 404);
    if (purchase.status === 'Confirmada') {
      throw new DomainError('Esta compra ya fue confirmada previamente.');
    }

    const productsById = new Map(this.state.products.map((p) => [p.id, p]));
    const nowIso = new Date().toISOString();

    for (const item of purchase.items) {
      const product = productsById.get(item.productId);
      if (product) {
        product.stock += item.quantity;
        product.costPrice = item.unitCost;
        product.updatedAt = nowIso;
      }
    }

    purchase.status = 'Confirmada';
    purchase.confirmedAt = nowIso;
    this.persistState();
    return purchase;
  }

  getDashboardSummary(role: RolUsuario): ResumenDashboard {
    const products = this.listProducts();
    const lowStockProducts = products.filter(
      (p) => getStockStatus(p.stock, p.minStock) !== 'Óptimo',
    );
    const outOfStockCount = products.filter((p) => p.stock <= 0).length;
    const lowStockCount = products.filter(
      (p) => p.stock > 0 && p.stock <= p.minStock,
    ).length;

    const sales = this.listSales();
    const totalSalesAmount = roundCurrency(sales.reduce((sum, s) => sum + s.total, 0));

    const purchases = role === 'Administrador' ? this.listPurchases() : [];
    const totalPurchasesAmount = roundCurrency(
      purchases
        .filter((p) => p.status === 'Confirmada')
        .reduce((sum, p) => sum + p.total, 0),
    );
    const pendingPurchasesCount = purchases.filter((p) => p.status === 'Pendiente').length;

    return {
      totalSalesAmount,
      totalSalesCount: sales.length,
      totalPurchasesAmount,
      pendingPurchasesCount,
      totalProductsCount: products.length,
      lowStockCount,
      outOfStockCount,
      totalCustomersCount: this.state.customers.length,
      totalSuppliersCount: role === 'Administrador' ? this.state.suppliers.length : 0,
      lowStockProducts,
      recentSales: sales.slice(0, 5),
      recentPurchases: purchases.slice(0, 5),
    };
  }
}
