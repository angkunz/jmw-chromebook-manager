import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not configured');
const pool = new Pool({
  connectionString: url,
  ssl: !url.includes('localhost') ? { rejectUnauthorized: false } : undefined,
  max: 1,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
      serial_number TEXT UNIQUE NOT NULL,
      asset_code TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      purchase_date DATE,
      status TEXT NOT NULL DEFAULT 'available',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'student',
      class_or_department TEXT,
      email TEXT,
      phone TEXT,
      device_id INT REFERENCES devices(id) ON DELETE SET NULL,
      borrow_date DATE,
      return_due_date DATE,
      return_reason TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS repairs (
      id SERIAL PRIMARY KEY,
      device_id INT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT,
      issue TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      technician TEXT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INT REFERENCES admin_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INT REFERENCES admin_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE devices ADD COLUMN IF NOT EXISTS purchase_date DATE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE users ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'student';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS class_or_department TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id INT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS borrow_date DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS return_due_date DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS return_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS reporter_email TEXT;
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS details TEXT;
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received';
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS technician TEXT;
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE repairs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS admin_id INT;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action TEXT;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity TEXT;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id TEXT;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS detail TEXT;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  `);
} finally {
  await pool.end();
}
