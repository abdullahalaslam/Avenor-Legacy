import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportsCsv,
  calculateOrderTotal,
  canTransitionOrderStatus,
  computeAdminMetrics,
  computeFinancialReport,
  formatBDT,
  getStockAvailability,
  interpolateReadyText,
  validateOrderInput,
  type Expense,
  type Order,
  type StockVariant,
  type UserProfile,
} from './domain';

test('calculateOrderTotal multiplies unit price and quantity safely', () => {
  assert.equal(calculateOrderTotal(4500, 2), 9000);
  assert.equal(calculateOrderTotal(1250.5, 3), 3751.5);
  assert.equal(calculateOrderTotal(4500, 0), 0);
  assert.equal(calculateOrderTotal(-100, 2), 0);
});

test('getStockAvailability prevents negative availability and flags low stock', () => {
  assert.deepEqual(getStockAvailability(20, 4), {
    availableQty: 16,
    status: 'Available',
  });
  assert.deepEqual(getStockAvailability(8, 5), {
    availableQty: 3,
    status: 'Low Stock',
  });
  assert.deepEqual(getStockAvailability(4, 6), {
    availableQty: 0,
    status: 'Not Available',
  });
});

test('canTransitionOrderStatus enforces workflow and terminal locking', () => {
  assert.equal(canTransitionOrderStatus('New Order', 'Stock Checking').allowed, true);
  assert.equal(canTransitionOrderStatus('Stock Checking', 'Confirmed').allowed, true);
  assert.equal(canTransitionOrderStatus('Confirmed', 'Processing').allowed, true);
  assert.equal(canTransitionOrderStatus('Processing', 'Completed').allowed, true);
  assert.equal(canTransitionOrderStatus('New Order', 'Completed').allowed, false);
  assert.equal(canTransitionOrderStatus('Completed', 'Processing').allowed, false);
  assert.equal(canTransitionOrderStatus('Rejected', 'Confirmed').allowed, false);
});

test('interpolateReadyText substitutes all required template variables', () => {
  const rendered = interpolateReadyText(
    'Dear {customer_name}, order {order_id} for {product_code} totaling {total_price} is confirmed.',
    {
      customer_name: 'Tariq Rahman',
      order_id: 'AVL-20261119-0012',
      product_code: 'AVL-SHER-01',
      total_price: 18500,
    }
  );
  assert.equal(
    rendered,
    'Dear Tariq Rahman, order AVL-20261119-0012 for AVL-SHER-01 totaling ৳18,500 is confirmed.'
  );
});

test('computeAdminMetrics separates Processing Value from Completed Sales', () => {
  const orders: Order[] = [
    {
      id: '1',
      orderId: 'AVL-1',
      staffId: 's1',
      staffName: 'Ahsan',
      customerName: 'C1',
      contactNumber: '01700000001',
      deliveryAddress: 'Dhaka',
      productId: 'p1',
      productCode: 'AVL-01',
      productName: 'Sherwani',
      size: 'L',
      colour: 'Obsidian',
      quantity: 2,
      unitCostSnapshot: 5000,
      unitPriceSnapshot: 9000,
      totalPrice: 18000,
      note: '',
      status: 'Processing',
      rejectionReason: null,
      stockReserved: true,
      reservedVariantId: 'v1',
      isUnlistedProduct: false,
      createdAt: '2026-11-19T10:00:00.000Z',
      updatedAt: '2026-11-19T10:00:00.000Z',
    },
    {
      id: '2',
      orderId: 'AVL-2',
      staffId: 's1',
      staffName: 'Ahsan',
      customerName: 'C2',
      contactNumber: '01700000002',
      deliveryAddress: 'Dhaka',
      productId: 'p1',
      productCode: 'AVL-01',
      productName: 'Sherwani',
      size: 'M',
      colour: 'Ivory',
      quantity: 1,
      unitCostSnapshot: 5000,
      unitPriceSnapshot: 9000,
      totalPrice: 9000,
      note: '',
      status: 'Completed',
      rejectionReason: null,
      stockReserved: false,
      reservedVariantId: null,
      isUnlistedProduct: false,
      createdAt: '2026-11-19T11:00:00.000Z',
      updatedAt: '2026-11-19T11:00:00.000Z',
    },
  ];
  const users: UserProfile[] = [
    {
      id: 's2',
      fullName: 'Pending Staff',
      email: 'p@avenor.test',
      role: 'staff',
      status: 'pending',
      createdAt: '2026-11-19T09:00:00.000Z',
      updatedAt: '2026-11-19T09:00:00.000Z',
    },
  ];
  const variants: StockVariant[] = [
    {
      id: 'v1',
      productId: 'p1',
      productCode: 'AVL-01',
      size: 'L',
      colour: 'Obsidian',
      totalQty: 5,
      reservedQty: 2,
      availableQty: 3,
      lowStockThreshold: 5,
      status: 'Low Stock',
      updatedAt: '2026-11-19T10:00:00.000Z',
    },
  ];

  const metrics = computeAdminMetrics(orders, users, variants);
  assert.equal(metrics.processingOrders, 1);
  assert.equal(metrics.processingValue, 18000);
  assert.equal(metrics.completedOrders, 1);
  assert.equal(metrics.totalCompletedSales, 9000);
  assert.equal(metrics.pendingStaffApprovals, 1);
  assert.equal(metrics.lowStockProducts, 1);
});

