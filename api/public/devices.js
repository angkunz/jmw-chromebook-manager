import { pool, initDb } from '../../api/_db.js';
export default async function handler(req,res){
  try{await initDb(); if(req.method!=='GET') return res.status(405).json({error:'Method Not Allowed'}); const r=await pool.query("SELECT id,asset_code,serial_number,brand,model FROM devices WHERE status <> 'retired' ORDER BY asset_code"); res.json(r.rows)}
  catch(e){res.status(500).json({error:e.message||'ไม่สามารถโหลดข้อมูลเครื่องได้'})}
}
