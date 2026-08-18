import { pool, initDb, requireAdmin } from '../../api/_db.js';

export default async function handler(req, res) {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;
    if (req.method !== 'PATCH' && req.method !== 'PUT') return res.status(405).json({ error: 'Method Not Allowed' });
    const id = Number(req.query?.id || req.url?.split('/').filter(Boolean).pop());
    const { status, technician, details } = req.body || {};
    const allowed = ['received','checking','waiting_parts','repairing','completed','cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'สถานะการซ่อมไม่ถูกต้อง' });
    const r = await pool.query(
      `UPDATE repairs SET status=$1, technician=COALESCE($2,technician), details=COALESCE($3,details), updated_at=NOW(), completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END WHERE id=$4 RETURNING *`,
      [status, technician || null, details || null, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'ไม่พบรายการแจ้งซ่อม' });
    if (status === 'completed' || status === 'cancelled') {
      await pool.query("UPDATE devices SET status='available',updated_at=NOW() WHERE id=$1 AND status='repair'", [r.rows[0].device_id]);
    } else {
      await pool.query("UPDATE devices SET status='repair',updated_at=NOW() WHERE id=$1", [r.rows[0].device_id]);
    }
    res.json({ ok: true, repair: r.rows[0] });
  } catch (e) {
    console.error('[REPAIR UPDATE]', e);
    res.status(500).json({ error: e.message || 'ไม่สามารถอัปเดตสถานะได้' });
  }
}
