import multer from 'multer';
import * as XLSX from 'xlsx';
import { pool, requireAdmin } from './_db.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadOne = upload.single('file');
const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\s_\-./()]/g,'');
const pick = (row,names) => { const keys=Object.keys(row), target=names.map(norm), key=keys.find(k=>target.includes(norm(k))); return key ? row[key] : ''; };
const dateOnly = v => { if(!v) return null; if(v instanceof Date) return v.toISOString().slice(0,10); if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;} const s=String(v).trim(); return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)?s:null; };
const yearsForClass = v => { const s=norm(v); if(/ม4/.test(s)) return 3; if(/ม5/.test(s)) return 2; if(/ม6/.test(s)) return 1; return null; };
const addYears = (date,years) => { if(!date||!years)return null; const d=new Date(`${date}T00:00:00`), day=d.getDate(); d.setFullYear(d.getFullYear()+years); if(d.getDate()!==day)d.setDate(0); return d.toISOString().slice(0,10); };

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method Not Allowed'});
 try{
  const session=await requireAdmin(req,res); if(!session)return;
  await new Promise((resolve,reject)=>uploadOne(req,res,err=>err?reject(err):resolve()));
  if(!req.file)return res.status(400).json({error:'กรุณาเลือกไฟล์ Excel'});
  const wb=XLSX.read(req.file.buffer,{type:'buffer',cellDates:true});
  const deviceSheetName=wb.SheetNames.find(s=>['devices','device','อุปกรณ์','เครื่อง','เครื่องchromebook'].includes(norm(s))) || wb.SheetNames[0];
  const userSheetName=wb.SheetNames.find(s=>['users','user','ผู้ใช้','ผู้ใช้อุปกรณ์','ผู้ใช้งาน'].includes(norm(s))) || wb.SheetNames[1];
  if(!deviceSheetName||!userSheetName)return res.status(400).json({error:'ไฟล์ต้องมีอย่างน้อย 2 ชีต: อุปกรณ์ และ ผู้ใช้'});
  const devices=XLSX.utils.sheet_to_json(wb.Sheets[deviceSheetName],{defval:''}), users=XLSX.utils.sheet_to_json(wb.Sheets[userSheetName],{defval:''});
  const client=await pool.connect(); let deviceCount=0,userCount=0,skipped=0;
  try{await client.query('BEGIN'); const deviceMap=new Map();
   for(const row of devices){const serial=String(pick(row,['s/n','sn','serial_number','serial number','serial','หมายเลขเครื่อง'])).trim();const asset=String(pick(row,['รหัสเครื่อง','asset_code','asset code','รหัสทรัพย์สิน','asset'])).trim();if(!serial||!asset){skipped++;continue}const brand=String(pick(row,['ยี่ห้อ','brand','manufacturer'])).trim()||'ไม่ระบุ';const model=String(pick(row,['รุ่น','model'])).trim()||'ไม่ระบุ';const status=String(pick(row,['สถานะ','status'])).trim()||'available';const note=String(pick(row,['หมายเหตุ','note'])).trim()||null;const r=await client.query(`INSERT INTO devices(serial_number,asset_code,brand,model,status,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(serial_number) DO UPDATE SET asset_code=EXCLUDED.asset_code,brand=EXCLUDED.brand,model=EXCLUDED.model,status=EXCLUDED.status,note=EXCLUDED.note,updated_at=NOW() RETURNING id,serial_number,asset_code`,[serial,asset,brand,model,status,note]);deviceMap.set(serial,r.rows[0].id);deviceMap.set(asset,r.rows[0].id);deviceCount++}
   for(const row of users){const name=String(pick(row,['ชื่อผู้ใช้เครื่อง','ชื่อ-นามสกุล','ชื่อ','full_name','fullname','name'])).trim();if(!name){skipped++;continue}const serial=String(pick(row,['s/n','sn','serial_number','serial number','serial'])).trim();const asset=String(pick(row,['รหัสเครื่อง','asset_code','asset code','asset'])).trim();const deviceId=deviceMap.get(serial)||deviceMap.get(asset)||null;const type=String(pick(row,['ประเภท','type'])).trim()||'student';const dept=String(pick(row,['ระดับชั้น/ฝ่ายงาน','ระดับชั้น','ชั้น','ฝ่ายงาน','class_or_department','department'])).trim()||null;const email=String(pick(row,['อีเมล','email'])).trim()||null;const phone=String(pick(row,['โทรศัพท์','เบอร์โทร','phone'])).trim()||null;const borrow=dateOnly(pick(row,['วันที่ยืม','borrow_date','borrow']));const explicitDue=dateOnly(pick(row,['วันที่ต้องคืน','วันคืน','return_due_date']));const due=addYears(borrow,yearsForClass(dept))||explicitDue;const reason=String(pick(row,['เหตุผลคืน','return_reason'])).trim()||null;const activeValue=norm(pick(row,['สถานะผู้ใช้','active']));const active=!['0','false','ไม่ใช้งาน','ยกเลิก'].includes(activeValue);await client.query(`INSERT INTO users(full_name,type,class_or_department,email,phone,device_id,borrow_date,return_due_date,return_reason,active,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,[name,type,dept,email,phone,deviceId,borrow,due,reason,active]);if(deviceId&&active)await client.query("UPDATE devices SET status='assigned',updated_at=NOW() WHERE id=$1 AND status NOT IN ('repair','retired')",[deviceId]);userCount++}
   await client.query('INSERT INTO audit_log(admin_id,action,entity,detail) VALUES($1,$2,$3,$4)',[session.admin_id,'import','excel',`อุปกรณ์ ${deviceCount} รายการ ผู้ใช้ ${userCount} รายการ ข้าม ${skipped} รายการ`]);await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  res.json({ok:true,devices:deviceCount,users:userCount,skipped,message:`นำเข้าสำเร็จ ${deviceCount} เครื่อง และ ${userCount} ผู้ใช้${skipped?` (ข้าม ${skipped} รายการ)`:''}`});
 }catch(e){console.error('[IMPORT EXCEL]',e);res.status(500).json({error:e.message||'นำเข้า Excel ไม่สำเร็จ'})}
}
