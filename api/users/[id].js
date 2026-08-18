import { pool, requireAdmin } from '../_db.js';

export default async function handler(req,res){
  try{
    const session=await requireAdmin(req,res); if(!session) return;
    const id=Number(req.query?.id||req.url?.split('/').filter(Boolean).pop());
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'รหัสผู้ใช้ไม่ถูกต้อง'});
    if(req.method==='DELETE'){
      const old=(await pool.query('SELECT id,full_name,device_id FROM users WHERE id=$1',[id])).rows[0];
      if(!old)return res.status(404).json({error:'ไม่พบผู้ใช้อุปกรณ์'});
      await pool.query('UPDATE users SET active=FALSE, device_id=NULL, updated_at=NOW() WHERE id=$1',[id]);
      if(old.device_id)await pool.query("UPDATE devices SET status='available',updated_at=NOW() WHERE id=$1 AND status='assigned'",[old.device_id]);
      await pool.query('INSERT INTO audit_log(admin_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[session.admin_id,'deactivate','user',id,old.full_name]);
      return res.json({ok:true,message:'ดำเนินการสิ้นสุดการใช้งานผู้ใช้อุปกรณ์เรียบร้อยแล้ว'});
    }
    return res.status(405).json({error:'Method Not Allowed'});
  }catch(e){console.error('[USER DELETE]',e);res.status(500).json({error:e.message||'ลบผู้ใช้อุปกรณ์ไม่สำเร็จ'})}
}
