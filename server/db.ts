import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateId, hashPassword } from './auth';

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH || './data/avenor-legacy.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      product_code TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      product_cost REAL NOT NULL DEFAULT 0 CHECK(product_cost >= 0),
      selling_price REAL NOT NULL DEFAULT 0 CHECK(selling_price >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      size TEXT NOT NULL,
      colour TEXT NOT NULL,
      total_qty INTEGER NOT NULL DEFAULT 0 CHECK(total_qty >= 0),
      reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK(reserved_qty >= 0 AND reserved_qty <= total_qty),
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, size, colour)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES stock_variants(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      size TEXT NOT NULL,
      colour TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      previous_total INTEGER NOT NULL,
      new_total INTEGER NOT NULL,
      previous_reserved INTEGER NOT NULL,
      new_reserved INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      staff_id TEXT NOT NULL REFERENCES users(id),
      staff_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      product_id TEXT REFERENCES products(id),
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      size TEXT NOT NULL,
      colour TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_cost_snapshot REAL NOT NULL DEFAULT 0,
      unit_price_snapshot REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      rejection_reason TEXT,
      stock_reserved INTEGER NOT NULL DEFAULT 0,
      reserved_variant_id TEXT,
      is_unlisted_product INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ready_texts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      body TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      expense_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_role TEXT NOT NULL,
      recipient_user_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      reference_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_staff_id ON orders(staff_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_product_code ON orders(product_code);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_role, recipient_user_id, is_read);
  `);

  seedDefaultReadyTexts();
  bootstrapEnvAdmin();
}

function seedDefaultReadyTexts(): void {
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM ready_texts').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  const now = new Date().toISOString();
  const defaults = [
    {
      title: 'Initial Order Acknowledgement',
      category: 'Order Received',
      body: 'Dear {customer_name}, thank you for choosing AVENOR LEGACY. We have received your order {order_id} for {product_code} ({total_price}). Our concierge team is verifying atelier availability.',
    },
    {
      title: 'Stock Reserved & Confirmed',
      category: 'Stock Confirmed',
      body: 'Dear {customer_name}, great news — your AVENOR LEGACY piece ({product_code}) for order {order_id} has been verified and reserved. Total payable: {total_price}.',
    },
    {
      title: 'Atelier Tailoring & Dispatch Prep',
      category: 'Processing',
      body: 'Dear {customer_name}, your AVENOR LEGACY order {order_id} ({product_code}) is now in bespoke finishing and packaging. Total amount: {total_price}.',
    },
    {
      title: 'Order Delivered & Completed',
      category: 'Completed',
      body: 'Dear {customer_name}, your AVENOR LEGACY order {order_id} for {product_code} ({total_price}) has been completed. Wear the Legacy.',
    },
    {
      title: 'Order Unavailable / Declined',
      category: 'Rejected',
      body: 'Dear {customer_name}, we regret to inform you that order {order_id} ({product_code}) could not be fulfilled at this time. Please reach out to your AVENOR LEGACY advisor for curated alternatives.',
    },
    {
      title: 'Courier Dispatch Update',
      category: 'Delivery Update',
      body: 'Dear {customer_name}, your order {order_id} ({product_code}) has been handed to our priority courier. Cash/Invoice total: {total_price}.',
    },
    {
      title: 'Post-Purchase Appreciation',
      category: 'Thank You',
      body: 'Thank you, {customer_name}, for wearing AVENOR LEGACY. We appreciate your patronage on order {order_id} ({product_code}, {total_price}).',
    },
  ];

  const insert = db.prepare(
    'INSERT INTO ready_texts (id, title, category, body, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  );
  for (const item of defaults) {
    insert.run(generateId('rt'), item.title, item.category, item.body, now, now);
  }
}

function bootstrapEnvAdmin(): void {
  const email = process.env.AVENOR_INIT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.AVENOR_INIT_ADMIN_PASSWORD;
  const name = process.env.AVENOR_INIT_ADMIN_NAME?.trim() || 'Main Admin';

  if (!email || !password) return;

  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: string } | undefined;
  if (existingAdmin) return;

  const existingUser = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as { id: string } | undefined;
  if (existingUser) return;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 'approved', ?, ?)`
  ).run(generateId('usr'), name, email, hashPassword(password), now, now);
  console.log(`[AVENOR LEGACY] Bootstrapped initial Main Admin (${email}) from environment.`);
}

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback errors if already rolled back
    }
    throw err;
  }
}
