import app from '../server.js';
import { Pool } from 'pg';
import crypto from 'crypto';
import XLSX from 'xlsx';

const dbUrl = process.env.DATABASE_URL;
const pool = dbUrl ? new Pool({connectionString:dbUrl,ssl:!dbUrl.includes('localhost')?{rejectUnauthorized:false}:undefined,max:3}) : null;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
let initPromise;
async function ensureDb(){
  if(!pool) throw new Error('DATABASE_URL is not configured');
  if(!initPromise)initPromise=pool.query('SELECT 1');
  await initPromise;
}
async function adminSession(req){
  await ensureDb();
  let token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token){const m=(req.headers.cookie||'').match(/(?:^|;\s*)jmw_session=([^;]+)/);token=m?.[1]}
  if(!token)return null;
  return (await pool.query('SELECT s.*,a.username,a.role FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[sha(token)])).rows[0]||null;
}

app.get('/api/public/repair-status/:id',async(req,res)=>{
  try{
    await ensureDb();
    const id=Number(req.params.id); const email=String(req.query.email||'').trim().toLowerCase();
    if(!id||!email)return res.status(400).json({error:'กรุณาระบุเลขที่แจ้งซ่อมและอีเมล'});
    const row=(await pool.query(`SELECT r.id,r.status,r.opened_at,r.updated_at,r.completed_at,r.reporter_name,r.reporter_email,r.issue,r.details,r.technician,d.serial_number,d.asset_code FROM repairs r JOIN devices d ON d.id=r.device_id WHERE r.id=$1 AND LOWER(COALESCE(r.reporter_email,''))=$2`,[id,email])).rows[0];
    if(!row)return res.status(404).json({error:'ไม่พบรายการแจ้งซ่อม หรืออีเมลไม่ตรงกับข้อมูลที่แจ้งไว้'});
    const labels={received:'รับเรื่องแล้ว',checking:'กำลังตรวจสอบ',waiting_parts:'รออะไหล่',repairing:'กำลังซ่อม',completed:'ซ่อมเสร็จแล้ว',cancelled:'ยกเลิก'};
    res.setHeader('Cache-Control','no-store');res.json({ok:true,repair:{...row,status_label:labels[row.status]||row.status}});
  }catch(e){res.status(500).json({error:e.message||'ไม่สามารถตรวจสอบสถานะได้'})}
});

app.get('/api/template',async(req,res)=>{
  try{
    await ensureDb();
    const wb=XLSX.utils.book_new();
    const guide=XLSX.utils.aoa_to_sheet([['JMW Chromebook Manager'],['Template สำหรับนำเข้าข้อมูล Chromebook'],[],['ชีต “อุปกรณ์”','จำเป็น: S/N, รหัสเครื่อง, ยี่ห้อ, รุ่น'],['ชีต “ผู้ใช้”','จำเป็น: ชื่อผู้ใช้เครื่อง, ระดับชั้น/ฝ่ายงาน, วันที่ยืม และ S/N หรือ รหัสเครื่อง'],['วันที่ต้องคืน','เว้นว่างสำหรับ ม.4–ม.6 ให้ระบบคำนวณอัตโนมัติ: ม.4 +3 ปี, ม.5 +2 ปี, ม.6 +1 ปี'],['รูปแบบวันที่','แนะนำ YYYY-MM-DD เช่น 2026-08-18']]);guide['!cols']=[{wch:24},{wch:72}];XLSX.utils.book_append_sheet(wb,guide,'คำแนะนำ');
    const devices=XLSX.utils.aoa_to_sheet([['S/N','รหัสเครื่อง','ยี่ห้อ','รุ่น','สถานะ','วันที่ซื้อ','หมายเหตุ'],['ABC123456','JMW-CB-001','Acer','Chromebook 314','available','2026-05-10',''],['DEF789012','JMW-CB-002','Lenovo','100e Chromebook','assigned','2026-05-10','']]);devices['!cols']=[{wch:20},{wch:18},{wch:16},{wch:24},{wch:18},{wch:16},{wch:30}];XLSX.utils.book_append_sheet(wb,devices,'อุปกรณ์');
    const users=XLSX.utils.aoa_to_sheet([['ชื่อผู้ใช้เครื่อง','ประเภท','ระดับชั้น/ฝ่ายงาน','อีเมล','เบอร์โทร','S/N','รหัสเครื่อง','วันที่ยืม','วันที่ต้องคืน','เหตุผลคืน'],['ด.ช.สมชาย ใจดี','นักเรียน','ม.4/1','student@example.com','0812345678','ABC123456','JMW-CB-001','2026-08-18','',''],['ด.ญ.สุดา รักเรียน','นักเรียน','ม.5/2','student2@example.com','0823456789','DEF789012','JMW-CB-002','2026-08-18','','']]);users['!cols']=[{wch:24},{wch:14},{wch:22},{wch:28},{wch:16},{wch:20},{wch:18},{wch:16},{wch:18},{wch:18}];XLSX.utils.book_append_sheet(wb,users,'ผู้ใช้');
    const buffer=XLSX.write(wb,{bookType:'xlsx',type:'buffer'});res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="JMW_Chromebook_Import_Template.xlsx"');res.setHeader('Cache-Control','no-store');res.status(200).send(buffer);
  }catch(e){res.status(500).json({error:e.message||'สร้าง Template ไม่สำเร็จ'})}
});

app.post('/api/import-excel',async(req,res)=>{
  try{
    const s=await adminSession(req); if(!s)return res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});
    return res.status(501).json({error:'Import Excel endpoint ต้องใช้ไฟล์อัปโหลดและจะถูกรวมในรอบถัดไป'});
  }catch(e){res.status(500).json({error:e.message||'นำเข้าไม่สำเร็จ'})}
});

export default app;
