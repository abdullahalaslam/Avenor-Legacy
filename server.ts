import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  generateId,
  generateRandomToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './server/auth';
import { db, initDatabase, runInTransaction } from './server/db';
import {
  buildReportsCsv,
  calculateOrderTotal,
  canTransitionOrderStatus,
  computeAdminMetrics,
  computeFinancialReport,
  getStockAvailability,
  validateOrderInput,
  type AccountStatus,
  type Expense,
  type NotificationItem,
  type Order,
  type OrderStatus,
  type Product,
  type ReadyTextCategory,
  type ReadyTextTemplate,
  type ReportPeriod,
  type StockMovement,
  type StockVariant,
  type UserProfile,
  type UserRole,
} from './src/utils/domain';

initDatabase();

const app = express();
app.use(express.json({ limit: '5mb' }));

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  sessionTokenHash?: string;
}

// SSE clients map: userId -> set of response streams
const sseClients = new Map<string, Set<Response>>();

function pushSseNotification(notification: NotificationItem): void {
  const payload = `data: ${JSON.stringify(notification)}\n\n`;
  if (notification.recipientRole === 'admin') {
    const admins = db
      .prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'approved'")
      .all() as { id: string }[];
    for (const a of admins) {
      const clients = sseClients.get(a.id);
      if (clients) {
        for (const res of clients) {
          res.write(payload);
        }
      }
    }
  } else if (notification.recipientUserId) {
    const clients = sseClients.get(notification.recipientUserId);
    if (clients) {
      for (const res of clients) {
        res.write(payload);
      }
    }
  }
}

