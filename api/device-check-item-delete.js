import { Pool } from 'pg';
import crypto from 'crypto';

const dbUrl=process.env.DATABASE_URL;
const pool=dbUrl?new Pool({connectionString:dbUrl,ssl:!dbUrl.includes('localhost')?{rejectUnauthorized:false}:undefined,max:2}):null;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const send=(res,data,status=200)=>res.status(status).json(data);
async function requireAdmin(req,res){let token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token){const m=(req.headers.cookie||'').match(/(?:^|;\s*)jmw_session=([^;]+)/);token=m?.[1]}if(!token)return send(res,{error:'กรุณาเข้าสู่ระบบ'},401),false;const s=(await pool.query('SELECT s.token_hash FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[sha(token)])).rows[0];if(!s)return send(res,{error:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'},401),false;return true}
export default async function handler(req,res){
 try{
  if(!pool)return send(res,{error:'DATABASE_URL is not configured'},500);
  if(req.method!=='POST')return send(res,{error:'Method Not Allowed'},405);
  if(!(await requireAdmin(req,res)))return;
  const id=Number(req.body?.id);if(!id)return send(res,{error:'ไม่พบรหัสรายการ'},400);
  const item=(await pool.query('SELECT id,label FROM device_check_items WHERE id=$1',[id])).rows[0];if(!item)return send(res,{error:'ไม่พบรายการตรวจ'},404);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const results=Number((await client.query('SELECT COUNT(*)::int c FROM device_check_results WHERE item_id=$1',[id])).rows[0].c);
   await client.query('DELETE FROM device_check_results WHERE item_id=$1',[id]);
   await client.query('DELETE FROM device_check_items WHERE id=$1',[id]);
   await client.query('COMMIT');
   return send(res,{ok:true,deleted_results:results,message:results?`ลบรายการ "${item.label}" และผลตรวจย้อนหลัง ${results} รายการแล้ว`:`ลบรายการ "${item.label}" เรียบร้อยแล้ว`});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }catch(e){console.error('[DEVICE CHECK ITEM DELETE]',e);return send(res,{error:e.message||'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์'},500)}
}