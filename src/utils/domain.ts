export type UserRole = 'admin' | 'staff';
export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type OrderStatus =
  | 'New Order'
  | 'Stock Checking'
  | 'Confirmed'
  | 'Processing'
  | 'Completed'
  | 'On Hold'
  | 'Rejected';

export type StockStatus = 'Available' | 'Low Stock' | 'Not Available';

export type StockMovementType =
  | 'initial'
  | 'add'
  | 'reduce'
  | 'reserve'
  | 'release'
  | 'complete';

export type ReadyTextCategory =
  | 'Order Received'
  | 'Stock Confirmed'
  | 'Processing'
  | 'Completed'
  | 'Rejected'
  | 'Delivery Update'
  | 'Thank You';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  orderCount?: number;
  completedSales?: number;
}

export interface Product {
  id: string;
  productCode: string;
  productName: string;
  category: string;
  description: string;
  productCost?: number; // Hidden from Staff
  sellingPrice: number;
  isActive: boolean;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  variants?: StockVariant[];
}

export interface StockVariant {
  id: string;
  productId: string;
  productCode: string;
  productName?: string;
  size: string;
  colour: string;
  totalQty: number;
  reservedQty: number;
  availableQty: number;
  lowStockThreshold: number;
  status: StockStatus;
  updatedAt: string;
}

export type StockActionLabel =
  | 'Initial'
  | 'Add'
  | 'Reduce'
  | 'Reserve'
  | 'Release'
  | 'Complete';

