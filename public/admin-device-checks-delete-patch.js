(()=>{
  const $=id=>document.getElementById(id),token=()=>localStorage.getItem('jmw_token');
  const addDeleteButtons=()=>{
    const el=$('items');if(!el)return;
    [...el.querySelectorAll('tr')].forEach(row=>{
      const buttons=row.querySelectorAll('button');
      if(buttons.length!==1)return;
      const m=buttons[0].getAttribute('onclick')?.match(/toggleItem\((\d+)\)/);if(!m)return;
      const del=document.createElement('button');del.className='btn danger';del.textContent='ลบ';del.type='button';del.setAttribute('onclick',`deleteCheckItem(${m[1]})`);buttons[0].parentElement.appendChild(del);
    });
  };
  if(window.__JMW_DELETE_ITEM_PATCH__)return;window.__JMW_DELETE_ITEM_PATCH__=true;
  window.deleteCheckItem=async id=>{
    const row=[...document.querySelectorAll('#items tr')].find(r=>r.querySelector(`button[onclick="toggleItem(${id})"]`));
    const label=row?.children?.[1]?.textContent?.trim()||'รายการนี้';
    if(!confirm(`ยืนยันการลบ "${label}" ?\n\nการลบจะนำรายการออกจากการตั้งค่าปัจจุบันถาวร แต่ผลการตรวจในรายงานย้อนหลังจะยังคงอยู่`))return;
    try{
      const r=await fetch('/api/device-check-item-delete.js',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({id}),cache:'no-store'});
      const d=await r.json().catch(()=>({error:'เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง'}));
      if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
      alert(d.message||'ลบรายการตรวจเรียบร้อยแล้ว');location.reload();
    }catch(e){alert('ลบรายการไม่สำเร็จ: '+e.message)}
  };
  const observe=new MutationObserver(addDeleteButtons);
  const start=()=>{const el=$('items');if(!el){setTimeout(start,100);return}addDeleteButtons();observe.observe(el,{childList:true,subtree:true})};
  start();
})();