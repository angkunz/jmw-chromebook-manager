import app from '../server.js';
import multer from 'multer';
import XLSX from 'xlsx';
import { Pool } from 'pg';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const dbUrl = process.env.DATABASE_URL;
const pool = dbUrl ? new Pool({ connectionString: dbUrl, ssl: !dbUrl.includes('localhost') ? { rejectUnauthorized: false } : undefined, max: 2 }) : null;
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const clean = v => String(v ?? '').trim();
const key = v => clean(v).toLowerCase().replace(/\s+/g, '').replace(/[\u200b\ufeff]/g, '');
const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) : null;
const dateOnly = v => { const s = String(v ?? ''); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
const statusLabels = { received:'รับเรื่องแล้ว', checking:'กำลังตรวจสอบ', waiting_parts:'รออะไหล่', repairing:'กำลังซ่อม', completed:'ซ่อมเสร็จแล้ว', cancelled:'ยกเลิก' };
const sendStatusEmail = async (repair) => {
  if (!mailer || !repair?.reporter_email) return { sent:false, error: !mailer ? 'ยังไม่ได้ตั้งค่า SMTP' : 'รายการนี้ไม่มีอีเมลผู้แจ้ง' };
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: repair.reporter_email,
      subject: `[JMW Chromebook] อัปเดตสถานะการซ่อม #${repair.id}: ${statusLabels[repair.status] || repair.status}`,
      text: `แจ้งอัปเดตสถานะการซ่อม\n\nเลขที่แจ้งซ่อม: #${repair.id}\nวันที่แจ้ง: ${dateOnly(repair.opened_at)}\nสถานะ: ${statusLabels[repair.status] || repair.status}\nS/N: ${repair.serial_number || '-'}\nรหัสเครื่อง: ${repair.asset_code || '-'}\nอาการ: ${repair.issue || '-'}\nรายละเอียด: ${repair.details || '-'}\nผู้รับผิดชอบ: ${repair.technician || '-'}\nวันที่อัปเดต: ${dateOnly(repair.updated_at)}`
    });
    return { sent:true };
  } catch (e) { console.error('[SMTP REPAIR STATUS]', e); return { sent:false, error:e.message || 'ส่งอีเมลไม่สำเร็จ' }; }
};

async function requireAdmin(req, res) {
  if (!pool) { res.status(500).json({ error: 'DATABASE_URL is not configured' }); return null; }
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { const m = (req.headers.cookie || '').match(/(?:^|;\s*)jmw_session=([^;]+)/); token = m?.[1]; }
  if (!token) { res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); return null; }
  const session = (await pool.query('SELECT s.*,a.username,a.role FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE', [sha(token)])).rows[0];
  if (!session) { res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); return null; }
  return session;
}

