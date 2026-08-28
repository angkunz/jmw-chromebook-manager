(()=>{
  if(window.__JMW_DASHBOARD_PATCH__)return;window.__JMW_DASHBOARD_PATCH__=true;
  const labels={received:'รับเรื่องแล้ว',checking:'กำลังตรวจสอบ',waiting_parts:'รออะไหล่',repairing:'กำลังซ่อม',completed:'ซ่อมเสร็จแล้ว',cancelled:'ยกเลิก'};
  const $=id=>document.getElementById(id);const dateKey=v=>String(v??'').slice(0,10);const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const draw=(id,type,labels,data)=>{const el=$(id);if(!el||!window.Chart)return;if(window[id+'x'])window[id+'x'].destroy();window[id+'x']=new Chart(el,{type,data:{labels,datasets:[{data,borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:type==='bar'?'bottom':'right'}}}})};
  async function refresh(){
    const h={Authorization:`Bearer ${localStorage.getItem('jmw_token')}`};
    const [dr,ur,rr]=await Promise.all([fetch('/api/devices',{cache:'no-store',headers:h}),fetch('/api/users',{cache:'no-store',headers:h}),fetch('/api/repairs',{cache:'no-store',headers:h})]);
    if(!dr.ok||!ur.ok||!rr.ok)return;
    const devices=await dr.json(),users=await ur.json(),repairs=await rr.json();
    const allUsers=Array.isArray(users)?users:[],active=allUsers.filter(u=>u.active!==false),ds=Array.isArray(devices)?devices:[],rs=Array.isArray(repairs)?repairs:[];
    // "กำลังใช้งาน" on Dashboard is the same metric as the user page: active users with a linked device.
    const assignedDeviceLinks=active.filter(u=>u.device_id).map(u=>Number(u.device_id)).filter(Number.isFinite);
    const assignedCount=assignedDeviceLinks.length;
    const assignedIds=new Set(assignedDeviceLinks);
    const repairCount=ds.filter(d=>d.status==='repair').length;
    const retiredCount=ds.filter(d=>d.status==='retired').length;
    const availableCount=ds.filter(d=>d.status!=='repair'&&d.status!=='retired'&&!assignedIds.has(Number(d.id))).length;
    const overdue=active.filter(u=>{const v=dateKey(u.return_due_date);return v&&v<todayKey()}).length;
    const open=rs.filter(r=>!['completed','cancelled'].includes(r.status)).length;
    if($('total'))$('total').textContent=ds.length;
    if($('available'))$('available').textContent=availableCount;
    if($('assigned'))$('assigned').textContent=assignedCount;
    if($('repair'))$('repair').textContent=repairCount;
    if($('overdue'))$('overdue').textContent=overdue;
    if($('sumUsers'))$('sumUsers').textContent=allUsers.length;
    if($('sumRepairs'))$('sumRepairs').textContent=rs.length;
    if($('sumOpenRepairs'))$('sumOpenRepairs').textContent=open;
    if($('sumRetired'))$('sumRetired').textContent=retiredCount;
    draw('deviceChart','doughnut',['พร้อมใช้งาน','กำลังใช้งาน','กำลังซ่อม','เลิกใช้'],[availableCount,assignedCount,repairCount,retiredCount]);
    const order=['received','checking','waiting_parts','repairing','completed','cancelled'],rc={};order.forEach(k=>rc[k]=0);rs.forEach(r=>{if(Object.hasOwn(rc,r.status))rc[r.status]++});const present=order.filter(k=>rc[k]>0);draw('repairChart','doughnut',present.length?present.map(k=>labels[k]):['ยังไม่มีข้อมูล'],present.length?present.map(k=>rc[k]):[0]);
    const uc={};active.forEach(u=>{const k=u.class_or_department||'ไม่ระบุ';uc[k]=(uc[k]||0)+1});const uk=Object.keys(uc);draw('userChart','bar',uk.length?uk:['ยังไม่มีข้อมูล'],uk.length?uk.map(k=>uc[k]):[0]);
    const due={overdue:0,within30:0,within90:0,later:0},today=new Date(`${todayKey()}T00:00:00`);active.forEach(u=>{const k=dateKey(u.return_due_date);if(!k)return;const d=new Date(`${k}T00:00:00`),diff=Math.floor((d-today)/86400000);if(diff<0)due.overdue++;else if(diff<=30)due.within30++;else if(diff<=90)due.within90++;else due.later});draw('dueChart','bar',['เกินกำหนด','ภายใน 30 วัน','ภายใน 90 วัน','มากกว่า 90 วัน'],[due.overdue,due.within30,due.within90,due.later]);
  }
  const start=()=>setTimeout(()=>refresh().catch(e=>console.warn('[JMW DASHBOARD]',e)),0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();window.jmwDashboardRefresh=refresh;window.addEventListener('jmw:data-changed',()=>refresh().catch(()=>{}));
})();