test('computeFinancialReport computes sales, COGS, gross profit, expenses, and net profit separately', () => {
  const orders: Order[] = [
    {
      id: '1',
      orderId: 'AVL-100',
      staffId: 's1',
      staffName: 'Karim',
      customerName: 'Nabil',
      contactNumber: '01800000001',
      deliveryAddress: 'Banani, Dhaka',
      productId: 'p1',
      productCode: 'AVL-BLZ-01',
      productName: 'Tailored Blazer',
      size: 'M',
      colour: 'Black',
      quantity: 2,
      unitCostSnapshot: 4000,
      unitPriceSnapshot: 10000,
      totalPrice: 20000,
      note: '',
      status: 'Completed',
      rejectionReason: null,
      stockReserved: false,
      reservedVariantId: null,
      isUnlistedProduct: false,
      createdAt: '2026-11-19T09:00:00.000Z',
      updatedAt: '2026-11-19T09:00:00.000Z',
    },
    {
      id: '2',
      orderId: 'AVL-101',
      staffId: 's1',
      staffName: 'Karim',
      customerName: 'Samir',
      contactNumber: '01800000002',
      deliveryAddress: 'Gulshan, Dhaka',
      productId: 'p1',
      productCode: 'AVL-BLZ-01',
      productName: 'Tailored Blazer',
      size: 'L',
      colour: 'Black',
      quantity: 1,
      unitCostSnapshot: 4000,
      unitPriceSnapshot: 10000,
      totalPrice: 10000,
      note: '',
      status: 'Processing',
      rejectionReason: null,
      stockReserved: true,
      reservedVariantId: 'v1',
      isUnlistedProduct: false,
      createdAt: '2026-11-19T12:00:00.000Z',
      updatedAt: '2026-11-19T12:00:00.000Z',
    },
  ];
  const expenses: Expense[] = [
    {
      id: 'e1',
      title: 'Atelier Packaging',
      category: 'Packaging',
      amount: 2500,
      expenseDate: '2026-11-19T08:00:00.000Z',
      note: '',
      createdById: 'a1',
      createdByName: 'Admin',
      createdAt: '2026-11-19T08:00:00.000Z',
    },
  ];

  const report = computeFinancialReport(
    orders,
    expenses,
    'monthly',
    new Date('2026-11-19T15:00:00.000Z')
  );
  assert.equal(report.processingValue, 10000);
  assert.equal(report.completedSales, 20000);
  assert.equal(report.productCost, 8000);
  assert.equal(report.grossProfit, 12000);
  assert.equal(report.expensesTotal, 2500);
  assert.equal(report.netProfit, 9500);
  assert.equal(report.staffPerformance[0].completedSales, 20000);

  const csv = buildReportsCsv(report, orders, new Date('2026-11-19T15:00:00.000Z'));
  assert.ok(csv.includes('Completed Sales Revenue (BDT),20000'));
  assert.ok(csv.includes('Net Profit (BDT),9500'));
  assert.ok(csv.includes('"Banani, Dhaka"') === false); // address not in CSV, order ID is
  assert.ok(csv.includes('AVL-100'));
});

test('validateOrderInput catches missing required fields without substituting defaults', () => {
  const errors = validateOrderInput({
    customerName: '',
    contactNumber: '123',
    deliveryAddress: 'a',
    productCode: '',
    productName: '',
    size: '',
    colour: '',
    quantity: 0,
  });
  assert.ok(errors.customerName);
  assert.ok(errors.contactNumber);
  assert.ok(errors.deliveryAddress);
  assert.ok(errors.productCode);
  assert.ok(errors.size);
  assert.ok(errors.colour);
  assert.ok(errors.quantity);
  assert.equal(formatBDT(1500), '৳1,500');
});
