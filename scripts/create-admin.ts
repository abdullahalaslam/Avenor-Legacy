import 'dotenv/config';
import { generateId, hashPassword } from '../server/auth';
import { db, initDatabase } from '../server/db';

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        parsed[key] = val;
        i += 1;
      }
    }
  }
  return parsed;
}

function main() {
  initDatabase();
  const args = parseArgs(process.argv.slice(2));
  const fullName = (args.name || process.env.AVENOR_INIT_ADMIN_NAME || '').trim();
  const email = (args.email || process.env.AVENOR_INIT_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.AVENOR_INIT_ADMIN_PASSWORD || '';

  if (!fullName || !email || password.length < 8) {
    console.error(
      'Usage: npm run setup:admin -- --name "Founder Name" --email "admin@avenorlegacy.com" --password "StrongPassword123"'
    );
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = db
    .prepare('SELECT id, role FROM users WHERE email = ?')
    .get(email) as { id: string; role: string } | undefined;

  if (existing) {
    console.error(`A user with email "${email}" already exists (role: ${existing.role}).`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const id = generateId('usr');
  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 'approved', ?, ?)`
  ).run(id, fullName, email, hashPassword(password), now, now);

  console.log(`Main Admin provisioned successfully:`);
  console.log(`  ID:    ${id}`);
  console.log(`  Name:  ${fullName}`);
  console.log(`  Email: ${email}`);
  console.log(`  Role:  admin (approved)`);
}

main();
