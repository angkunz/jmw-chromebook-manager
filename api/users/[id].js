import { pool, requireAdmin } from '../_db.js';

export default async function handler(req,res){
  try{
    const session=await requireAdmin(req,res); if(!session) return;
    const id=Number(req.query?.id||req.url?.split('/').filter(Boolean).pop());
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'รหัสผู้ใช้ไม่ถูกต้อง'});
    if(req.method==='DELETE'){
      const r=await pool.query('UPDATE users SET active=FALSE, device_id=NULL, updated_at=NOW() WHERE id=$1 RETURNING id,full_name',[id]);
      if(!r.rows[0])return res.status(404).json({error:'ไม่พบผู้ใช้อุปกรณ์'});
      await pool.query('INSERT INTO audit_log(admin_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[session.admin_id,'delete','user',id,r.rows[0].full_name]);
      return res.json({ok:true,deleted:r.rows[0]});
    }
    return res.status(405).json({error:'Method Not Allowed'});
  }catch(e){console.error('[USER DELETE]',e);res.status(500).json({error:e.message||'ลบผู้ใช้อุปกรณ์ไม่สำเร็จ'})}
}
