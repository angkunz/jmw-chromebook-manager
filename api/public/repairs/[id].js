import { pool, initDb } from '../../../api/_db.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method Not Allowed'});
  try{
    await initDb();
    const id=Number(req.query?.id||req.url?.split('/').filter(Boolean).pop());
    const email=String(req.query?.email||'').trim().toLowerCase();
    if(!Number.isInteger(id)||id<=0||!email) return res.status(400).json({error:'กรุณาระบุเลขที่แจ้งซ่อมและอีเมล'});
    const row=(await pool.query(`SELECT r.id,r.status,r.opened_at,r.updated_at,r.completed_at,r.reporter_name,r.reporter_email,r.issue,r.details,r.technician,d.serial_number,d.asset_code FROM repairs r JOIN devices d ON d.id=r.device_id WHERE r.id=$1 AND LOWER(COALESCE(r.reporter_email,''))=$2`,[id,email])).rows[0];
    if(!row) return res.status(404).json({error:'ไม่พบรายการแจ้งซ่อม หรืออีเมลไม่ตรงกับข้อมูลที่แจ้งไว้'});
    const labels={received:'รับเรื่องแล้ว',checking:'กำลังตรวจสอบ',waiting_parts:'รออะไหล่',repairing:'กำลังซ่อม',completed:'ซ่อมเสร็จแล้ว',cancelled:'ยกเลิก'};
    res.setHeader('Cache-Control','no-store,max-age=0');
    res.json({ok:true,repair:{...row,status_label:labels[row.status]||row.status}});
  }catch(e){console.error('[PUBLIC REPAIR STATUS]',e);res.status(500).json({error:e.message||'ไม่สามารถตรวจสอบสถานะได้'})}
}
