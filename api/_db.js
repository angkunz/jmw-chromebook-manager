import { Pool } from 'pg';
import crypto from 'crypto';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not configured');

export const pool = new Pool({
  connectionString: url,
  ssl: !url.includes('localhost') ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

export const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
export const makeHash = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${sha(salt + password)}`;
export const verifyHash = (password, value) => {
  const [salt, hash] = String(value || '').split(':');
  return !!salt && hash === sha(salt + password);
};

let initialized;
export async function initDb() {
  if (initialized) return initialized;
  initialized = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices(id SERIAL PRIMARY KEY,serial_number TEXT UNIQUE NOT NULL,asset_code TEXT UNIQUE NOT NULL,brand TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'available',purchase_date DATE,note TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,full_name TEXT NOT NULL,type TEXT DEFAULT 'student',class_or_department TEXT,email TEXT,phone TEXT,device_id INT REFERENCES devices(id) ON DELETE SET NULL,borrow_date DATE,return_due_date DATE,return_reason TEXT,active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS repairs(id SERIAL PRIMARY KEY,device_id INT REFERENCES devices(id) ON DELETE CASCADE,reporter_name TEXT NOT NULL,reporter_email TEXT,issue TEXT NOT NULL,details TEXT,status TEXT DEFAULT 'received',technician TEXT,opened_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),completed_at TIMESTAMPTZ);
      CREATE TABLE IF NOT EXISTS admin_users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT DEFAULT 'admin',active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id INT REFERENCES admin_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS audit_log(id SERIAL PRIMARY KEY,admin_id INT,action TEXT,entity TEXT,entity_id TEXT,detail TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS purchase_date DATE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS note TEXT;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE repairs ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE repairs ADD COLUMN IF NOT EXISTS technician TEXT;
      ALTER TABLE repairs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE repairs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    `);
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (password) {
      await pool.query(`INSERT INTO admin_users(username,password_hash,role,active) VALUES($1,$2,'admin',TRUE) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='admin',active=TRUE`, [username, makeHash(password)]);
    }
  })();
  return initialized;
}

export async function getSession(req) {
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)jmw_session=([^;]+)/);
    token = m?.[1];
  }
  if (!token) return null;
  return (await pool.query('SELECT s.*,a.username,a.role FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE', [sha(token)])).rows[0] || null;
}

export async function requireAdmin(req, res) {
  await initDb();
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    return null;
  }
  return session;
}