export interface StockMovement {
  id: string;
  variantId: string;
  productId?: string;
  productCode: string;
  productName: string;
  size: string;
  colour: string;
  actionType: StockActionLabel;
  movementType: StockMovementType;
  quantityDelta: number;
  previousAvailable: number;
  newAvailable: number;
  previousTotal: number;
  newTotal: number;
  previousReserved: number;
  newReserved: number;
  note: string;
  actorId: string;
  actorName: string;
  orderId?: string | null;
  clientRequestId?: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderId: string;
  staffId: string;
  staffName: string;
  customerName: string;
  contactNumber: string;
  deliveryAddress: string;
  productId: string | null;
  productCode: string;
  productName: string;
  size: string;
  colour: string;
  quantity: number;
  unitCostSnapshot: number;
  unitPriceSnapshot: number;
  totalPrice: number;
  note: string;
  status: OrderStatus;
  rejectionReason: string | null;
  stockReserved: boolean;
  reservedVariantId: string | null;
  isUnlistedProduct: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReadyTextTemplate {
  id: string;
  title: string;
  category: ReadyTextCategory;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  note: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientRole: UserRole | 'user';
  recipientUserId: string | null;
  type:
    | 'staff_signup'
    | 'new_order'
    | 'order_confirmed'
    | 'order_rejected'
    | 'order_completed'
    | 'order_status'
    | 'stock_update';
  title: string;
  message: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
  createdAt: string;
}

export interface AdminDashboardMetrics {
  totalOrders: number;
  newOrders: number;
  stockCheckingOrders: number;
  processingOrders: number;
  processingValue: number;
  completedOrders: number;
  rejectedOrders: number;
  totalCompletedSales: number;
  pendingStaffApprovals: number;
  lowStockProducts: number;
}

export interface StaffPerformanceRow {
  staffId: string;
  staffName: string;
  totalOrders: number;
  completedOrders: number;
  processingOrders: number;
  rejectedOrders: number;
  completedSales: number;
  processingValue: number;
}

export interface FinancialReportSummary {
  period: ReportPeriod;
  totalOrders: number;
  completedOrders: number;
  processingOrders: number;
  rejectedOrders: number;
  processingValue: number;
  completedSales: number;
  productCost: number;
  grossProfit: number;
  expensesTotal: number;
  netProfit: number;
  staffPerformance: StaffPerformanceRow[];
}

export const ORDER_STATUSES: OrderStatus[] = [
  'New Order',
  'Stock Checking',
  'Confirmed',
  'Processing',
  'Completed',
  'On Hold',
  'Rejected',
];

export const READY_TEXT_CATEGORIES: ReadyTextCategory[] = [
  'Order Received',
  'Stock Confirmed',
  'Processing',
  'Completed',
  'Rejected',
  'Delivery Update',
  'Thank You',
];

export const LOW_STOCK_DEFAULT_THRESHOLD = 5;

export function formatBDT(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `৳${safe.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateOrderTotal(unitPrice: number, quantity: number): number {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity)) return 0;
  if (unitPrice < 0 || quantity <= 0) return 0;
  return Math.round(unitPrice * quantity * 100) / 100;
}

export function getStockAvailability(
  totalQty: number,
  reservedQty: number,
  lowThreshold = LOW_STOCK_DEFAULT_THRESHOLD
): { availableQty: number; status: StockStatus } {
  const safeTotal = Math.max(0, Math.floor(totalQty));
  const safeReserved = Math.max(0, Math.floor(reservedQty));
  const availableQty = Math.max(0, safeTotal - safeReserved);

  if (availableQty <= 0) {
    return { availableQty: 0, status: 'Not Available' };
  }
  if (availableQty <= lowThreshold) {
    return { availableQty, status: 'Low Stock' };
  }
  return { availableQty, status: 'Available' };
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'New Order': ['Stock Checking', 'Confirmed', 'On Hold', 'Rejected'],
  'Stock Checking': ['Confirmed', 'On Hold', 'Rejected'],
  'On Hold': ['Stock Checking', 'Confirmed', 'Processing', 'Rejected'],
  Confirmed: ['Processing', 'On Hold', 'Rejected'],
  Processing: ['Completed', 'On Hold', 'Rejected'],
  Completed: [],
  Rejected: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: `Order is already in "${from}" status.` };
  }
  const nextList = ALLOWED_TRANSITIONS[from] ?? [];
  if (!nextList.includes(to)) {
    return {
      allowed: false,
      reason: `Cannot transition order directly from "${from}" to "${to}".`,
    };
  }
  return { allowed: true };
}

export function interpolateReadyText(
  templateBody: string,
  vars: {
    customer_name: string;
    order_id: string;
    product_code: string;
    total_price: number | string;
  }
): string {
  const formattedPrice =
    typeof vars.total_price === 'number'
      ? formatBDT(vars.total_price)
      : String(vars.total_price);

  return templateBody
    .replaceAll('{customer_name}', vars.customer_name || '')
    .replaceAll('{order_id}', vars.order_id || '')
    .replaceAll('{product_code}', vars.product_code || '')
    .replaceAll('{total_price}', formattedPrice);
}

export function computeAdminMetrics(
  orders: Order[],
  users: UserProfile[],
  variants: StockVariant[]
): AdminDashboardMetrics {
  let newOrders = 0;
  let stockCheckingOrders = 0;
  let processingOrders = 0;
  let processingValue = 0;
  let completedOrders = 0;
  let rejectedOrders = 0;
  let totalCompletedSales = 0;

  for (const o of orders) {
    if (o.status === 'New Order') newOrders += 1;
    else if (o.status === 'Stock Checking') stockCheckingOrders += 1;
    else if (o.status === 'Processing') {
      processingOrders += 1;
      processingValue += Number(o.totalPrice) || 0;
    } else if (o.status === 'Completed') {
      completedOrders += 1;
      totalCompletedSales += Number(o.totalPrice) || 0;
    } else if (o.status === 'Rejected') {
      rejectedOrders += 1;
    }
  }

  const pendingStaffApprovals = users.filter(
    (u) => u.role === 'staff' && u.status === 'pending'
  ).length;

  const lowStockProductCodes = new Set<string>();
  for (const v of variants) {
    if (v.status === 'Low Stock' || v.status === 'Not Available') {
      lowStockProductCodes.add(v.productCode);
    }
  }

  return {
    totalOrders: orders.length,
    newOrders,
    stockCheckingOrders,
    processingOrders,
    processingValue: Math.round(processingValue * 100) / 100,
    completedOrders,
    rejectedOrders,
    totalCompletedSales: Math.round(totalCompletedSales * 100) / 100,
    pendingStaffApprovals,
    lowStockProducts: lowStockProductCodes.size,
  };
}

export function isDateInPeriod(
  isoDate: string,
  period: ReportPeriod,
  referenceDate = new Date()
): boolean {
  if (period === 'all') return true;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;

  const refStart = new Date(referenceDate);
  refStart.setHours(0, 0, 0, 0);

  if (period === 'daily') {
    const dayEnd = new Date(refStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return d >= refStart && d < dayEnd;
  }

  if (period === 'weekly') {
    const weekStart = new Date(refStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const tomorrow = new Date(refStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d >= weekStart && d < tomorrow;
  }

  // monthly: current calendar month
  return (
    d.getFullYear() === referenceDate.getFullYear() &&
    d.getMonth() === referenceDate.getMonth()
  );
}

export function computeFinancialReport(
  orders: Order[],
  expenses: Expense[],
  period: ReportPeriod,
  referenceDate = new Date()
): FinancialReportSummary {
  const filteredOrders = orders.filter((o) =>
    isDateInPeriod(o.createdAt, period, referenceDate)
  );
  const filteredExpenses = expenses.filter((e) =>
    isDateInPeriod(e.expenseDate, period, referenceDate)
  );

  let completedOrders = 0;
  let processingOrders = 0;
  let rejectedOrders = 0;
  let processingValue = 0;
  let completedSales = 0;
  let productCost = 0;

  const staffMap = new Map<string, StaffPerformanceRow>();

  for (const o of filteredOrders) {
    let staffRow = staffMap.get(o.staffId);
    if (!staffRow) {
      staffRow = {
        staffId: o.staffId,
        staffName: o.staffName,
        totalOrders: 0,
        completedOrders: 0,
        processingOrders: 0,
        rejectedOrders: 0,
        completedSales: 0,
        processingValue: 0,
      };
      staffMap.set(o.staffId, staffRow);
    }
    staffRow.totalOrders += 1;

    if (o.status === 'Completed') {
      completedOrders += 1;
      const sale = Number(o.totalPrice) || 0;
      const cost = (Number(o.unitCostSnapshot) || 0) * (Number(o.quantity) || 0);
      completedSales += sale;
      productCost += cost;
      staffRow.completedOrders += 1;
      staffRow.completedSales += sale;
    } else if (o.status === 'Processing') {
      processingOrders += 1;
      const val = Number(o.totalPrice) || 0;
      processingValue += val;
      staffRow.processingOrders += 1;
      staffRow.processingValue += val;
    } else if (o.status === 'Rejected') {
      rejectedOrders += 1;
      staffRow.rejectedOrders += 1;
    }
  }

  const expensesTotal = filteredExpenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );
  const grossProfit = completedSales - productCost;
  const netProfit = grossProfit - expensesTotal;

  const staffPerformance = Array.from(staffMap.values()).sort(
    (a, b) => b.completedSales - a.completedSales || b.totalOrders - a.totalOrders
  );

  return {
    period,
    totalOrders: filteredOrders.length,
    completedOrders,
    processingOrders,
    rejectedOrders,
    processingValue: Math.round(processingValue * 100) / 100,
    completedSales: Math.round(completedSales * 100) / 100,
    productCost: Math.round(productCost * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    expensesTotal: Math.round(expensesTotal * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    staffPerformance,
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function buildReportsCsv(
  report: FinancialReportSummary,
  orders: Order[],
  referenceDate = new Date()
): string {
  const lines: string[] = [];
  lines.push('AVENOR LEGACY - FINANCIAL & OPERATIONS REPORT');
  lines.push(`Period,${escapeCsvCell(report.period.toUpperCase())}`);
  lines.push(`Generated At,${escapeCsvCell(referenceDate.toISOString())}`);
  lines.push('');
  lines.push('Summary Metric,Value (BDT / Count)');
  lines.push(`Total Orders,${report.totalOrders}`);
  lines.push(`Completed Orders,${report.completedOrders}`);
  lines.push(`Processing Orders,${report.processingOrders}`);
  lines.push(`Rejected Orders,${report.rejectedOrders}`);
  lines.push(`Processing Value (BDT),${report.processingValue}`);
  lines.push(`Completed Sales Revenue (BDT),${report.completedSales}`);
  lines.push(`Product Cost COGS (BDT),${report.productCost}`);
  lines.push(`Gross Profit (BDT),${report.grossProfit}`);
  lines.push(`Operational Expenses (BDT),${report.expensesTotal}`);
  lines.push(`Net Profit (BDT),${report.netProfit}`);
  lines.push('');
  lines.push('Staff Performance');
  lines.push(
    'Staff Name,Total Orders,Completed,Processing,Rejected,Completed Sales (BDT),Processing Value (BDT)'
  );
  for (const s of report.staffPerformance) {
    lines.push(
      [
        escapeCsvCell(s.staffName),
        s.totalOrders,
        s.completedOrders,
        s.processingOrders,
        s.rejectedOrders,
        s.completedSales,
        s.processingValue,
      ].join(',')
    );
  }
  lines.push('');
  lines.push('Orders Ledger');
  lines.push(
    'Order ID,Date,Staff,Customer,Contact,Product Code,Product Name,Size,Colour,Qty,Unit Price (BDT),Total Price (BDT),Status'
  );
  const periodOrders = orders.filter((o) =>
    isDateInPeriod(o.createdAt, report.period, referenceDate)
  );
  for (const o of periodOrders) {
    lines.push(
      [
        escapeCsvCell(o.orderId),
        escapeCsvCell(o.createdAt),
        escapeCsvCell(o.staffName),
        escapeCsvCell(o.customerName),
        escapeCsvCell(o.contactNumber),
        escapeCsvCell(o.productCode),
        escapeCsvCell(o.productName),
        escapeCsvCell(o.size),
        escapeCsvCell(o.colour),
        o.quantity,
        o.unitPriceSnapshot,
        o.totalPrice,
        escapeCsvCell(o.status),
      ].join(',')
    );
  }

  return lines.join('\r\n');
}

export interface PlaceOrderValidationInput {
  customerName: string;
  contactNumber: string;
  deliveryAddress: string;
  productCode: string;
  productName: string;
  size: string;
  colour: string;
  quantity: number;
}

export function validateOrderInput(
  input: PlaceOrderValidationInput
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.customerName = 'Customer name is required (at least 2 characters).';
  }
  if (!input.contactNumber || input.contactNumber.trim().length < 6) {
    errors.contactNumber = 'Valid contact number is required.';
  }
  if (!input.deliveryAddress || input.deliveryAddress.trim().length < 5) {
    errors.deliveryAddress = 'Full delivery address is required.';
  }
  if (!input.productCode || input.productCode.trim().length < 2) {
    errors.productCode = 'Product code is required.';
  }
  if (!input.productName || input.productName.trim().length < 2) {
    errors.productName = 'Product name is required.';
  }
  if (!input.size || !input.size.trim()) {
    errors.size = 'Size selection is required.';
  }
  if (!input.colour || !input.colour.trim()) {
    errors.colour = 'Colour selection is required.';
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    errors.quantity = 'Quantity must be a whole number of at least 1.';
  }
  return errors;
}

export function normalizeVariantLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeVariantKey(value: string): string {
  return normalizeVariantLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildDeterministicVariantId(
  productId: string,
  size: string,
  colour: string
): string {
  const safeProd = productId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const normSize = normalizeVariantKey(size) || 'std';
  const normColour = normalizeVariantKey(colour) || 'default';
  const raw = `${safeProd}__${normSize}__${normColour}`;
  return raw.slice(0, 128);
}

export function parsePositiveWholeQuantity(
  raw: string | number
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      return {
        ok: false,
        error: 'Quantity must be a positive whole number greater than 0 (decimals, zero, and negative values are not allowed).',
      };
    }
    return { ok: true, value: raw };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Quantity is required.' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Quantity must be a positive whole number greater than 0 (decimals, zero, and negative values are not allowed).',
    };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: 'Quantity must be a positive whole number greater than 0.',
    };
  }
  return { ok: true, value: parsed };
}

export function validateStockAdjustmentInput(input: {
  productId: string;
  size: string;
  colour: string;
  action: 'add' | 'reduce';
  quantityRaw: string | number;
  thresholdRaw?: string | number;
}):
  | {
      ok: true;
      productId: string;
      size: string;
      colour: string;
      action: 'add' | 'reduce';
      quantity: number;
      lowStockThreshold: number;
    }
  | { ok: false; error: string } {
  const productId = input.productId.trim();
  const size = normalizeVariantLabel(input.size);
  const colour = normalizeVariantLabel(input.colour);
  if (!productId) {
    return { ok: false, error: 'Please select a valid Product before applying a stock adjustment.' };
  }
  if (!size || size.length > 40) {
    return { ok: false, error: 'A valid Size is required (1-40 characters).' };
  }
  if (!colour || colour.length > 60) {
    return { ok: false, error: 'A valid Colour is required (1-60 characters).' };
  }
  if (input.action !== 'add' && input.action !== 'reduce') {
    return { ok: false, error: 'Please select either Add Stock or Reduce Stock.' };
  }
  const qtyRes = parsePositiveWholeQuantity(input.quantityRaw);
  if (qtyRes.ok === false) {
    return { ok: false, error: qtyRes.error };
  }
  let threshold = LOW_STOCK_DEFAULT_THRESHOLD;
  if (input.thresholdRaw !== undefined && String(input.thresholdRaw).trim() !== '') {
    const threshRes = parsePositiveWholeQuantity(input.thresholdRaw);
    if (threshRes.ok === false) {
      return { ok: false, error: 'Low Stock Threshold must be a positive whole number of at least 1.' };
    }
    threshold = threshRes.value;
  }
  return {
    ok: true,
    productId,
    size,
    colour,
    action: input.action,
    quantity: qtyRes.value,
    lowStockThreshold: threshold,
  };
}

export interface StockVariantQuantities {
  availableQty: number;
  reservedQty: number;
  totalQty: number;
  lowStockThreshold: number;
}

export interface StockTransitionOutcome {
  previousAvailable: number;
  newAvailable: number;
  previousReserved: number;
  newReserved: number;
  previousTotal: number;
  newTotal: number;
  lowStockThreshold: number;
  status: StockStatus;
  quantityDelta: number;
  movementType: StockMovementType;
  actionType: StockActionLabel;
}

export function computeManualStockAdjustment(
  current: StockVariantQuantities | null,
  action: 'add' | 'reduce',
  quantity: number,
  thresholdOverride?: number
): StockTransitionOutcome {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive whole number greater than 0.');
  }

  if (!current) {
    if (action === 'reduce') {
      throw new Error(
        'Cannot reduce stock: this Product, Size, and Colour variant currently has 0 available stock.'
      );
    }
    const threshold =
      thresholdOverride && Number.isInteger(thresholdOverride) && thresholdOverride >= 1
        ? thresholdOverride
        : LOW_STOCK_DEFAULT_THRESHOLD;
    const newAvailable = quantity;
    const newReserved = 0;
    const newTotal = newAvailable + newReserved;
    const avail = getStockAvailability(newTotal, newReserved, threshold);
    return {
      previousAvailable: 0,
      newAvailable,
      previousReserved: 0,
      newReserved,
      previousTotal: 0,
      newTotal,
      lowStockThreshold: threshold,
      status: avail.status,
      quantityDelta: quantity,
      movementType: 'add',
      actionType: 'Add',
    };
  }

  const prevReserved = Math.max(0, Math.floor(current.reservedQty));
  const prevAvailable = Math.max(
    0,
    Number.isInteger(current.availableQty)
      ? current.availableQty
      : Math.floor(current.totalQty) - prevReserved
  );
  const prevTotal = prevAvailable + prevReserved;
  const threshold =
    thresholdOverride && Number.isInteger(thresholdOverride) && thresholdOverride >= 1
      ? thresholdOverride
      : Math.max(1, Math.floor(current.lowStockThreshold || LOW_STOCK_DEFAULT_THRESHOLD));

  if (action === 'add') {
    const newAvailable = prevAvailable + quantity;
    const newReserved = prevReserved;
    const newTotal = newAvailable + newReserved;
    const avail = getStockAvailability(newTotal, newReserved, threshold);
    return {
      previousAvailable: prevAvailable,
      newAvailable,
      previousReserved: prevReserved,
      newReserved,
      previousTotal: prevTotal,
      newTotal,
      lowStockThreshold: threshold,
      status: avail.status,
      quantityDelta: quantity,
      movementType: 'add',
      actionType: 'Add',
    };
  }

  // Reduce Stock: never exceed availableQty, never negative, never touch reservedQty
  if (quantity > prevAvailable) {
    throw new Error(
      `Requested reduction (${quantity}) exceeds available stock (${prevAvailable} available, ${prevReserved} reserved for active orders).`
    );
  }
  const newAvailable = prevAvailable - quantity;
  const newReserved = prevReserved;
  const newTotal = newAvailable + newReserved;
  const avail = getStockAvailability(newTotal, newReserved, threshold);
  return {
    previousAvailable: prevAvailable,
    newAvailable,
    previousReserved: prevReserved,
    newReserved,
    previousTotal: prevTotal,
    newTotal,
    lowStockThreshold: threshold,
    status: avail.status,
    quantityDelta: -quantity,
    movementType: 'reduce',
    actionType: 'Reduce',
  };
}

export function computeOrderStockTransition(
  current: StockVariantQuantities,
  transition: 'reserve' | 'release' | 'complete',
  quantity: number
): StockTransitionOutcome {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Order quantity must be a positive whole integer.');
  }

  const prevReserved = Math.max(0, Math.floor(current.reservedQty));
  const prevAvailable = Math.max(
    0,
    Number.isInteger(current.availableQty)
      ? current.availableQty
      : Math.floor(current.totalQty) - prevReserved
  );
  const prevTotal = prevAvailable + prevReserved;
  const threshold = Math.max(
    1,
    Math.floor(current.lowStockThreshold || LOW_STOCK_DEFAULT_THRESHOLD)
  );

  if (transition === 'reserve') {
    if (prevAvailable < quantity) {
      throw new Error(
        `Insufficient available stock to confirm order. Available: ${prevAvailable}, Required: ${quantity} (${prevReserved} already reserved).`
      );
    }
    const newAvailable = prevAvailable - quantity;
    const newReserved = prevReserved + quantity;
    const newTotal = newAvailable + newReserved;
    const avail = getStockAvailability(newTotal, newReserved, threshold);
    return {
      previousAvailable: prevAvailable,
      newAvailable,
      previousReserved: prevReserved,
      newReserved,
      previousTotal: prevTotal,
      newTotal,
      lowStockThreshold: threshold,
      status: avail.status,
      quantityDelta: -quantity,
      movementType: 'reserve',
      actionType: 'Reserve',
    };
  }

  if (transition === 'release') {
    if (prevReserved < quantity) {
      throw new Error(
        `Cannot release ${quantity} units: only ${prevReserved} units are currently reserved.`
      );
    }
    const newAvailable = prevAvailable + quantity;
    const newReserved = prevReserved - quantity;
    const newTotal = newAvailable + newReserved;
    const avail = getStockAvailability(newTotal, newReserved, threshold);
    return {
      previousAvailable: prevAvailable,
      newAvailable,
      previousReserved: prevReserved,
      newReserved,
      previousTotal: prevTotal,
      newTotal,
      lowStockThreshold: threshold,
      status: avail.status,
      quantityDelta: quantity,
      movementType: 'release',
      actionType: 'Release',
    };
  }

  // complete: deduct reserved qty from Total Stock & decrease Reserved Stock; DO NOT add back to Available Stock
  if (prevReserved < quantity || prevTotal < quantity) {
    throw new Error(
      `Cannot complete order: reserved stock invariant mismatch (Total: ${prevTotal}, Reserved: ${prevReserved}, Required: ${quantity}).`
    );
  }
  const newAvailable = prevAvailable;
  const newReserved = prevReserved - quantity;
  const newTotal = newAvailable + newReserved; // equals prevTotal - quantity
  const avail = getStockAvailability(newTotal, newReserved, threshold);
  return {
    previousAvailable: prevAvailable,
    newAvailable,
    previousReserved: prevReserved,
    newReserved,
    previousTotal: prevTotal,
    newTotal,
    lowStockThreshold: threshold,
    status: avail.status,
    quantityDelta: -quantity,
    movementType: 'complete',
    actionType: 'Complete',
  };
}

