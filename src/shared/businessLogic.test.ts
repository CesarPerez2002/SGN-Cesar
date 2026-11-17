import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLineTotal,
  calculateOrderTotals,
  canAccessModule,
  formatCurrency,
  getDefaultModuleForRole,
  getStockStatus,
  validatePurchaseCart,
  validateSaleCart,
} from './businessLogic.ts';

test('calculateLineTotal computes exact currency amounts', () => {
  assert.equal(calculateLineTotal(3, 19.99), 59.97);
  assert.equal(calculateLineTotal(0, 50), 0);
  assert.equal(calculateLineTotal(-2, 10), 0);
});

test('calculateOrderTotals calculates subtotal, 15% ISV tax, and total in HNL', () => {
  const withTax = calculateOrderTotals(
    [
      { quantity: 2, unitPrice: 100 },
      { quantity: 1, unitPrice: 50 },
    ],
    true,
  );
  assert.deepEqual(withTax, {
    subtotal: 250,
    tax: 37.5,
    total: 287.5,
  });

  const withoutTax = calculateOrderTotals([{ quantity: 2, unitPrice: 125.5 }], false);
  assert.deepEqual(withoutTax, {
    subtotal: 251,
    tax: 0,
    total: 251,
  });
});

test('formatCurrency formats amounts in Honduran Lempiras', () => {
  assert.equal(formatCurrency(1250.5), 'L 1,250.50');
  assert.equal(formatCurrency(0), 'L 0.00');
});

test('getStockStatus identifies Agotado, Stock Bajo, and Óptimo', () => {
  assert.equal(getStockStatus(0, 5), 'Agotado');
  assert.equal(getStockStatus(-1, 5), 'Agotado');
  assert.equal(getStockStatus(5, 5), 'Stock Bajo');
  assert.equal(getStockStatus(3, 5), 'Stock Bajo');
  assert.equal(getStockStatus(6, 5), 'Óptimo');
});

test('validateSaleCart enforces non-empty cart, positive integer quantities, and stock availability', () => {
  const inventory = new Map<number, { name: string; stock: number }>([
    [1, { name: 'Monitor 24"', stock: 4 }],
    [2, { name: 'Teclado Mecánico', stock: 10 }],
  ]);

  assert.ok(validateSaleCart([], inventory));
  assert.ok(validateSaleCart([{ productId: 1, quantity: 0 }], inventory));
  assert.ok(validateSaleCart([{ productId: 1, quantity: 5 }], inventory));
  assert.ok(
    validateSaleCart(
      [
        { productId: 1, quantity: 3 },
        { productId: 1, quantity: 2 },
      ],
      inventory,
    ),
  );
  assert.equal(
    validateSaleCart(
      [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 5 },
      ],
      inventory,
    ),
    null,
  );
});

test('validatePurchaseCart enforces positive quantities and costs', () => {
  assert.ok(validatePurchaseCart([]));
  assert.ok(validatePurchaseCart([{ productId: 1, quantity: 0, unitCost: 100 }]));
  assert.ok(validatePurchaseCart([{ productId: 1, quantity: 5, unitCost: 0 }]));
  assert.equal(validatePurchaseCart([{ productId: 1, quantity: 5, unitCost: 120 }]), null);
});

test('RBAC permissions distinguish Administrador and Cajero including configuracion', () => {
  assert.equal(canAccessModule('Administrador', 'compras'), true);
  assert.equal(canAccessModule('Administrador', 'proveedores'), true);
  assert.equal(canAccessModule('Administrador', 'usuarios'), true);
  assert.equal(canAccessModule('Administrador', 'configuracion'), true);

  assert.equal(canAccessModule('Cajero', 'ventas'), true);
  assert.equal(canAccessModule('Cajero', 'inventario'), true);
  assert.equal(canAccessModule('Cajero', 'clientes'), true);
  assert.equal(canAccessModule('Cajero', 'compras'), false);
  assert.equal(canAccessModule('Cajero', 'proveedores'), false);
  assert.equal(canAccessModule('Cajero', 'usuarios'), false);
  assert.equal(canAccessModule('Cajero', 'configuracion'), false);

  assert.equal(getDefaultModuleForRole('Administrador'), 'resumen');
  assert.equal(getDefaultModuleForRole('Cajero'), 'resumen');
});
