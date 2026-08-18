import XLSX from 'xlsx';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const wb = XLSX.utils.book_new();
  const guide = XLSX.utils.aoa_to_sheet([
    ['JMW Chromebook Manager'],
    ['Template สำหรับนำเข้าข้อมูล Chromebook'],
    [],
    ['ชีต “อุปกรณ์”','จำเป็น: S/N, รหัสเครื่อง, ยี่ห้อ, รุ่น'],
    ['ชีต “ผู้ใช้”','จำเป็น: ชื่อผู้ใช้เครื่อง, ระดับชั้น/ฝ่ายงาน, วันที่ยืม และ S/N หรือ รหัสเครื่อง'],
    ['วันที่ต้องคืน','เว้นว่างสำหรับ ม.4–ม.6 ให้ระบบคำนวณอัตโนมัติ: ม.4 +3 ปี, ม.5 +2 ปี, ม.6 +1 ปี'],
    ['รูปแบบวันที่','แนะนำ YYYY-MM-DD เช่น 2026-08-18'],
  ]);
  guide['!cols']=[{wch:24},{wch:72}];
  XLSX.utils.book_append_sheet(wb, guide, 'คำแนะนำ');

  const devices = XLSX.utils.aoa_to_sheet([
    ['S/N','รหัสเครื่อง','ยี่ห้อ','รุ่น','สถานะ','วันที่ซื้อ','หมายเหตุ'],
    ['ABC123456','JMW-CB-001','Acer','Chromebook 314','พร้อมใช้งาน','2026-05-10',''],
    ['DEF789012','JMW-CB-002','Lenovo','100e Chromebook','กำลังใช้งาน','2026-05-10',''],
  ]);
  devices['!cols']=[{wch:20},{wch:18},{wch:16},{wch:24},{wch:18},{wch:16},{wch:30}];
  XLSX.utils.book_append_sheet(wb, devices, 'อุปกรณ์');

  const users = XLSX.utils.aoa_to_sheet([
    ['ชื่อผู้ใช้เครื่อง','ประเภท','ระดับชั้น/ฝ่ายงาน','อีเมล','เบอร์โทร','S/N','รหัสเครื่อง','วันที่ยืม','วันที่ต้องคืน','เหตุผลคืน'],
    ['ด.ช.สมชาย ใจดี','นักเรียน','ม.4/1','student@example.com','0812345678','ABC123456','JMW-CB-001','2026-08-18','',''],
    ['ด.ญ.สุดา รักเรียน','นักเรียน','ม.5/2','student2@example.com','0823456789','DEF789012','JMW-CB-002','2026-08-18','',''],
  ]);
  users['!cols']=[{wch:24},{wch:14},{wch:22},{wch:28},{wch:16},{wch:20},{wch:18},{wch:16},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb, users, 'ผู้ใช้');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="JMW_Chromebook_Import_Template.xlsx"');
  res.setHeader('Cache-Control','no-store');
  res.status(200).send(buffer);
}