function createNotification(params: {
  recipientRole: UserRole | 'user';
  recipientUserId: string | null;
  type: NotificationItem['type'];
  title: string;
  message: string;
  referenceId?: string | null;
}): NotificationItem {
  const item: NotificationItem = {
    id: generateId('ntf'),
    recipientRole: params.recipientRole,
    recipientUserId: params.recipientUserId,
    type: params.type,
    title: params.title,
    message: params.message,
    referenceId: params.referenceId ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO notifications (id, recipient_role, recipient_user_id, type, title, message, reference_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    item.id,
    item.recipientRole,
    item.recipientUserId,
    item.type,
    item.title,
    item.message,
    item.referenceId,
    item.createdAt
  );
  pushSseNotification(item);
  return item;
}

function logActivity(
  actor: Pick<UserProfile, 'id' | 'fullName' | 'role'>,
  action: string,
  details: string
): void {
  db.prepare(
    `INSERT INTO activity_logs (id, actor_id, actor_name, actor_role, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId('act'), actor.id, actor.fullName, actor.role, action, details, new Date().toISOString());
}

function mapUserRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    role: row.role as UserRole,
    status: row.status as AccountStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    orderCount: row.order_count != null ? Number(row.order_count) : undefined,
    completedSales: row.completed_sales != null ? Number(row.completed_sales) : undefined,
  };
}

function mapVariantRow(row: Record<string, unknown>): StockVariant {
  const totalQty = Number(row.total_qty);
  const reservedQty = Number(row.reserved_qty);
  const lowThreshold = Number(row.low_stock_threshold ?? 5);
  const avail = getStockAvailability(totalQty, reservedQty, lowThreshold);
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productCode: String(row.product_code),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    size: String(row.size),
    colour: String(row.colour),
    totalQty,
    reservedQty,
    availableQty: avail.availableQty,
    lowStockThreshold: lowThreshold,
    status: avail.status,
    updatedAt: String(row.updated_at),
  };
}

function mapProductRow(row: Record<string, unknown>, includeCost: boolean): Product {
  const product: Product = {
    id: String(row.id),
    productCode: String(row.product_code),
    productName: String(row.product_name),
    category: String(row.category),
    description: String(row.description ?? ''),
    sellingPrice: Number(row.selling_price),
    isActive: Number(row.is_active) === 1,
    imageUrl: row.image_url ? String(row.image_url) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (includeCost) {
    product.productCost = Number(row.product_cost);
  }
  return product;
}

function mapOrderRow(row: Record<string, unknown>, includeCost: boolean): Order {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    staffId: String(row.staff_id),
    staffName: String(row.staff_name),
    customerName: String(row.customer_name),
    contactNumber: String(row.contact_number),
    deliveryAddress: String(row.delivery_address),
    productId: row.product_id ? String(row.product_id) : null,
    productCode: String(row.product_code),
    productName: String(row.product_name),
    size: String(row.size),
    colour: String(row.colour),
    quantity: Number(row.quantity),
    unitCostSnapshot: includeCost ? Number(row.unit_cost_snapshot) : 0,
    unitPriceSnapshot: Number(row.unit_price_snapshot),
    totalPrice: Number(row.total_price),
    note: String(row.note ?? ''),
    status: row.status as OrderStatus,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    stockReserved: Number(row.stock_reserved) === 1,
    reservedVariantId: row.reserved_variant_id ? String(row.reserved_variant_id) : null,
    isUnlistedProduct: Number(row.is_unlisted_product) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapReadyTextRow(row: Record<string, unknown>): ReadyTextTemplate {
  return {
    id: String(row.id),
    title: String(row.title),
    category: row.category as ReadyTextCategory,
    body: String(row.body),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapExpenseRow(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category),
    amount: Number(row.amount),
    expenseDate: String(row.expense_date),
    note: String(row.note ?? ''),
    createdById: String(row.created_by_id),
    createdByName: String(row.created_by_name),
    createdAt: String(row.created_at),
  };
}

function mapNotificationRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    recipientRole: row.recipient_role as UserRole | 'user',
    recipientUserId: row.recipient_user_id ? String(row.recipient_user_id) : null,
    type: row.type as NotificationItem['type'],
    title: String(row.title),
    message: String(row.message),
    referenceId: row.reference_id ? String(row.reference_id) : null,
    isRead: Number(row.is_read) === 1,
    createdAt: String(row.created_at),
  };
}

function extractRawToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const rawToken = extractRawToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as (Record<string, unknown> & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  const user = mapUserRow(row);
  if (user.status !== 'approved') {
    res.status(403).json({
      error: `Account access is currently "${user.status}". Only approved accounts can access protected portals.`,
      accountStatus: user.status,
    });
    return;
  }

  req.user = user;
  req.sessionTokenHash = tokenHash;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  next();
}

// ---------- HEALTH & BOOTSTRAP ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'AVENOR LEGACY API' });
});

app.get('/api/auth/bootstrap-status', (_req, res) => {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").get() as {
    cnt: number;
  };
  res.json({ hasAdmin: row.cnt > 0 });
});

// In-memory brute-force protection for failed logins (resets on success)
const failedLoginTracker = new Map<string, { count: number; resetAt: number }>();

function getLoginAttemptKey(req: Request, email: string): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${email}`;
}

// ---------- AUTHENTICATION ----------
app.post('/api/auth/register', (req, res) => {
  const { fullName, email, password, role } = req.body ?? {};
  const cleanName = typeof fullName === 'string' ? fullName.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const rawPassword = typeof password === 'string' ? password : '';

  if (typeof role === 'string' && role.trim().toLowerCase() === 'admin') {
    res.status(403).json({
      error: 'Public registration cannot create administrator accounts.',
    });
    return;
  }

  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (rawPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('usr');
  // Strictly force role='staff' and status='pending' — public users can NEVER register as admin
  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'staff', 'pending', ?, ?)`
  ).run(id, cleanName, cleanEmail, hashPassword(rawPassword), now, now);

  logActivity({ id, fullName: cleanName, role: 'staff' }, 'STAFF_REGISTERED', `Registered staff account (${cleanEmail}) pending admin approval.`);

  createNotification({
    recipientRole: 'admin',
    recipientUserId: null,
    type: 'staff_signup',
    title: 'New Staff Registration Request',
    message: `${cleanName} (${cleanEmail}) registered and awaits your approval.`,
    referenceId: id,
  });

  res.status(201).json({
    message: 'Staff registration submitted. Your account is pending Main Admin approval.',
    status: 'pending',
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, portal } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const rawPassword = typeof password === 'string' ? password : '';
  const targetPortal = portal === 'admin' || portal === 'staff' ? portal : null;

  if (!cleanEmail || !rawPassword) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const attemptKey = getLoginAttemptKey(req, cleanEmail);
  const tracker = failedLoginTracker.get(attemptKey);
  if (tracker && tracker.resetAt > Date.now() && tracker.count >= 10) {
    res.status(429).json({
      error: 'Too many failed sign-in attempts. Please wait 5 minutes before trying again.',
    });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as
    | (Record<string, unknown> & { password_hash: string })
    | undefined;

  if (!row || !verifyPassword(rawPassword, row.password_hash)) {
    const nowMs = Date.now();
    const current = tracker && tracker.resetAt > nowMs ? tracker : { count: 0, resetAt: nowMs + 5 * 60 * 1000 };
    current.count += 1;
    failedLoginTracker.set(attemptKey, current);
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  failedLoginTracker.delete(attemptKey);
  const user = mapUserRow(row);

  if (targetPortal && user.role !== targetPortal) {
    res.status(403).json({
      error:
        targetPortal === 'admin'
          ? 'This account does not have Administrator portal access. Please sign in via the Staff Portal.'
          : 'Administrator accounts must sign in through the Admin Portal.',
    });
    return;
  }

  if (user.status === 'pending') {
    res.status(403).json({
      error: 'Your staff account is pending administrator approval. Please wait for confirmation.',
      accountStatus: 'pending',
    });
    return;
  }

  if (user.status === 'rejected' || user.status === 'suspended') {
    res.status(403).json({
      error: `Your account has been ${user.status}. Access to protected portals is disabled.`,
      accountStatus: user.status,
    });
    return;
  }

  const rawToken = generateRandomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(hashToken(rawToken), user.id, expiresAt.toISOString(), now.toISOString());

  logActivity(user, 'USER_LOGIN', `Signed in via ${user.role} portal.`);

  res.json({
    token: rawToken,
    user,
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionTokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'Current password and a new password (min 8 chars) are required.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
    | { password_hash: string }
    | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  runInTransaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      req.user!.id
    );
    if (req.sessionTokenHash) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
        req.user!.id,
        req.sessionTokenHash
      );
    }
  });
  logActivity(req.user!, 'PASSWORD_CHANGED', 'Updated account password.');
  res.json({ message: 'Password updated successfully.' });
});

app.post('/api/auth/request-password-reset', (req, res) => {
  const { email } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }

  const user = db.prepare('SELECT id, full_name, role, status FROM users WHERE email = ?').get(cleanEmail) as
    | { id: string; full_name: string; role: UserRole; status: AccountStatus }
    | undefined;

  if (user && user.status === 'approved') {
    const rawCode = generateRandomToken(4).toUpperCase(); // 8-char secure hex reset code
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    runInTransaction(() => {
      db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
      db.prepare(
        'INSERT INTO password_resets (token_hash, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)'
      ).run(hashToken(rawCode), user.id, expiresAt, new Date().toISOString());
    });

    // Log reset token strictly on server console (never exposed in public API response)
    console.log(
      `[AVENOR LEGACY PASSWORD RESET] Email: ${cleanEmail} | Reset Code: ${rawCode} | Expires: ${expiresAt}`
    );

    if (user.role === 'staff') {
      createNotification({
        recipientRole: 'admin',
        recipientUserId: null,
        type: 'staff_signup',
        title: 'Staff Password Reset Requested',
        message: `${user.full_name} (${cleanEmail}) requested a password reset. You may issue a reset code from Staff Management.`,
        referenceId: user.id,
      });
    }
  }

  res.json({
    message:
      'If an approved account matches this email, a reset code has been generated. Staff members may obtain their reset code from the Main Admin or server administrator.',
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, resetCode, newPassword } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const code = typeof resetCode === 'string' ? resetCode.trim().toUpperCase() : '';
  const password = typeof newPassword === 'string' ? newPassword : '';

  if (!cleanEmail || !code || password.length < 8) {
    res.status(400).json({ error: 'Email, reset code, and new password (min 8 chars) are required.' });
    return;
  }

  const user = db.prepare('SELECT id, full_name, role, status FROM users WHERE email = ?').get(cleanEmail) as
    | { id: string; full_name: string; role: UserRole; status: AccountStatus }
    | undefined;

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired reset code.' });
    return;
  }

  if (user.status !== 'approved') {
    res.status(403).json({
      error: `Password reset is unavailable while account status is "${user.status}".`,
      accountStatus: user.status,
    });
    return;
  }

  const resetRow = db
    .prepare(
      'SELECT token_hash, expires_at, used FROM password_resets WHERE token_hash = ? AND user_id = ?'
    )
    .get(hashToken(code), user.id) as
    | { token_hash: string; expires_at: string; used: number }
    | undefined;

  if (!resetRow || resetRow.used === 1 || new Date(resetRow.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ error: 'Invalid or expired reset code.' });
    return;
  }

  runInTransaction(() => {
    db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(resetRow.token_hash);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(password),
      new Date().toISOString(),
      user.id
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  });

  logActivity({ id: user.id, fullName: user.full_name, role: user.role }, 'PASSWORD_RESET', 'Password reset completed.');
  res.json({ message: 'Password reset successful. You may now sign in with your new password.' });
});

// ---------- PRODUCTS ----------
app.get('/api/products', requireAuth, (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const rows = isAdmin
    ? (db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY product_name ASC')
        .all() as Record<string, unknown>[]);

  const variantsRows = db
    .prepare('SELECT * FROM stock_variants ORDER BY size ASC, colour ASC')
    .all() as Record<string, unknown>[];
  const variantsByProduct = new Map<string, StockVariant[]>();
  for (const vr of variantsRows) {
    const mapped = mapVariantRow(vr);
    const list = variantsByProduct.get(mapped.productId) ?? [];
    list.push(mapped);
    variantsByProduct.set(mapped.productId, list);
  }

  const products = rows.map((r) => {
    const p = mapProductRow(r, isAdmin);
    p.variants = variantsByProduct.get(p.id) ?? [];
    return p;
  });
  res.json({ products });
});

app.post('/api/products', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { productCode, productName, category, description, productCost, sellingPrice, isActive, imageUrl, initialVariants } =
    req.body ?? {};

  const code = typeof productCode === 'string' ? productCode.trim().toUpperCase() : '';
  const name = typeof productName === 'string' ? productName.trim() : '';
  const cat = typeof category === 'string' ? category.trim() : 'Menswear';
  const desc = typeof description === 'string' ? description.trim() : '';
  const cost = Number(productCost);
  const price = Number(sellingPrice);
  const active = isActive === undefined ? true : Boolean(isActive);
  const img = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null;

  if (code.length < 2) {
    res.status(400).json({ error: 'Product Code is required (at least 2 characters).' });
    return;
  }
  if (name.length < 2) {
    res.status(400).json({ error: 'Product Name is required.' });
    return;
  }
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: 'Valid non-negative Product Cost and positive Selling Price (BDT) are required.' });
    return;
  }

  const duplicate = db.prepare('SELECT id FROM products WHERE product_code = ?').get(code);
  if (duplicate) {
    res.status(409).json({ error: `Product Code "${code}" already exists.` });
    return;
  }

  const now = new Date().toISOString();
  const productId = generateId('prd');

  const created = runInTransaction(() => {
    db.prepare(
      `INSERT INTO products (id, product_code, product_name, category, description, product_cost, selling_price, is_active, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(productId, code, name, cat, desc, cost, price, active ? 1 : 0, img, now, now);

    if (Array.isArray(initialVariants)) {
      for (const v of initialVariants) {
        const size = typeof v?.size === 'string' ? v.size.trim() : '';
        const colour = typeof v?.colour === 'string' ? v.colour.trim() : '';
        const qty = Number.isInteger(Number(v?.quantity)) ? Number(v.quantity) : 0;
        const threshold = Number.isInteger(Number(v?.lowStockThreshold)) ? Number(v.lowStockThreshold) : 5;
        if (!size || !colour || qty < 0) continue;

        const variantId = generateId('var');
        db.prepare(
          `INSERT INTO stock_variants (id, product_id, product_code, size, colour, total_qty, reserved_qty, low_stock_threshold, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
        ).run(variantId, productId, code, size, colour, qty, Math.max(1, threshold), now);

        if (qty > 0) {
          db.prepare(
            `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
             VALUES (?, ?, ?, ?, ?, 'initial', ?, 0, ?, 0, 0, 'Initial product stock', ?, ?, ?)`
          ).run(generateId('mov'), variantId, code, size, colour, qty, qty, req.user!.id, req.user!.fullName, now);
        }
      }
    }

    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown>;
    return mapProductRow(row, true);
  });

  logActivity(req.user!, 'PRODUCT_CREATED', `Created product ${code} (${name}) at ৳${price}.`);
  res.status(201).json({ product: created });
});

app.patch('/api/products/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existingRow = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existingRow) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }

  const body = req.body ?? {};
  const productName =
    typeof body.productName === 'string' ? body.productName.trim() : String(existingRow.product_name);
  const category =
    typeof body.category === 'string' ? body.category.trim() : String(existingRow.category);
  const description =
    typeof body.description === 'string' ? body.description.trim() : String(existingRow.description);
  const productCost =
    body.productCost !== undefined ? Number(body.productCost) : Number(existingRow.product_cost);
  const sellingPrice =
    body.sellingPrice !== undefined ? Number(body.sellingPrice) : Number(existingRow.selling_price);
  const isActive =
    body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existingRow.is_active);
  const imageUrl =
    body.imageUrl !== undefined
      ? typeof body.imageUrl === 'string' && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null
      : (existingRow.image_url as string | null);

  if (!productName || !Number.isFinite(productCost) || productCost < 0 || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    res.status(400).json({ error: 'Invalid product name, cost, or selling price.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE products
     SET product_name = ?, category = ?, description = ?, product_cost = ?, selling_price = ?, is_active = ?, image_url = ?, updated_at = ?
     WHERE id = ?`
  ).run(productName, category, description, productCost, sellingPrice, isActive, imageUrl, now, id);

  logActivity(req.user!, 'PRODUCT_UPDATED', `Updated product ${existingRow.product_code} (Price: ৳${sellingPrice}, Active: ${isActive === 1}).`);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>;
  res.json({ product: mapProductRow(updated, true) });
});

app.post('/api/products/from-order/:orderId', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { orderId } = req.params;
  const { productCode, productName, category, description, productCost, sellingPrice, initialStockQty } =
    req.body ?? {};

  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | Record<string, unknown>
    | undefined;
  if (!orderRow) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const code = (typeof productCode === 'string' ? productCode : String(orderRow.product_code))
    .trim()
    .toUpperCase();
  const name = (typeof productName === 'string' ? productName : String(orderRow.product_name)).trim();
  const cat = typeof category === 'string' && category.trim() ? category.trim() : 'Bespoke Menswear';
  const desc = typeof description === 'string' ? description.trim() : '';
  const cost = Number(productCost);
  const price = Number(sellingPrice);
  // Never assume newly submitted product is available unless Admin explicitly enters verified initial qty
  const initQty = initialStockQty !== undefined ? Math.max(0, Math.floor(Number(initialStockQty))) : 0;

  if (!code || !name || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: 'Valid product code, name, cost, and positive selling price are required.' });
    return;
  }

  const existingProd = db.prepare('SELECT id FROM products WHERE product_code = ?').get(code);
  if (existingProd) {
    res.status(409).json({ error: `Product code "${code}" already exists in the catalog.` });
    return;
  }

  const now = new Date().toISOString();
  const productId = generateId('prd');
  const variantId = generateId('var');
  const size = String(orderRow.size);
  const colour = String(orderRow.colour);

  const result = runInTransaction(() => {
    db.prepare(
      `INSERT INTO products (id, product_code, product_name, category, description, product_cost, selling_price, is_active, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`
    ).run(productId, code, name, cat, desc, cost, price, now, now);

    db.prepare(
      `INSERT INTO stock_variants (id, product_id, product_code, size, colour, total_qty, reserved_qty, low_stock_threshold, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 5, ?)`
    ).run(variantId, productId, code, size, colour, initQty, now);

    if (initQty > 0) {
      db.prepare(
        `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, 'initial', ?, 0, ?, 0, 0, ?, ?, ?, ?)`
      ).run(
        generateId('mov'),
        variantId,
        code,
        size,
        colour,
        initQty,
        initQty,
        `Created from Order ${orderRow.order_id}`,
        req.user!.id,
        req.user!.fullName,
        now
      );
    }

    const orderQty = Number(orderRow.quantity);
    const totalPrice = calculateOrderTotal(price, orderQty);
    db.prepare(
      `UPDATE orders
       SET product_id = ?, product_code = ?, product_name = ?, unit_cost_snapshot = ?, unit_price_snapshot = ?, total_price = ?, is_unlisted_product = 0, updated_at = ?
       WHERE id = ?`
    ).run(productId, code, name, cost, price, totalPrice, now, orderId);

    // Link any other open unlisted orders referencing the exact same product code
    const siblingUnlisted = db
      .prepare(
        `SELECT id, quantity FROM orders
         WHERE id != ? AND is_unlisted_product = 1 AND UPPER(product_code) = ? AND status NOT IN ('Completed', 'Rejected')`
      )
      .all(orderId, code) as { id: string; quantity: number }[];

    for (const sib of siblingUnlisted) {
      db.prepare(
        `UPDATE orders
         SET product_id = ?, product_code = ?, product_name = ?, unit_cost_snapshot = ?, unit_price_snapshot = ?, total_price = ?, is_unlisted_product = 0, updated_at = ?
         WHERE id = ?`
      ).run(productId, code, name, cost, price, calculateOrderTotal(price, Number(sib.quantity)), now, sib.id);
    }

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown>;
    const createdProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown>;
    return {
      product: mapProductRow(createdProduct, true),
      order: mapOrderRow(updatedOrder, true),
    };
  });

  logActivity(
    req.user!,
    'PRODUCT_CREATED_FROM_ORDER',
    `Created product ${code} from order ${orderRow.order_id} with initial stock ${initQty}.`
  );
  res.status(201).json(result);
});

// ---------- STOCK MANAGEMENT ----------
app.get('/api/stock', requireAuth, (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const codeQuery = typeof req.query.productCode === 'string' ? req.query.productCode.trim().toUpperCase() : '';
  const whereClauses: string[] = [];
  const params: string[] = [];

  if (!isAdmin) {
    whereClauses.push('p.is_active = 1');
  }
  if (codeQuery) {
    whereClauses.push('UPPER(sv.product_code) LIKE ?');
    params.push(`%${codeQuery}%`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const variantRows = db
    .prepare(
      `SELECT sv.*, p.product_name, p.is_active
       FROM stock_variants sv
       JOIN products p ON p.id = sv.product_id
       ${whereSql}
       ORDER BY sv.product_code ASC, sv.size ASC, sv.colour ASC`
    )
    .all(...params) as Record<string, unknown>[];

  const variants = variantRows.map(mapVariantRow);
  let movements: StockMovement[] = [];
  if (isAdmin) {
    const movSql = codeQuery
      ? 'SELECT * FROM stock_movements WHERE UPPER(product_code) LIKE ? ORDER BY created_at DESC LIMIT 200'
      : 'SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 200';
    const movRows = (codeQuery
      ? db.prepare(movSql).all(`%${codeQuery}%`)
      : db.prepare(movSql).all()) as Record<string, unknown>[];
    movements = movRows.map((m) => ({
      id: String(m.id),
      variantId: String(m.variant_id),
      productCode: String(m.product_code),
      size: String(m.size),
      colour: String(m.colour),
      movementType: m.movement_type as StockMovement['movementType'],
      quantityDelta: Number(m.quantity_delta),
      previousTotal: Number(m.previous_total),
      newTotal: Number(m.new_total),
      previousReserved: Number(m.previous_reserved),
      newReserved: Number(m.new_reserved),
      note: String(m.note ?? ''),
      actorId: String(m.actor_id),
      actorName: String(m.actor_name),
      createdAt: String(m.created_at),
    }));
  }

  res.json({ variants, movements });
});

app.post('/api/stock/adjust', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { productId, size, colour, action, quantity, lowStockThreshold, note } = req.body ?? {};
  const cleanSize = typeof size === 'string' ? size.trim() : '';
  const cleanColour = typeof colour === 'string' ? colour.trim() : '';
  const qty = Number(quantity);
  const movAction = action === 'add' || action === 'reduce' ? action : null;

  if (!productId || !cleanSize || !cleanColour || !movAction || !Number.isInteger(qty) || qty <= 0) {
    res.status(400).json({ error: 'Product, Size, Colour, valid action (add/reduce), and positive whole quantity are required.' });
    return;
  }

  try {
    const updatedVariant = runInTransaction(() => {
      const product = db.prepare('SELECT id, product_code, product_name FROM products WHERE id = ?').get(productId) as
        | { id: string; product_code: string; product_name: string }
        | undefined;
      if (!product) {
        throw { status: 404, message: 'Product not found.' };
      }

      const now = new Date().toISOString();
      let variant = db
        .prepare(
          `SELECT * FROM stock_variants
           WHERE product_id = ? AND LOWER(size) = LOWER(?) AND LOWER(colour) = LOWER(?)`
        )
        .get(productId, cleanSize, cleanColour) as Record<string, unknown> | undefined;

      if (!variant) {
        if (movAction === 'reduce') {
          throw { status: 400, message: 'Cannot reduce stock for a variant that has zero stock.' };
        }
        const variantId = generateId('var');
        const threshold = Number.isInteger(Number(lowStockThreshold)) ? Math.max(1, Number(lowStockThreshold)) : 5;
        db.prepare(
          `INSERT INTO stock_variants (id, product_id, product_code, size, colour, total_qty, reserved_qty, low_stock_threshold, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
        ).run(variantId, product.id, product.product_code, cleanSize, cleanColour, qty, threshold, now);

        db.prepare(
          `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
           VALUES (?, ?, ?, ?, ?, 'add', ?, 0, ?, 0, 0, ?, ?, ?, ?)`
        ).run(
          generateId('mov'),
          variantId,
          product.product_code,
          cleanSize,
          cleanColour,
          qty,
          qty,
          typeof note === 'string' && note.trim() ? note.trim() : 'Manual stock entry',
          req.user!.id,
          req.user!.fullName,
          now
        );

        const created = db
          .prepare('SELECT sv.*, p.product_name FROM stock_variants sv JOIN products p ON p.id = sv.product_id WHERE sv.id = ?')
          .get(variantId) as Record<string, unknown>;
        return mapVariantRow(created);
      }

      const prevTotal = Number(variant.total_qty);
      const reserved = Number(variant.reserved_qty);
      const delta = movAction === 'add' ? qty : -qty;
      const newTotal = prevTotal + delta;

      if (newTotal < 0) {
        throw { status: 400, message: `Negative stock is not permitted. Current total is ${prevTotal}.` };
      }
      if (newTotal < reserved) {
        throw {
          status: 400,
          message: `Cannot reduce total stock to ${newTotal} because ${reserved} units are currently reserved for active orders.`,
        };
      }

      const threshold =
        lowStockThreshold !== undefined && Number.isInteger(Number(lowStockThreshold))
          ? Math.max(1, Number(lowStockThreshold))
          : Number(variant.low_stock_threshold);

      const variantId = String(variant.id);
      db.prepare('UPDATE stock_variants SET total_qty = ?, low_stock_threshold = ?, updated_at = ? WHERE id = ?').run(
        newTotal,
        threshold,
        now,
        variantId
      );

      db.prepare(
        `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateId('mov'),
        variantId,
        product.product_code,
        String(variant.size),
        String(variant.colour),
        movAction,
        delta,
        prevTotal,
        newTotal,
        reserved,
        reserved,
        typeof note === 'string' && note.trim() ? note.trim() : `Manual ${movAction}`,
        req.user!.id,
        req.user!.fullName,
        now
      );

      const refreshed = db
        .prepare('SELECT sv.*, p.product_name FROM stock_variants sv JOIN products p ON p.id = sv.product_id WHERE sv.id = ?')
        .get(variantId) as Record<string, unknown>;
      return mapVariantRow(refreshed);
    });

    logActivity(
      req.user!,
      'STOCK_ADJUSTED',
      `${movAction === 'add' ? 'Added' : 'Reduced'} ${qty} units for ${updatedVariant.productCode} (${updatedVariant.size}/${updatedVariant.colour}).`
    );

    const alertPrefix =
      updatedVariant.status === 'Not Available'
        ? 'Out of Stock Alert'
        : updatedVariant.status === 'Low Stock'
          ? 'Low Stock Alert'
          : 'Stock Updated';

    createNotification({
      recipientRole: 'admin',
      recipientUserId: null,
      type: 'stock_update',
      title: `${alertPrefix}: ${updatedVariant.productCode}`,
      message: `${updatedVariant.size} · ${updatedVariant.colour} now has ${updatedVariant.availableQty} available (${updatedVariant.totalQty} total, ${updatedVariant.reservedQty} reserved).`,
      referenceId: updatedVariant.id,
    });

    res.json({ variant: updatedVariant });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ error: e.message || 'Stock adjustment failed.' });
  }
});

// ---------- ORDERS ----------
app.get('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (!isAdmin) {
    // Staff can ONLY read their own orders — enforced server-side!
    where.push('staff_id = ?');
    params.push(req.user!.id);
  } else if (typeof req.query.staffId === 'string' && req.query.staffId.trim()) {
    where.push('staff_id = ?');
    params.push(req.query.staffId.trim());
  }

  if (typeof req.query.status === 'string' && req.query.status.trim()) {
    where.push('status = ?');
    params.push(req.query.status.trim());
  }
  if (typeof req.query.productCode === 'string' && req.query.productCode.trim()) {
    where.push('UPPER(product_code) LIKE ?');
    params.push(`%${req.query.productCode.trim().toUpperCase()}%`);
  }
  if (typeof req.query.fromDate === 'string' && req.query.fromDate.trim()) {
    where.push('created_at >= ?');
    params.push(req.query.fromDate.trim());
  }
  if (typeof req.query.toDate === 'string' && req.query.toDate.trim()) {
    where.push('created_at <= ?');
    params.push(`${req.query.toDate.trim()}T23:59:59.999Z`);
  }

  const sql = `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  res.json({ orders: rows.map((r) => mapOrderRow(r, isAdmin)) });
});

app.post('/api/orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const body = req.body ?? {};
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const contactNumber = typeof body.contactNumber === 'string' ? body.contactNumber.trim() : '';
  const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
  const productCode = typeof body.productCode === 'string' ? body.productCode.trim().toUpperCase() : '';
  const requestedProductName = typeof body.productName === 'string' ? body.productName.trim() : '';
  const size = typeof body.size === 'string' ? body.size.trim() : '';
  const colour = typeof body.colour === 'string' ? body.colour.trim() : '';
  const quantity = Number(body.quantity);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const allowUnlisted = Boolean(body.isUnlistedProduct);

  const productRow = db.prepare('SELECT * FROM products WHERE product_code = ?').get(productCode) as
    | Record<string, unknown>
    | undefined;

  const effectiveProductName = productRow ? String(productRow.product_name) : requestedProductName;

  const validationErrors = validateOrderInput({
    customerName,
    contactNumber,
    deliveryAddress,
    productCode,
    productName: effectiveProductName,
    size,
    colour,
    quantity,
  });

  if (Object.keys(validationErrors).length > 0) {
    res.status(400).json({ error: Object.values(validationErrors)[0], validationErrors });
    return;
  }

  if (productRow && Number(productRow.is_active) !== 1) {
    res.status(400).json({ error: `Product "${productCode}" is currently inactive and cannot be ordered.` });
    return;
  }

  if (!productRow && !allowUnlisted) {
    res.status(400).json({
      error: `Product Code "${productCode}" was not found in the active catalog. Select an active product or mark it as an unlisted product request for Admin verification.`,
    });
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
  const randomSuffix = generateRandomToken(2).toUpperCase();
  const orderId = `AVL-${datePart}-${randomSuffix}`;
  const id = generateId('ord');

  // Server ALWAYS determines authoritative unit price & cost from DB, never trusting client price!
  const unitPrice = productRow ? Number(productRow.selling_price) : 0;
  const unitCost = productRow ? Number(productRow.product_cost) : 0;
  const totalPrice = productRow ? calculateOrderTotal(unitPrice, quantity) : 0;
  const isUnlisted = productRow ? 0 : 1;

  db.prepare(
    `INSERT INTO orders (
      id, order_id, staff_id, staff_name, customer_name, contact_number, delivery_address,
      product_id, product_code, product_name, size, colour, quantity,
      unit_cost_snapshot, unit_price_snapshot, total_price, note, status,
      rejection_reason, stock_reserved, reserved_variant_id, is_unlisted_product,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New Order', NULL, 0, NULL, ?, ?, ?)`
  ).run(
    id,
    orderId,
    req.user!.id,
    req.user!.fullName,
    customerName,
    contactNumber,
    deliveryAddress,
    productRow ? String(productRow.id) : null,
    productCode,
    effectiveProductName,
    size,
    colour,
    quantity,
    unitCost,
    unitPrice,
    totalPrice,
    note,
    isUnlisted,
    now.toISOString(),
    now.toISOString()
  );

  logActivity(
    req.user!,
    'ORDER_PLACED',
    `Placed order ${orderId} for ${productCode} (${size}/${colour}) × ${quantity}.`
  );

  createNotification({
    recipientRole: 'admin',
    recipientUserId: null,
    type: 'new_order',
    title: `New Order ${orderId}`,
    message: `${req.user!.fullName} submitted ${productCode} (${size}/${colour}) × ${quantity} for ${customerName}.`,
    referenceId: id,
  });

  const createdRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ order: mapOrderRow(createdRow, req.user!.role === 'admin') });
});