app.get('/api/data-version', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const q = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM devices) AS devices_count,
      (SELECT COUNT(*)::int FROM users) AS users_count,
      (SELECT COUNT(*)::int FROM repairs) AS repairs_count,
      (SELECT COUNT(*)::int FROM audit_log) AS audit_count,
      (SELECT COALESCE(MAX(id),0)::int FROM devices) AS devices_max_id,
      (SELECT COALESCE(MAX(id),0)::int FROM users) AS users_max_id,
      (SELECT COALESCE(MAX(id),0)::int FROM repairs) AS repairs_max_id,
      (SELECT COALESCE(MAX(id),0)::int FROM audit_log) AS audit_max_id,
      (SELECT COALESCE(MAX(updated_at)::text,'') FROM devices) AS devices_updated,
      (SELECT COALESCE(MAX(updated_at)::text,'') FROM users) AS users_updated,
      (SELECT COALESCE(MAX(updated_at)::text,'') FROM repairs) AS repairs_updated,
      (SELECT COALESCE(MAX(created_at)::text,'') FROM audit_log) AS audit_updated`);
    const fingerprint = sha(JSON.stringify(q.rows[0]));
    res.setHeader('Cache-Control','no-store');
    return res.json({ ok:true, version:fingerprint });
  } catch (e) {
    console.error('[DATA VERSION]', e);
    return res.status(500).json({ error:e.message || 'ตรวจสอบเวอร์ชันข้อมูลไม่สำเร็จ' });
  }
});

app.post('/api/import-excel', upload.single('file'), async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel' });
    if (!pool) return res.status(500).json({ error: 'DATABASE_URL is not configured' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const deviceSheetName = wb.SheetNames.find(n => key(n) === key('อุปกรณ์')) || wb.SheetNames.find(n => key(n) === key('devices'));
    const userSheetName = wb.SheetNames.find(n => key(n) === key('ผู้ใช้')) || wb.SheetNames.find(n => key(n) === key('users'));
    if (!deviceSheetName || !userSheetName) return res.status(400).json({ error: 'ไฟล์ต้องมีชีต “อุปกรณ์” และ “ผู้ใช้”' });
    const devices = XLSX.utils.sheet_to_json(wb.Sheets[deviceSheetName], { defval: '', raw: true });
    const users = XLSX.utils.sheet_to_json(wb.Sheets[userSheetName], { defval: '', raw: true });
    const dget = (row, names) => { const wanted = names.map(key); const entry = Object.entries(row).find(([h]) => wanted.includes(key(h))); return entry ? entry[1] : ''; };
    const uget = (row, names) => { const wanted = names.map(key); const entry = Object.entries(row).find(([h]) => wanted.includes(key(h))); return entry ? entry[1] : ''; };
    const client = await pool.connect(); let importedDevices = 0, updatedDevices = 0, importedUsers = 0, updatedUsers = 0, skipped = [];
    try {
      await client.query('BEGIN');
      for (let i = 0; i < devices.length; i++) { const row = devices[i]; const serial=clean(dget(row,['S/N','SN','Serial Number','serial_number'])),asset=clean(dget(row,['รหัสเครื่อง','Asset Code','asset_code'])),brand=clean(dget(row,['ยี่ห้อ','Brand','brand'])),model=clean(dget(row,['รุ่น','Model','model'])); if(!serial&&!asset&&!brand&&!model)continue; if(!serial||!asset||!brand||!model){skipped.push(`อุปกรณ์แถว ${i+2}: ข้อมูลจำเป็นไม่ครบ`);continue} const statusMap={'พร้อมใช้งาน':'available','กำลังใช้งาน':'assigned','กำลังซ่อม':'repair','เลิกใช้':'retired'},rawStatus=clean(dget(row,['สถานะ','Status','status'])),status=statusMap[rawStatus]||(['available','assigned','repair','retired'].includes(rawStatus)?rawStatus:'available'),purchaseDate=(()=>{const v=dget(row,['วันที่ซื้อ','Purchase Date','purchase_date']);if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null}return /^\d{4}-\d{2}-\d{2}$/.test(clean(v))?clean(v):null})(),note=clean(dget(row,['หมายเหตุ','Note','note']))||null; const existing=(await client.query('SELECT id FROM devices WHERE serial_number=$1 OR asset_code=$2 LIMIT 1',[serial,asset])).rows[0]; if(existing){await client.query('UPDATE devices SET serial_number=$1,asset_code=$2,brand=$3,model=$4,status=$5,purchase_date=$6,note=$7,updated_at=NOW() WHERE id=$8',[serial,asset,brand,model,status,purchaseDate,note,existing.id]);updatedDevices++}else{await client.query('INSERT INTO devices(serial_number,asset_code,brand,model,status,purchase_date,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[serial,asset,brand,model,status,purchaseDate,note]);importedDevices++}}
      const classYears=v=>{const t=clean(v).replace(/\s/g,'');if(/ม\.?4(?:\/|$)/.test(t))return 3;if(/ม\.?5(?:\/|$)/.test(t))return 2;if(/ม\.?6(?:\/|$)/.test(t))return 1;return null}; const addYears=(date,years)=>{if(!date||!years)return date;const d=new Date(`${date}T00:00:00`),day=d.getDate();d.setFullYear(d.getFullYear()+years);if(d.getDate()!==day)d.setDate(0);return d.toISOString().slice(0,10)};
      for (let i=0;i<users.length;i++){const row=users[i],fullName=clean(uget(row,['ชื่อผู้ใช้เครื่อง','ชื่อผู้ใช้','Full Name','full_name'])),cls=clean(uget(row,['ระดับชั้น/ฝ่ายงาน','ระดับชั้น','Class/Department','class_or_department'])),email=clean(uget(row,['อีเมล','Email','email']))||null,phone=clean(uget(row,['เบอร์โทร','โทรศัพท์','Phone','phone']))||null,serial=clean(uget(row,['S/N','SN','Serial Number','serial_number'])),asset=clean(uget(row,['รหัสเครื่อง','Asset Code','asset_code'])),borrowDate=clean(uget(row,['วันที่ยืม','Borrow Date','borrow_date'])),manualDue=clean(uget(row,['วันที่ต้องคืน','Return Due Date','return_due_date'])),due=borrowDate&&classYears(cls)?addYears(borrowDate,classYears(cls)):manualDue,reason=clean(uget(row,['เหตุผลคืน','Return Reason','return_reason']))||null,type=clean(uget(row,['ประเภท','Type','type']))||'student';if(!fullName)continue;let deviceId=null;if(serial||asset){const d=(await client.query('SELECT id FROM devices WHERE serial_number=$1 OR asset_code=$2 LIMIT 1',[serial||null,asset||null])).rows[0];if(d)deviceId=d.id;else skipped.push(`ผู้ใช้แถว ${i+2}: ไม่พบเครื่อง ${serial||asset}`)}const existing=email?(await client.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',[email])).rows[0]:null;if(existing){await client.query('UPDATE users SET full_name=$1,type=$2,class_or_department=$3,email=$4,phone=$5,device_id=$6,borrow_date=$7,return_due_date=$8,return_reason=$9,active=TRUE,updated_at=NOW() WHERE id=$10',[fullName,type,cls,email,phone,deviceId,borrowDate,due,reason,existing.id]);updatedUsers++}else{await client.query('INSERT INTO users(full_name,type,class_or_department,email,phone,device_id,borrow_date,return_due_date,return_reason,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)',[fullName,type,cls,email,phone,deviceId,borrowDate,due,reason]);importedUsers++}if(deviceId)await client.query("UPDATE devices SET status='assigned',updated_at=NOW() WHERE id=$1 AND status NOT IN ('repair','retired')",[deviceId])}
      await client.query('COMMIT');
    } catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    res.json({ok:true,message:`นำเข้าข้อมูลสำเร็จ อุปกรณ์ใหม่ ${importedDevices} รายการ / แก้ไข ${updatedDevices} รายการ / ผู้ใช้ใหม่ ${importedUsers} รายการ / แก้ไข ${updatedUsers} รายการ`,importedDevices,updatedDevices,importedUsers,updatedUsers,skipped});
  } catch(e){console.error('[IMPORT EXCEL]',e);res.status(500).json({error:e.message||'นำเข้า Excel ไม่สำเร็จ'})}
});

app.patch('/api/repairs/:id', async (req,res)=>{
  const admin=await requireAdmin(req,res); if(!admin)return;
  try{
    const id=Number(req.params.id), x=req.body||{};
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'เลขที่แจ้งซ่อมไม่ถูกต้อง'});
    const old=(await pool.query('SELECT r.*,d.serial_number,d.asset_code FROM repairs r JOIN devices d ON d.id=r.device_id WHERE r.id=$1',[id])).rows[0];
    if(!old)return res.status(404).json({error:'ไม่พบรายการแจ้งซ่อม'});
    const status=x.status||old.status, done=['completed','cancelled'].includes(status);
    const r=(await pool.query('UPDATE repairs SET status=$1,technician=$2,details=$3,updated_at=NOW(),completed_at=$4 WHERE id=$5 RETURNING *',[status,x.technician||old.technician,x.details??old.details,done?new Date():null,id])).rows[0];
    await pool.query("UPDATE devices SET status=$1,updated_at=NOW() WHERE id=$2",[done?'available':'repair',old.device_id]);
    const merged={...old,...r,serial_number:old.serial_number,asset_code:old.asset_code};
    const email=await sendStatusEmail(merged);
    res.json({ok:true,repair:merged,emailSent:email.sent,emailError:email.sent?null:email.error});
  }catch(e){console.error('[REPAIR PATCH]',e);res.status(500).json({error:e.message||'อัปเดตสถานะไม่สำเร็จ'})}
});

export default async function handler(req,res){return app(req,res);}
