import { Pool } from 'pg';
import crypto from 'crypto';

const dbUrl = process.env.DATABASE_URL;
const pool = dbUrl ? new Pool({ connectionString: dbUrl, ssl: !dbUrl.includes('localhost') ? { rejectUnauthorized:false } : undefined, max:2 }) : null;
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const clean = v => String(v ?? '').trim();
const monthDate = v => /^\d{4}-\d{2}$/.test(clean(v)) ? `${v}-01` : null;
const dateOnly = v => { const s=String(v??''); const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:s; };
const roomKey = v => clean(v).replace(/\s+/g,'').toUpperCase();

let ready;
async function init(){
  if(!pool) throw new Error('DATABASE_URL is not configured');
  if(ready) return ready;
  ready=(async()=>{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_check_items(
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS device_checks(
        id SERIAL PRIMARY KEY,
        check_month DATE NOT NULL,
        class_or_department TEXT NOT NULL,
        inspector_name TEXT NOT NULL,
        inspector_signature TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(check_month,class_or_department)
      );
      CREATE TABLE IF NOT EXISTS device_check_results(
        id SERIAL PRIMARY KEY,
        check_id INT NOT NULL REFERENCES device_checks(id) ON DELETE CASCADE,
        device_id INT REFERENCES devices(id) ON DELETE SET NULL,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        item_id INT REFERENCES device_check_items(id) ON DELETE SET NULL,
        item_label TEXT NOT NULL,
        is_normal BOOLEAN NOT NULL,
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(check_id,device_id,item_id)
      );
    `);
    const count=Number((await pool.query('SELECT COUNT(*) c FROM device_check_items')).rows[0].c);
    if(count===0){
      const seeds=[
        ['เปิดเครื่องและหน้าจอทำงานปกติ','ไม่มีภาพดับ/เส้น/จอกระพริบ'],
        ['แป้นพิมพ์และทัชแพดทำงานปกติ','ปุ่มกดและทัชแพดใช้งานได้'],
        ['Wi-Fi และอินเทอร์เน็ตใช้งานได้','เชื่อมต่อเครือข่ายและใช้งานอินเทอร์เน็ตได้'],
        ['แบตเตอรี่และการชาร์จปกติ','ชาร์จเข้า ไม่มีอาการผิดปกติของอะแดปเตอร์'],
        ['กล้อง ไมโครโฟน และลำโพงปกติ','ทดสอบเสียง/ภาพพื้นฐานแล้วใช้งานได้'],
        ['ตัวเครื่อง บานพับ และอุปกรณ์ภายนอกปกติ','ไม่มีแตกหัก หลวม หรือชำรุด'],
        ['ระบบปฏิบัติการและการอัปเดตปกติ','สามารถเข้าสู่ระบบและอัปเดตได้'],
      ];
      for(let i=0;i<seeds.length;i++) await pool.query('INSERT INTO device_check_items(label,description,sort_order) VALUES($1,$2,$3)',[seeds[i][0],seeds[i][1],i+1]);
    }
  })();
  return ready;
}
async function requireAdmin(req,res){
  let token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token){const m=(req.headers.cookie||'').match(/(?:^|;\s*)jmw_session=([^;]+)/);token=m?.[1];}
  if(!token){res.status(401).json({error:'กรุณาเข้าสู่ระบบ'});return null;}
  const s=(await pool.query('SELECT s.*,a.username,a.role FROM sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND a.active=TRUE',[sha(token)])).rows[0];
  if(!s){res.status(401).json({error:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'});return null;}
  return s;
}
function send(res,data,status=200){res.status(status).json(data)}

export default async function handler(req,res){
  try{
    await init();
    const action=clean(req.query?.action||'rooms');

    if(req.method==='GET' && action==='rooms'){
      const rows=(await pool.query(`
        SELECT
          MIN(TRIM(u.class_or_department)) AS class_or_department,
          COUNT(*)::int AS device_count
        FROM users u
        JOIN devices d ON d.id=u.device_id
        WHERE u.active=TRUE
          AND u.device_id IS NOT NULL
          AND COALESCE(TRIM(u.class_or_department),'')<>''
        GROUP BY UPPER(REGEXP_REPLACE(TRIM(u.class_or_department),'\\s+','','g'))
        ORDER BY MIN(TRIM(u.class_or_department))
      `)).rows;
      return send(res,{ok:true,rooms:rows});
    }
    if(req.method==='GET' && action==='items'){
      const rows=(await pool.query('SELECT id,label,description,sort_order FROM device_check_items WHERE active=TRUE ORDER BY sort_order,id')).rows;
      return send(res,{ok:true,items:rows});
    }
    if(req.method==='GET' && action==='roster'){
      const room=clean(req.query?.class_or_department); if(!room)return send(res,{error:'กรุณาระบุห้อง'},400);
      const rows=(await pool.query(`
        SELECT u.id user_id,u.full_name,u.class_or_department,d.id device_id,d.serial_number,d.asset_code,d.brand,d.model
        FROM users u JOIN devices d ON d.id=u.device_id
        WHERE u.active=TRUE
          AND u.device_id IS NOT NULL
          AND COALESCE(TRIM(u.class_or_department),'')<>''
          AND UPPER(REGEXP_REPLACE(TRIM(u.class_or_department),'\\s+','','g'))=UPPER(REGEXP_REPLACE($1,'\\s+','','g'))
        ORDER BY u.full_name
      `,[room])).rows;
      return send(res,{ok:true,room,students:rows});
    }
    if(req.method==='GET' && action==='latest'){
      const room=clean(req.query?.class_or_department); if(!room)return send(res,{error:'กรุณาระบุห้อง'},400);
      const month=monthDate(req.query?.month);
      const header=month ? (await pool.query('SELECT * FROM device_checks WHERE UPPER(REGEXP_REPLACE(class_or_department,\'\\s+\',\'\',\'g\'))=UPPER(REGEXP_REPLACE($1,\'\\s+\',\'\',\'g\')) AND check_month=$2 LIMIT 1',[room,month])).rows[0] : (await pool.query('SELECT * FROM device_checks WHERE UPPER(REGEXP_REPLACE(class_or_department,\'\\s+\',\'\',\'g\'))=UPPER(REGEXP_REPLACE($1,\'\\s+\',\'\',\'g\')) ORDER BY check_month DESC,checked_at DESC LIMIT 1',[room])).rows[0];
      if(!header)return send(res,{ok:true,check:null});
      const rows=(await pool.query('SELECT id,device_id,user_id,item_id,item_label,is_normal,detail FROM device_check_results WHERE check_id=$1 ORDER BY user_id,item_id,id',[header.id])).rows;
      return send(res,{ok:true,check:{id:header.id,check_month:String(header.check_month).slice(0,7),class_or_department:header.class_or_department,inspector_name:header.inspector_name,inspector_signature:header.inspector_signature,checked_at:dateOnly(header.checked_at),results:rows}});
    }
    if(req.method==='POST' && action==='save'){
      const x=req.body||{},room=clean(x.class_or_department),month=monthDate(x.month),name=clean(x.inspector_name),signature=clean(x.inspector_signature);
      if(!room||!month||!name||!signature||!Array.isArray(x.students))return send(res,{error:'กรุณากรอกข้อมูลให้ครบ โดยเฉพาะชื่อและลายเซ็นผู้ตรวจ'},400);
      for(const st of x.students){
        if(!st.device_id||!st.user_id||!Array.isArray(st.items))return send(res,{error:'รูปแบบข้อมูลการตรวจไม่ถูกต้อง'},400);
        for(const item of st.items){if(!item.item_id||typeof item.is_normal!=='boolean')return send(res,{error:'มีรายการตรวจที่ข้อมูลไม่ครบ'},400);if(!item.is_normal&&!clean(item.detail))return send(res,{error:`กรุณาระบุรายละเอียดรายการที่ไม่ปกติของ ${st.full_name||'ผู้ใช้เครื่อง'}`},400)}
      }
      const client=await pool.connect();try{
        await client.query('BEGIN');
        const existing=(await client.query('SELECT id FROM device_checks WHERE check_month=$1 AND UPPER(REGEXP_REPLACE(class_or_department,\'\\s+\',\'\',\'g\'))=UPPER(REGEXP_REPLACE($2,\'\\s+\',\'\',\'g\')) LIMIT 1',[month,room])).rows[0];
        const h=existing ? (await client.query('UPDATE device_checks SET class_or_department=$1,inspector_name=$2,inspector_signature=$3,checked_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *',[room,name,signature,existing.id])).rows[0] : (await client.query(`INSERT INTO device_checks(check_month,class_or_department,inspector_name,inspector_signature,checked_at,updated_at) VALUES($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,[month,room,name,signature])).rows[0];
        await client.query('DELETE FROM device_check_results WHERE check_id=$1',[h.id]);
        for(const st of x.students){for(const item of st.items){const meta=(await client.query('SELECT label FROM device_check_items WHERE id=$1 LIMIT 1',[item.item_id])).rows[0];await client.query(`INSERT INTO device_check_results(check_id,device_id,user_id,item_id,item_label,is_normal,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,[h.id,st.device_id,st.user_id,item.item_id,meta?.label||clean(item.item_label)||'รายการตรวจ',item.is_normal,clean(item.detail)||null])}}
        await client.query('COMMIT');
        return send(res,{ok:true,message:'บันทึกการตรวจอุปกรณ์เรียบร้อยแล้ว',check_id:h.id,month:month.slice(0,7),class_or_department:room,inspector_name:name,checked_at:dateOnly(new Date())});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }

    const admin=await requireAdmin(req,res); if(!admin)return;
    if(req.method==='GET' && action==='admin-items'){
      const rows=(await pool.query('SELECT id,label,description,sort_order,active,created_at,updated_at FROM device_check_items ORDER BY active DESC,sort_order,id')).rows;
      return send(res,{ok:true,items:rows});
    }
    if(req.method==='POST' && action==='admin-item-save'){
      const x=req.body||{},label=clean(x.label);if(!label)return send(res,{error:'กรุณาระบุรายการตรวจ'},400);
      let r;if(x.id){r=await pool.query('UPDATE device_check_items SET label=$1,description=$2,sort_order=$3,active=$4,updated_at=NOW() WHERE id=$5 RETURNING *',[label,clean(x.description)||null,Number(x.sort_order)||0,x.active!==false,x.id])}else{r=await pool.query('INSERT INTO device_check_items(label,description,sort_order,active) VALUES($1,$2,$3,$4) RETURNING *',[label,clean(x.description)||null,Number(x.sort_order)||0,true])}return send(res,{ok:true,item:r.rows[0]});
    }
    if(req.method==='POST' && action==='admin-item-delete'){
      const id=Number(req.body?.id);if(!id)return send(res,{error:'ไม่พบรหัสรายการ'},400);await pool.query('UPDATE device_check_items SET active=FALSE,updated_at=NOW() WHERE id=$1',[id]);return send(res,{ok:true});
    }
    if(req.method==='GET' && action==='admin-reports'){
      const month=monthDate(req.query?.month),room=clean(req.query?.class_or_department);const params=[];let where=[];if(month){params.push(month);where.push(`c.check_month=$${params.length}`)}if(room){params.push(room);where.push(`UPPER(REGEXP_REPLACE(c.class_or_department,'\\s+','','g'))=UPPER(REGEXP_REPLACE($${params.length},'\\s+','','g'))`)}
      const rows=(await pool.query(`SELECT c.id,c.check_month,c.class_or_department,c.inspector_name,c.inspector_signature,c.checked_at,COUNT(DISTINCT r.device_id)::int device_count,COUNT(r.id)::int total_checks,COUNT(r.id) FILTER (WHERE r.is_normal=FALSE)::int abnormal_checks,COUNT(r.id) FILTER (WHERE r.is_normal=TRUE)::int normal_checks FROM device_checks c LEFT JOIN device_check_results r ON r.check_id=c.id ${where.length?'WHERE '+where.join(' AND '):''} GROUP BY c.id ORDER BY c.check_month DESC,c.class_or_department`,params)).rows;
      return send(res,{ok:true,reports:rows.map(x=>({...x,check_month:String(x.check_month).slice(0,7),checked_at:dateOnly(x.checked_at)}))});
    }
    if(req.method==='GET' && action==='admin-detail'){
      const id=Number(req.query?.id);if(!id)return send(res,{error:'ไม่พบรหัสรายงาน'},400);const h=(await pool.query('SELECT * FROM device_checks WHERE id=$1',[id])).rows[0];if(!h)return send(res,{error:'ไม่พบรายงาน'},404);const rows=(await pool.query(`SELECT r.*,u.full_name,u.class_or_department,d.serial_number,d.asset_code FROM device_check_results r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN devices d ON d.id=r.device_id WHERE r.check_id=$1 ORDER BY u.full_name,r.item_id,r.id`,[id])).rows;return send(res,{ok:true,report:{...h,check_month:String(h.check_month).slice(0,7),checked_at:dateOnly(h.checked_at),results:rows}});
    }
    if(req.method==='POST' && action==='admin-delete-report'){const id=Number(req.body?.id);if(!id)return send(res,{error:'ไม่พบรหัสรายงาน'},400);await pool.query('DELETE FROM device_checks WHERE id=$1',[id]);return send(res,{ok:true});}
    return send(res,{error:'ไม่พบ action'},404);
  }catch(e){console.error('[DEVICE CHECKS]',e);return send(res,{error:e.message||'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์'},500)}
}
