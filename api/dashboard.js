import { Pool } from 'pg';
import crypto from 'crypto';
const dbUrl=process.env.DATABASE_URL;
const pool=dbUrl?new Pool({connectionString:dbUrl,ssl:!dbUrl.includes('localhost')?{rejectUnauthorized:false}:undefined,max:2}):null;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const send=(res,d,s=200)=>{res.setHeader('Cache-Control','no-store,max-age=0');return res.status(s).json(d)};
async function auth(req,res){if(!pool){send(res,{error:'DATABASE_URL is not configured'},500);return false}let t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!t){const m=(req.headers.cookie||'').match(/(?:^|;\s*)jmw_session=([^;]+)/);t=m?.[1]}if(!t){send(res,{error:'กรุณาเข้าสู่ระบบ'},401);return false}const r=await pool.query('SELECT s.admin_id FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[sha(t)]);if(!r.rows[0]){send(res,{error:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'},401);return false}return true}
export default async function handler(req,res){try{if(req.method!=='GET')return send(res,{error:'Method Not Allowed'},405);if(!(await auth(req,res)))return;
 const devices=(await pool.query('SELECT id,status FROM devices')).rows;
 const users=(await pool.query('SELECT id,device_id,active,return_due_date FROM users')).rows;
 const repairs=(await pool.query('SELECT id,device_id,status FROM repairs ORDER BY id DESC')).rows;
 const activeUsers=users.filter(u=>u.active!==false);
 const assignedIds=new Set(activeUsers.filter(u=>u.device_id).map(u=>Number(u.device_id)));
 const latest=new Map();for(const r of repairs){const id=Number(r.device_id);if(id&&!latest.has(id))latest.set(id,r)}
 const repairIds=new Set([...latest].filter(([,r])=>!['completed','cancelled'].includes(r.status)).map(([id])=>id));
 const retired=devices.filter(d=>d.status==='retired').length;
 const repair=devices.filter(d=>repairIds.has(Number(d.id))).length;
 const assigned=devices.filter(d=>assignedIds.has(Number(d.id))&&!repairIds.has(Number(d.id))&&d.status!=='retired').length;
 const available=Math.max(0,devices.length-retired-repair-assigned);
 const overdue=activeUsers.filter(u=>u.return_due_date&&String(u.return_due_date).slice(0,10)<new Date().toISOString().slice(0,10)).length;
 const repairsOpen=repairs.filter(r=>!['completed','cancelled'].includes(r.status)).length;
 return send(res,{total:devices.length,available,assigned,repair,retired,overdue,repairsOpen});
}catch(e){console.error('[DASHBOARD]',e);return send(res,{error:e.message||'โหลด Dashboard ไม่สำเร็จ'},500)}}