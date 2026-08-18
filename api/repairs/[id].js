import nodemailer from 'nodemailer';
import { pool, requireAdmin } from '../_db.js';

function makeMailer() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || '';
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

const labels = {
  received: 'รับเรื่องแล้ว',
  checking: 'กำลังตรวจสอบ',
  waiting_parts: 'รออะไหล่',
  repairing: 'กำลังซ่อม',
  completed: 'ซ่อมเสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

export default async function handler(req, res) {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    if (req.method !== 'PATCH' && req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const id = Number(req.query?.id || req.url?.split('/').filter(Boolean).pop());
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'รหัสงานซ่อมไม่ถูกต้อง' });
    }

    const { status, technician, details } = req.body || {};
    const allowed = Object.keys(labels);
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'สถานะการซ่อมไม่ถูกต้อง' });
    }

    const old = (await pool.query(
      `SELECT r.*, d.asset_code, d.serial_number, d.brand, d.model
       FROM repairs r
       JOIN devices d ON d.id = r.device_id
       WHERE r.id = $1`,
      [id]
    )).rows[0];

    if (!old) return res.status(404).json({ error: 'ไม่พบรายการแจ้งซ่อม' });

    const updated = (await pool.query(
      `UPDATE repairs
       SET status = $1,
           technician = COALESCE($2, technician),
           details = COALESCE($3, details),
           updated_at = NOW(),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $4
       RETURNING *`,
      [status, technician || null, details || null, id]
    )).rows[0];

    const nextDeviceStatus = status === 'completed' || status === 'cancelled' ? 'available' : 'repair';
    await pool.query(
      'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2',
      [nextDeviceStatus, old.device_id]
    );

    await pool.query(
      'INSERT INTO audit_log(admin_id, action, entity, entity_id, detail) VALUES($1,$2,$3,$4,$5)',
      [session.admin_id, 'update', 'repair', id, status]
    );

    let emailSent = false;
    let emailError = null;

    if (old.reporter_email) {
      const mailer = makeMailer();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.SMTP_USERNAME;
      if (!mailer || !from) {
        emailError = 'SMTP ยังไม่ได้ตั้งค่า SMTP_HOST/SMTP_FROM/SMTP_USER ให้ครบ';
      } else {
        try {
          await mailer.sendMail({
            from,
            to: old.reporter_email,
            subject: `อัปเดตสถานะการซ่อม Chromebook #${id}`,
            text: [
              `รายการแจ้งซ่อม #${id}`,
              `S/N: ${old.serial_number || '-'}`,
              `รหัสเครื่อง: ${old.asset_code || '-'}`,
              `สถานะ: ${labels[status]}`,
              `ผู้รับผิดชอบ: ${technician || old.technician || '-'}`,
              `รายละเอียด: ${details || old.details || '-'}`,
            ].join('\n'),
          });
          emailSent = true;
        } catch (e) {
          console.error('[SMTP]', e);
          emailError = e.message || 'ส่งอีเมลไม่สำเร็จ';
        }
      }
    } else {
      emailError = 'ผู้แจ้งไม่มีอีเมลในรายการแจ้งซ่อม';
    }

    res.json({
      ok: true,
      repair: updated,
      emailSent,
      emailError,
      statusLabel: labels[status],
    });
  } catch (e) {
    console.error('[REPAIR UPDATE]', e);
    res.status(500).json({ error: e.message || 'ไม่สามารถอัปเดตสถานะได้' });
  }
}
