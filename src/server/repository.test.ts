import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SgnRepository } from './repository.ts';

function createTempRepo(): { repo: SgnRepository; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgn-test-'));
  const repo = new SgnRepository(dir);
  return {
    repo,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('SgnRepository starts cleanly with 1 Administrador and zero sample commercial records', () => {
  const { repo, cleanup } = createTempRepo();
  try {
    const users = repo.listUsers();
    assert.equal(users.length, 1);
    assert.equal(users[0].role, 'Administrador');
    assert.equal(repo.listCategories().length, 0);
    assert.equal(repo.listProducts().length, 0);
    assert.equal(repo.listCustomers().length, 0);
    assert.equal(repo.listSuppliers().length, 0);
    assert.equal(repo.listSales().length, 0);
    assert.equal(repo.listPurchases().length, 0);

    const admin = repo.authenticate('admin', 'Admin123!');
    assert.equal(admin.role, 'Administrador');
    assert.throws(() => repo.authenticate('admin', 'wrong-pass'), /no son válidas/);
  } finally {
    cleanup();
  }
});

test('SgnRepository supports manual creation, sale invoicing with FAC-0001 and stock updates', () => {
  const { repo, cleanup } = createTempRepo();
  try {
    const admin = repo.authenticate('admin', 'Admin123!');
    repo.updateBusinessProfile({
      businessName: 'Ferretería Honduras S.A.',
      legalName: 'Ferretería Honduras S.A. de C.V.',
      rtn: '08019999123456',
      phone: '2234-5678',
      email: 'ventas@ferreteriahn.com',
      address: 'Blvd. Morazán, Tegucigalpa',
      cai: 'A1B2C3-D4E5F6-01',
      invoiceFooter: 'Original: Cliente / Copia: Emisor',
    });

    const cat = repo.createCategory({ name: 'Herramientas', description: 'Equipo manual' });
    const prod = repo.createProduct({
      sku: 'HRR-01',
      name: 'Taladro Inalámbrico 20V',
      description: 'Incluye 2 baterías',
      categoryId: cat.id,
      salePrice: 2400,
      costPrice: 1700,
      stock: 10,
      minStock: 3,
      active: true,
    });
    const customer = repo.createCustomer({
      name: 'Constructora Maya',
      taxId: '08012000445566',
      phone: '9988-7766',
      email: 'compras@maya.hn',
      address: 'San Pedro Sula',
    });
    const supplier = repo.createSupplier({
      companyName: 'Importadora Industrial HN',
      contactName: 'Marco Polo',
      taxId: '08011988001122',
      phone: '2200-1122',
      email: 'pedidos@importadora.hn',
      address: 'Tegucigalpa',
    });

    const sale = repo.createSale(admin, {
      customerId: customer.id,
      paymentMethod: 'Efectivo',
      includeTax: true,
      items: [{ productId: prod.id, quantity: 2 }],
    });

    assert.equal(sale.folio, 'VTA-0001');
    assert.equal(sale.invoiceNumber, 'FAC-0001');
    assert.equal(sale.subtotal, 4800);
    assert.equal(sale.tax, 720);
    assert.equal(sale.total, 5520);
    assert.equal(sale.businessSnapshot.businessName, 'Ferretería Honduras S.A.');
    assert.equal(sale.businessSnapshot.rtn, '08019999123456');
    assert.equal(sale.customerTaxId, '08012000445566');

    const afterSaleProd = repo.listProducts().find((p) => p.id === prod.id)!;
    assert.equal(afterSaleProd.stock, 8);

    const pendingPurchase = repo.createPurchase(admin, {
      supplierId: supplier.id,
      status: 'Pendiente',
      includeTax: true,
      items: [{ productId: prod.id, quantity: 5, unitCost: 1650 }],
    });
    assert.equal(repo.listProducts().find((p) => p.id === prod.id)!.stock, 8);

    repo.confirmPurchase(pendingPurchase.id);
    assert.equal(repo.listProducts().find((p) => p.id === prod.id)!.stock, 13);
  } finally {
    cleanup();
  }
});