app.patch('/api/orders/:id/status', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body ?? {};
  const targetStatus = status as OrderStatus;
  const cleanReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';

  if (!targetStatus) {
    res.status(400).json({ error: 'Target order status is required.' });
    return;
  }

  try {
    const updatedOrder = runInTransaction(() => {
      const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!orderRow) {
        throw { status: 404, message: 'Order not found.' };
      }

      const currentStatus = orderRow.status as OrderStatus;
      const transition = canTransitionOrderStatus(currentStatus, targetStatus);
      if (!transition.allowed) {
        throw { status: 400, message: transition.reason };
      }

      const now = new Date().toISOString();
      const qty = Number(orderRow.quantity);
      let stockReserved = Number(orderRow.stock_reserved) === 1;
      let reservedVariantId = orderRow.reserved_variant_id ? String(orderRow.reserved_variant_id) : null;
      let unitPriceSnapshot = Number(orderRow.unit_price_snapshot);
      let unitCostSnapshot = Number(orderRow.unit_cost_snapshot);
      let totalPrice = Number(orderRow.total_price);

      if (targetStatus === 'Rejected') {
        if (cleanReason.length < 3) {
          throw { status: 400, message: 'A rejection reason (at least 3 characters) is required.' };
        }
        // Release reserved stock if it was reserved
        if (stockReserved && reservedVariantId) {
          const variant = db.prepare('SELECT * FROM stock_variants WHERE id = ?').get(reservedVariantId) as
            | Record<string, unknown>
            | undefined;
          if (variant) {
            const prevReserved = Number(variant.reserved_qty);
            const newReserved = Math.max(0, prevReserved - qty);
            const totalQty = Number(variant.total_qty);
            db.prepare('UPDATE stock_variants SET reserved_qty = ?, updated_at = ? WHERE id = ?').run(
              newReserved,
              now,
              reservedVariantId
            );
            db.prepare(
              `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
               VALUES (?, ?, ?, ?, ?, 'release', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              generateId('mov'),
              reservedVariantId,
              String(orderRow.product_code),
              String(variant.size),
              String(variant.colour),
              qty,
              totalQty,
              totalQty,
              prevReserved,
              newReserved,
              `Released stock on rejection of ${orderRow.order_id}`,
              req.user!.id,
              req.user!.fullName,
              now
            );
          }
          stockReserved = false;
          reservedVariantId = null;
        }

        db.prepare(
          `UPDATE orders
           SET status = 'Rejected', rejection_reason = ?, stock_reserved = 0, reserved_variant_id = NULL, updated_at = ?
           WHERE id = ?`
        ).run(cleanReason, now, id);
      } else if (targetStatus === 'Confirmed') {
        // Re-validate product existence, active status, price, and stock availability atomically
        if (!orderRow.product_id || Number(orderRow.is_unlisted_product) === 1) {
          throw {
            status: 409,
            message: 'This order contains an unlisted product code. Create the product in catalog before confirming.',
          };
        }

        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(orderRow.product_id as string) as
          | Record<string, unknown>
          | undefined;
        if (!product || Number(product.is_active) !== 1) {
          throw { status: 409, message: 'Product is missing or inactive and cannot be confirmed.' };
        }

        // Preserve existing positive snapshot price; if snapshot was 0 (newly linked), apply current admin price
        if (unitPriceSnapshot <= 0) {
          unitPriceSnapshot = Number(product.selling_price);
          unitCostSnapshot = Number(product.product_cost);
          totalPrice = calculateOrderTotal(unitPriceSnapshot, qty);
        }

        if (unitPriceSnapshot <= 0) {
          throw { status: 409, message: 'Product selling price must be greater than 0 BDT before confirmation.' };
        }

        if (!stockReserved) {
          const variant = db
            .prepare(
              `SELECT * FROM stock_variants
               WHERE product_id = ? AND LOWER(size) = LOWER(?) AND LOWER(colour) = LOWER(?)`
            )
            .get(String(orderRow.product_id), String(orderRow.size), String(orderRow.colour)) as
            | Record<string, unknown>
            | undefined;

          if (!variant) {
            throw {
              status: 409,
              message: `No stock record found for ${orderRow.product_code} (${orderRow.size} / ${orderRow.colour}). Add stock before confirming.`,
            };
          }

          const totalQty = Number(variant.total_qty);
          const prevReserved = Number(variant.reserved_qty);
          const available = totalQty - prevReserved;
          if (available < qty) {
            throw {
              status: 409,
              message: `Insufficient available stock for ${orderRow.product_code} (${orderRow.size} / ${orderRow.colour}). Available: ${available}, Required: ${qty}.`,
            };
          }

          const newReserved = prevReserved + qty;
          db.prepare('UPDATE stock_variants SET reserved_qty = ?, updated_at = ? WHERE id = ?').run(
            newReserved,
            now,
            String(variant.id)
          );
          db.prepare(
            `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
             VALUES (?, ?, ?, ?, ?, 'reserve', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            generateId('mov'),
            String(variant.id),
            String(orderRow.product_code),
            String(variant.size),
            String(variant.colour),
            -qty,
            totalQty,
            totalQty,
            prevReserved,
            newReserved,
            `Reserved stock for order ${orderRow.order_id}`,
            req.user!.id,
            req.user!.fullName,
            now
          );

          stockReserved = true;
          reservedVariantId = String(variant.id);
        }

        db.prepare(
          `UPDATE orders
           SET status = 'Confirmed', unit_cost_snapshot = ?, unit_price_snapshot = ?, total_price = ?, stock_reserved = 1, reserved_variant_id = ?, updated_at = ?
           WHERE id = ?`
        ).run(unitCostSnapshot, unitPriceSnapshot, totalPrice, reservedVariantId, now, id);
      } else if (targetStatus === 'Completed') {
        if (!stockReserved || !reservedVariantId) {
          throw { status: 409, message: 'Order stock must be reserved (Confirmed) before completion.' };
        }
        const variant = db.prepare('SELECT * FROM stock_variants WHERE id = ?').get(reservedVariantId) as
          | Record<string, unknown>
          | undefined;
        if (!variant) {
          throw { status: 409, message: 'Reserved stock variant no longer exists.' };
        }

        const prevTotal = Number(variant.total_qty);
        const prevReserved = Number(variant.reserved_qty);
        if (prevTotal < qty || prevReserved < qty) {
          throw { status: 409, message: 'Stock invariant mismatch during completion.' };
        }

        const newTotal = prevTotal - qty;
        const newReserved = prevReserved - qty;
        db.prepare('UPDATE stock_variants SET total_qty = ?, reserved_qty = ?, updated_at = ? WHERE id = ?').run(
          newTotal,
          newReserved,
          now,
          reservedVariantId
        );
        db.prepare(
          `INSERT INTO stock_movements (id, variant_id, product_code, size, colour, movement_type, quantity_delta, previous_total, new_total, previous_reserved, new_reserved, note, actor_id, actor_name, created_at)
           VALUES (?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          generateId('mov'),
          reservedVariantId,
          String(orderRow.product_code),
          String(variant.size),
          String(variant.colour),
          -qty,
          prevTotal,
          newTotal,
          prevReserved,
          newReserved,
          `Fulfilled order ${orderRow.order_id}`,
          req.user!.id,
          req.user!.fullName,
          now
        );

        db.prepare(
          `UPDATE orders
           SET status = 'Completed', stock_reserved = 0, updated_at = ?
           WHERE id = ?`
        ).run(now, id);
      } else {
        // Stock Checking, Processing, On Hold
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(targetStatus, now, id);
      }

      const refreshed = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, unknown>;
      return mapOrderRow(refreshed, true);
    });

    const notifType: NotificationItem['type'] =
      targetStatus === 'Confirmed'
        ? 'order_confirmed'
        : targetStatus === 'Rejected'
          ? 'order_rejected'
          : targetStatus === 'Completed'
            ? 'order_completed'
            : 'order_status';

    createNotification({
      recipientRole: 'user',
      recipientUserId: updatedOrder.staffId,
      type: notifType,
      title: `Order ${updatedOrder.orderId}: ${targetStatus}`,
      message:
        targetStatus === 'Rejected'
          ? `Order ${updatedOrder.orderId} was rejected. Reason: ${updatedOrder.rejectionReason}`
          : `Your order ${updatedOrder.orderId} (${updatedOrder.productCode}) moved to "${targetStatus}".`,
      referenceId: updatedOrder.id,
    });

    logActivity(req.user!, 'ORDER_STATUS_UPDATED', `Order ${updatedOrder.orderId} transitioned to ${targetStatus}.`);
    res.json({ order: updatedOrder });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 500).json({ error: e.message || 'Failed to update order status.' });
  }
});

// ---------- STAFF MANAGEMENT (ADMIN ONLY) ----------
app.get('/api/staff', requireAuth, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM orders o WHERE o.staff_id = u.id) AS order_count,
        (SELECT COALESCE(SUM(o.total_price), 0) FROM orders o WHERE o.staff_id = u.id AND o.status = 'Completed') AS completed_sales
       FROM users u
       WHERE u.role = 'staff'
       ORDER BY
         CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END,
         u.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  const logs = db
    .prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100')
    .all() as Record<string, unknown>[];

  res.json({
    staff: rows.map(mapUserRow),
    activityLogs: logs.map((l) => ({
      id: String(l.id),
      actorId: String(l.actor_id),
      actorName: String(l.actor_name),
      actorRole: l.actor_role as UserRole,
      action: String(l.action),
      details: String(l.details),
      createdAt: String(l.created_at),
    })),
  });
});

app.patch('/api/staff/:id/status', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};
  const allowed: AccountStatus[] = ['approved', 'rejected', 'suspended'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'Invalid target account status.' });
    return;
  }

  const target = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'Staff member not found.' });
    return;
  }

  const now = new Date().toISOString();
  runInTransaction(() => {
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    if (status === 'rejected' || status === 'suspended') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
  });

  logActivity(
    req.user!,
    'STAFF_STATUS_CHANGED',
    `Changed staff "${target.full_name}" (${target.email}) status to ${status}.`
  );

  if (status === 'approved') {
    createNotification({
      recipientRole: 'staff',
      recipientUserId: id,
      type: 'staff_signup',
      title: 'Staff Account Approved',
      message: `Welcome to AVENOR LEGACY, ${String(target.full_name)}. Your advisor account is now active.`,
      referenceId: id,
    });
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  res.json({ staff: mapUserRow(updated) });
});

app.post('/api/staff/:id/reset-token', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'Staff member not found.' });
    return;
  }
  if (String(target.status) !== 'approved') {
    res.status(400).json({ error: 'Reset codes can only be issued for approved staff accounts.' });
    return;
  }

  const rawCode = generateRandomToken(4).toUpperCase();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  runInTransaction(() => {
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(id);
    db.prepare(
      'INSERT INTO password_resets (token_hash, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)'
    ).run(hashToken(rawCode), id, expiresAt, new Date().toISOString());
  });

  logActivity(req.user!, 'STAFF_RESET_CODE_ISSUED', `Issued password reset code for ${target.email}.`);
  res.json({ resetCode: rawCode, expiresAt });
});

// ---------- READY TEXT MANAGEMENT ----------
app.get('/api/ready-texts', requireAuth, (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const rows = isAdmin
    ? (db.prepare('SELECT * FROM ready_texts ORDER BY category ASC, title ASC').all() as Record<
        string,
        unknown
      >[])
    : (db
        .prepare('SELECT * FROM ready_texts WHERE is_active = 1 ORDER BY category ASC, title ASC')
        .all() as Record<string, unknown>[]);
  res.json({ templates: rows.map(mapReadyTextRow) });
});

app.post('/api/ready-texts', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { title, category, body, isActive } = req.body ?? {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanCat = typeof category === 'string' ? category.trim() : '';
  const cleanBody = typeof body === 'string' ? body.trim() : '';

  if (!cleanTitle || !cleanCat || !cleanBody) {
    res.status(400).json({ error: 'Title, category, and message body are required.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('rt');
  db.prepare(
    'INSERT INTO ready_texts (id, title, category, body, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, cleanTitle, cleanCat, cleanBody, isActive === false ? 0 : 1, now, now);

  logActivity(req.user!, 'READY_TEXT_CREATED', `Created template "${cleanTitle}" (${cleanCat}).`);
  const row = db.prepare('SELECT * FROM ready_texts WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ template: mapReadyTextRow(row) });
});

app.patch('/api/ready-texts/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM ready_texts WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Template not found.' });
    return;
  }

  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : String(existing.title);
  const category = typeof body.category === 'string' ? body.category.trim() : String(existing.category);
  const textBody = typeof body.body === 'string' ? body.body.trim() : String(existing.body);
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active);

  if (!title || !category || !textBody) {
    res.status(400).json({ error: 'Title, category, and body cannot be empty.' });
    return;
  }

  db.prepare(
    'UPDATE ready_texts SET title = ?, category = ?, body = ?, is_active = ?, updated_at = ? WHERE id = ?'
  ).run(title, category, textBody, isActive, new Date().toISOString(), id);

  logActivity(req.user!, 'READY_TEXT_UPDATED', `Updated template "${title}".`);
  const updated = db.prepare('SELECT * FROM ready_texts WHERE id = ?').get(id) as Record<string, unknown>;
  res.json({ template: mapReadyTextRow(updated) });
});

app.delete('/api/ready-texts/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT title FROM ready_texts WHERE id = ?').get(id) as
    | { title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Template not found.' });
    return;
  }
  db.prepare('DELETE FROM ready_texts WHERE id = ?').run(id);
  logActivity(req.user!, 'READY_TEXT_DELETED', `Deleted template "${existing.title}".`);
  res.json({ ok: true });
});

// ---------- EXPENSES (ADMIN ONLY) ----------
app.get('/api/expenses', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC').all() as Record<
    string,
    unknown
  >[];
  res.json({ expenses: rows.map(mapExpenseRow) });
});

app.post('/api/expenses', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { title, category, amount, expenseDate, note } = req.body ?? {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanCat = typeof category === 'string' ? category.trim() : 'Operations';
  const numAmount = Number(amount);
  const dateStr =
    typeof expenseDate === 'string' && expenseDate.trim()
      ? expenseDate.trim()
      : new Date().toISOString().slice(0, 10);
  const cleanNote = typeof note === 'string' ? note.trim() : '';

  if (!cleanTitle || !Number.isFinite(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Expense title and positive amount in BDT are required.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('exp');
  db.prepare(
    `INSERT INTO expenses (id, title, category, amount, expense_date, note, created_by_id, created_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, cleanTitle, cleanCat, numAmount, dateStr, cleanNote, req.user!.id, req.user!.fullName, now);

  logActivity(req.user!, 'EXPENSE_ADDED', `Logged expense "${cleanTitle}" (${cleanCat}) of ৳${numAmount}.`);
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ expense: mapExpenseRow(row) });
});

app.delete('/api/expenses/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT title FROM expenses WHERE id = ?').get(id) as { title: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Expense not found.' });
    return;
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  logActivity(req.user!, 'EXPENSE_DELETED', `Removed expense "${existing.title}".`);
  res.json({ ok: true });
});

// ---------- DASHBOARDS & REPORTS ----------
app.get('/api/admin/dashboard', requireAuth, requireAdmin, (_req, res) => {
  const orderRows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const userRows = db.prepare('SELECT * FROM users').all() as Record<string, unknown>[];
  const variantRows = db.prepare('SELECT * FROM stock_variants').all() as Record<string, unknown>[];

  const orders = orderRows.map((r) => mapOrderRow(r, true));
  const users = userRows.map(mapUserRow);
  const variants = variantRows.map(mapVariantRow);
  const metrics = computeAdminMetrics(orders, users, variants);

  res.json({
    metrics,
    recentOrders: orders.slice(0, 8),
    lowStockVariants: variants.filter((v) => v.status !== 'Available').slice(0, 8),
  });
});

app.get('/api/staff/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const orderRows = db
    .prepare('SELECT * FROM orders WHERE staff_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Record<string, unknown>[];
  const orders = orderRows.map((r) => mapOrderRow(r, false));

  const counts = {
    totalOrders: orders.length,
    newOrders: orders.filter((o) => o.status === 'New Order').length,
    stockChecking: orders.filter((o) => o.status === 'Stock Checking').length,
    confirmed: orders.filter((o) => o.status === 'Confirmed').length,
    processing: orders.filter((o) => o.status === 'Processing').length,
    completed: orders.filter((o) => o.status === 'Completed').length,
    rejected: orders.filter((o) => o.status === 'Rejected').length,
    onHold: orders.filter((o) => o.status === 'On Hold').length,
    completedSales: orders
      .filter((o) => o.status === 'Completed')
      .reduce((acc, o) => acc + o.totalPrice, 0),
  };

  res.json({ counts, recentOrders: orders.slice(0, 8) });
});

app.get('/api/admin/reports', requireAuth, requireAdmin, (req, res) => {
  const periodParam = String(req.query.period || 'monthly');
  const period: ReportPeriod =
    periodParam === 'daily' || periodParam === 'weekly' || periodParam === 'monthly' || periodParam === 'all'
      ? periodParam
      : 'monthly';

  const orderRows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const expenseRows = db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC').all() as Record<
    string,
    unknown
  >[];

  const orders = orderRows.map((r) => mapOrderRow(r, true));
  const expenses = expenseRows.map(mapExpenseRow);
  const report = computeFinancialReport(orders, expenses, period);

  res.json({ report });
});

app.get('/api/admin/reports/export', requireAuth, requireAdmin, (req, res) => {
  const periodParam = String(req.query.period || 'monthly');
  const period: ReportPeriod =
    periodParam === 'daily' || periodParam === 'weekly' || periodParam === 'monthly' || periodParam === 'all'
      ? periodParam
      : 'monthly';

  const orderRows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const expenseRows = db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC').all() as Record<
    string,
    unknown
  >[];

  const orders = orderRows.map((r) => mapOrderRow(r, true));
  const expenses = expenseRows.map(mapExpenseRow);
  const report = computeFinancialReport(orders, expenses, period);
  const csv = buildReportsCsv(report, orders);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="avenor-legacy-report-${period}-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
});

// ---------- NOTIFICATIONS ----------
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows =
    req.user!.role === 'admin'
      ? (db
          .prepare(
            "SELECT * FROM notifications WHERE recipient_role = 'admin' OR recipient_user_id = ? ORDER BY created_at DESC LIMIT 100"
          )
          .all(req.user!.id) as Record<string, unknown>[])
      : (db
          .prepare('SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY created_at DESC LIMIT 100')
          .all(req.user!.id) as Record<string, unknown>[]);

  res.json({ notifications: rows.map(mapNotificationRow) });
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  if (req.user!.role === 'admin') {
    db.prepare(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND (recipient_role = 'admin' OR recipient_user_id = ?)"
    ).run(id, req.user!.id);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?').run(
      id,
      req.user!.id
    );
  }
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'admin') {
    db.prepare(
      "UPDATE notifications SET is_read = 1 WHERE recipient_role = 'admin' OR recipient_user_id = ?"
    ).run(req.user!.id);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?').run(req.user!.id);
  }
  res.json({ ok: true });
});

app.get('/api/notifications/stream', requireAuth, (req: AuthenticatedRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userId = req.user!.id;
  let set = sseClients.get(userId);
  if (!set) {
    set = new Set();
    sseClients.set(userId, set);
  }
  set.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const userSet = sseClients.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        sseClients.delete(userId);
      }
    }
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ---------- SERVER STARTUP (VITE DEV OR PRODUCTION DIST) ----------
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[AVENOR LEGACY] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
