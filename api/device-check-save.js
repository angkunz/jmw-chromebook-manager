import { Pool } from 'pg';
const dbUrl=process.env.DATABASE_URL;
const pool=dbUrl?new Pool({connectionString:dbUrl,ssl:!dbUrl.includes('localhost')?{rejectUnauthorized:false}:undefined,max:2}):null;
const clean=v=>String(v??'').trim();
const monthDate=v=>/^\d{4}-\d{2}$/.test(clean(v))?`${v}-01`:null;
const dateOnly=d=>`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}`;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method Not Allowed'});
 if(!pool)return res.status(500).json({error:'DATABASE_URL is not configured'});
 const x=req.body||{},room=clean(x.class_or_department),month=monthDate(x.month),name=clean(x.inspector_name),signature=clean(x.inspector_signature)||'-';
 if(!room||!month||!name||!Array.isArray(x.students))return res.status(400).json({error:'กรุณากรอกข้อมูลให้ครบ'});
 const flat=[];for(const st of x.students){if(!st.device_id||!st.user_id||!Array.isArray(st.items))return res.status(400).json({error:'รูปแบบข้อมูลการตรวจไม่ถูกต้อง'});for(const item of st.items){if(!item.item_id||typeof item.is_normal!=='boolean')return res.status(400).json({error:'มีรายการตรวจที่ข้อมูลไม่ครบ'});if(!item.is_normal&&!clean(item.detail))return res.status(400).json({error:`กรุณาระบุรายละเอียดรายการที่ไม่ปกติของ ${st.full_name||'ผู้ใช้เครื่อง'}`});flat.push({device_id:Number(st.device_id),user_id:Number(st.user_id),item_id:Number(item.item_id),is_normal:item.is_normal,detail:clean(item.detail)||null})}}
 const client=await pool.connect();try{await client.query('BEGIN');
  const existing=(await client.query("SELECT id FROM device_checks WHERE check_month=$1 AND UPPER(REGEXP_REPLACE(class_or_department,'\\s+','','g'))=UPPER(REGEXP_REPLACE($2,'\\s+','','g')) LIMIT 1",[month,room])).rows[0];
  const h=existing?(await client.query('UPDATE device_checks SET class_or_department=$1,inspector_name=$2,inspector_signature=$3,checked_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *',[room,name,signature,existing.id])).rows[0]:(await client.query('INSERT INTO device_checks(check_month,class_or_department,inspector_name,inspector_signature,checked_at,updated_at) VALUES($1,$2,$3,$4,NOW(),NOW()) RETURNING *',[month,room,name,signature])).rows[0];
  await client.query('DELETE FROM device_check_results WHERE check_id=$1',[h.id]);
  const labels=(await client.query('SELECT id,label FROM device_check_items')).rows.reduce((m,r)=>(m[r.id]=r.label,m),{});
  for(let offset=0;offset<flat.length;offset+=150){const chunk=flat.slice(offset,offset+150),vals=[],params=[];chunk.forEach((r,i)=>{const b=i*7;vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`);params.push(h.id,r.device_id,r.user_id,r.item_id,labels[r.item_id]||'รายการตรวจ',r.is_normal,r.detail)});await client.query(`INSERT INTO device_check_results(check_id,device_id,user_id,item_id,item_label,is_normal,detail) VALUES ${vals.join(',')}`,params)}
  await client.query('COMMIT');return res.json({ok:true,message:'บันทึกการตรวจอุปกรณ์เรียบร้อยแล้ว',check_id:h.id,month:month.slice(0,7),class_or_department:room,inspector_name:name,checked_at:dateOnly(new Date())});
 }catch(e){await client.query('ROLLBACK');console.error('[DEVICE CHECK SAVE]',e);return res.status(500).json({error:e.message||'บันทึกข้อมูลไม่สำเร็จ'})}finally{client.release()}}
