import { Pool } from 'pg';
import crypto from 'crypto';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not configured');

const pool = new Pool({
  connectionString: url,
  ssl: !url.includes('localhost') ? { rejectUnauthorized: false } : undefined,
  max: 1,
});

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${sha(salt + password)}`;

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD;

if (!password) throw new Error('ADMIN_PASSWORD is not configured');

try {
  await pool.query(
    `INSERT INTO admin_users(username,password_hash,role,active)
     VALUES($1,$2,'admin',TRUE)
     ON CONFLICT (username)
     DO UPDATE SET password_hash=EXCLUDED.password_hash,role='admin',active=TRUE`,
    [username, hashPassword(password)]
  );
} finally {
  await pool.end();
}
