import { pool, initDb } from '../../api/_db.js';

export default async function handler(req, res) {
  try {
    await initDb();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const x = req.body || {};
    if (!x.device_id || !x.reporter_name || !x.issue) return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ' });
    const r = await pool.query(
      `INSERT INTO repairs(device_id,reporter_name,reporter_email,issue,details,status)
       VALUES($1,$2,$3,$4,$5,'received') RETURNING id,device_id,reporter_name,issue,status,opened_at`,
      [Number(x.device_id), String(x.reporter_name).trim(), x.reporter_email || null, String(x.issue).trim(), x.details || null]
    );
    await pool.query("UPDATE devices SET status='repair',updated_at=NOW() WHERE id=$1 AND status <> 'retired'", [Number(x.device_id)]);
    res.status(201).json({ ok: true, repair: r.rows[0], message: 'รับแจ้งซ่อมเรียบร้อยแล้ว' });
  } catch (e) {
    console.error('[PUBLIC REPAIR]', e);
    res.status(500).json({ error: e.message || 'ไม่สามารถแจ้งซ่อมได้' });
  }
}
