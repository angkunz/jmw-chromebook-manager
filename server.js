import express from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.DATABASE_URL;
const pool = dbUrl ? new Pool({ connectionString: dbUrl, ssl: !dbUrl.includes('localhost') ? { rejectUnauthorized: false } : undefined, max: 5 }) : null;
const q = (s,p=[]) => pool.query(s,p);
const one = async (s,p=[]) => (await q(s,p)).rows[0] || null;
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const makeHash = (password,salt=crypto.randomBytes(16).toString('hex')) => `${salt}:${sha(salt+password)}`;
const verify = (password,value) => { const [salt,h] = String(value||'').split(':'); return !!salt && h === sha(salt+password); };
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'1mb'}));
app.use(rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false}));
let initialized;
async function init(){
 if(initialized)return initialized;
 initialized=(async()=>{
  if(!pool)throw new Error('DATABASE_URL is not configured in Vercel');
  await q(`CREATE TABLE IF NOT EXISTS devices(id SERIAL PRIMARY KEY,serial_number TEXT UNIQUE NOT NULL,asset_code TEXT UNIQUE NOT NULL,brand TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'available',purchase_date DATE,note TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,full_name TEXT NOT NULL,type TEXT DEFAULT 'student',class_or_department TEXT,email TEXT,phone TEXT,device_id INT REFERENCES devices(id) ON DELETE SET NULL,borrow_date DATE,return_due_date DATE,return_reason TEXT,active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE IF NOT EXISTS repairs(id SERIAL PRIMARY KEY,device_id INT REFERENCES devices(id) ON DELETE CASCADE,reporter_name TEXT NOT NULL,reporter_email TEXT,issue TEXT NOT NULL,details TEXT,status TEXT DEFAULT 'received',technician TEXT,opened_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),completed_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS admin_users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT DEFAULT 'admin',active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id INT REFERENCES admin_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());CREATE TABLE IF NOT EXISTS audit_log(id SERIAL PRIMARY KEY,admin_id INT,action TEXT,entity TEXT,entity_id TEXT,detail TEXT,created_at TIMESTAMPTZ DEFAULT NOW());ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();ALTER TABLE repairs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;`);
  const username=process.env.ADMIN_USERNAME||'admin';const password=process.env.ADMIN_PASSWORD;if(!password)throw new Error('ADMIN_PASSWORD is not configured in Vercel');
  await q(`INSERT INTO admin_users(username,password_hash,role,active) VALUES($1,$2,'admin',TRUE) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='admin',active=TRUE`,[username,makeHash(password)]);
  return true;
 })();return initialized;
}
async function session(req){let token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token){const m=(req.headers.cookie||'').match(/(?:^|;\s*)jmw_session=([^;]+)/);token=m?.[1];}if(!token)return null;return one('SELECT s.*,a.username,a.role FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[sha(token)])}
async function auth(req,res,next){try{req.s=await session(req);if(!req.s)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});next()}catch(e){next(e)}}
async function audit(req,action,entity,id,detail=''){await q('INSERT INTO audit_log(admin_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.s?.admin_id||null,action,entity,String(id??''),detail])}
app.get('/api/health',async(req,res)=>{try{await init();await q('SELECT 1');res.json({ok:true,database:true,environment:{admin:!!process.env.ADMIN_PASSWORD,smtp:!!process.env.SMTP_HOST}})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.post('/api/auth/login',async(req,res,next)=>{try{await init();const username=String(req.body?.username||'').trim();const password=String(req.body?.password||'');const a=await one('SELECT * FROM admin_users WHERE username=$1 AND active=TRUE',[username]);if(!a||!verify(password,a.password_hash))return res.status(401).json({error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'});const token=crypto.randomBytes(32).toString('hex');await q("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '12 hours')",[sha(token),a.id]);res.setHeader('Set-Cookie',`jmw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`);res.json({ok:true,token,user:{id:a.id,username:a.username,role:a.role}})}catch(e){next(e)}});
app.use('/api',async(req,res,next)=>{try{await init();next()}catch(e){next(e)}});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:{id:req.s.admin_id,username:req.s.username,role:req.s.role}}));
app.post('/api/auth/logout',auth,async(req,res,next)=>{try{await q('DELETE FROM sessions WHERE token_hash=$1',[req.s.token_hash]);res.setHeader('Set-Cookie','jmw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');res.json({ok:true})}catch(e){next(e)}});
app.get('/api/dashboard',auth,async(req,res,next)=>{try{const count=async(sql)=>Number((await one(sql)).c);res.json({total:await count('SELECT COUNT(*) c FROM devices'),available:await count("SELECT COUNT(*) c FROM devices WHERE status='available'"),assigned:await count("SELECT COUNT(*) c FROM devices WHERE status='assigned'"),repair:await count("SELECT COUNT(*) c FROM devices WHERE status='repair'"),retired:await count("SELECT COUNT(*) c FROM devices WHERE status='retired'"),overdue:await count("SELECT COUNT(*) c FROM users WHERE active=TRUE AND return_due_date<CURRENT_DATE"),repairsOpen:await count("SELECT COUNT(*) c FROM repairs WHERE status NOT IN ('completed','cancelled')")})}catch(e){next(e)}});
app.get('/api/devices',auth,async(req,res,next)=>{try{res.json((await q('SELECT * FROM devices ORDER BY id DESC')).rows)}catch(e){next(e)}});
app.post('/api/devices',auth,async(req,res,next)=>{try{const x=req.body||{};const r=await q('INSERT INTO devices(serial_number,asset_code,brand,model,purchase_date,status,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[x.serial_number,x.asset_code,x.brand,x.model,x.purchase_date||null,x.status||'available',x.note||null]);await audit(req,'create','device',r.rows[0].id,x.asset_code);res.status(201).json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/devices/:id',auth,async(req,res,next)=>{try{const x=req.body||{};const r=await q('UPDATE devices SET serial_number=$1,asset_code=$2,brand=$3,model=$4,purchase_date=$5,status=$6,note=$7,updated_at=NOW() WHERE id=$8 RETURNING *',[x.serial_number,x.asset_code,x.brand,x.model,x.purchase_date||null,x.status||'available',x.note||null,req.params.id]);res.json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/devices/:id',auth,async(req,res,next)=>{try{const u=await one('SELECT id FROM users WHERE active=TRUE AND device_id=$1',[req.params.id]);if(u)return res.status(409).json({error:'อุปกรณ์ยังถูกยืมใช้งานอยู่'});await q('DELETE FROM devices WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/users',auth,async(req,res,next)=>{try{res.json((await q('SELECT u.*,d.asset_code,d.serial_number,d.brand,d.model FROM users u LEFT JOIN devices d ON d.id=u.device_id ORDER BY u.id DESC')).rows)}catch(e){next(e)}});
app.post('/api/users',auth,async(req,res,next)=>{try{const x=req.body||{};const r=await q('INSERT INTO users(full_name,type,class_or_department,email,phone,device_id,borrow_date,return_due_date,return_reason,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[x.full_name,x.type||'student',x.class_or_department||null,x.email||null,x.phone||null,x.device_id||null,x.borrow_date||null,x.return_due_date||null,x.return_reason||null,x.active!==false]);if(x.device_id&&x.active!==false)await q("UPDATE devices SET status='assigned',updated_at=NOW() WHERE id=$1 AND status NOT IN ('repair','retired')",[x.device_id]);res.status(201).json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/repairs',auth,async(req,res,next)=>{try{res.json((await q('SELECT r.*,d.asset_code,d.serial_number,d.brand,d.model FROM repairs r JOIN devices d ON d.id=r.device_id ORDER BY r.id DESC')).rows)}catch(e){next(e)}});
app.post('/api/repairs',auth,async(req,res,next)=>{try{const x=req.body||{};const r=await q('INSERT INTO repairs(device_id,reporter_name,reporter_email,issue,details,status,technician) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[x.device_id,x.reporter_name,x.reporter_email||null,x.issue,x.details||null,x.status||'received',x.technician||null]);await q("UPDATE devices SET status='repair',updated_at=NOW() WHERE id=$1",[x.device_id]);res.status(201).json(r.rows[0])}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/audit',auth,async(req,res,next)=>{try{res.json((await q('SELECT l.*,a.username FROM audit_log l LEFT JOIN admin_users a ON a.id=l.admin_id ORDER BY l.id DESC LIMIT 200')).rows)}catch(e){next(e)}});
app.get('/api/cron/reminders',async(req,res)=>{if(process.env.CRON_SECRET&&req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});res.json({ok:true})});
app.use(express.static(path.join(__dirname,'public')));app.get('*splat',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));app.use((err,req,res,next)=>{console.error('[JMW]',err);res.status(500).json({error:err.message||'เกิดข้อผิดพลาดภายในระบบ'})});
if(!process.env.VERCEL){init().then(()=>app.listen(Number(process.env.PORT||3000))).catch(e=>{console.error(e);process.exit(1)})}
export default app;
