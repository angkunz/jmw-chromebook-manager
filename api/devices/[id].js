import { pool, requireAdmin } from '../_db.js';

export default async function handler(req,res){
  try{
    const session=await requireAdmin(req,res); if(!session) return;
    const id=Number(req.query?.id||req.url?.split('/').filter(Boolean).pop());
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'รหัสอุปกรณ์ไม่ถูกต้อง'});
    if(req.method==='DELETE'){
      const linked=(await pool.query('SELECT id FROM users WHERE active=TRUE AND device_id=$1 LIMIT 1',[id])).rows[0];
      if(linked)return res.status(409).json({error:'อุปกรณ์ยังถูกยืมใช้งานอยู่ ไม่สามารถลบได้'});
      const r=await pool.query('DELETE FROM devices WHERE id=$1 RETURNING id,serial_number,asset_code',[id]);
      if(!r.rows[0])return res.status(404).json({error:'ไม่พบอุปกรณ์'});
      await pool.query('INSERT INTO audit_log(admin_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[session.admin_id,'delete','device',id,`${r.rows[0].serial_number} / ${r.rows[0].asset_code}`]);
      return res.json({ok:true,deleted:r.rows[0]});
    }
    return res.status(405).json({error:'Method Not Allowed'});
  }catch(e){console.error('[DEVICE DELETE]',e);res.status(500).json({error:e.message||'ลบอุปกรณ์ไม่สำเร็จ'})}
}
