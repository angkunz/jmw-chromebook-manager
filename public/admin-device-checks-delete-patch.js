(()=>{
  const $=id=>document.getElementById(id),token=()=>localStorage.getItem('jmw_token');
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const render=()=>{
    const el=$('items'), data=Array.isArray(window.__jmwDeviceCheckItems)?window.__jmwDeviceCheckItems:[];
    if(!el)return;
    el.innerHTML=data.map(x=>`<tr class="${x.active?'':'inactive'}"><td>${x.sort_order}</td><td>${esc(x.label)}</td><td>${esc(x.description||'-')}</td><td>${x.active?'ใช้งาน':'ปิดใช้งาน'}</td><td><div class="actions"><button class="btn ${x.active?'danger':'success'}" onclick="toggleItem(${x.id})">${x.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button><button class="btn danger" onclick="deleteCheckItem(${x.id})">ลบ</button></div></td></tr>`).join('')||'<tr><td colspan="5">ยังไม่มีรายการตรวจสอบ</td></tr>';
  };
  const wrap=()=>{
    if(window.__JMW_DELETE_ITEM_PATCH__)return;
    window.__JMW_DELETE_ITEM_PATCH__=true;
    const original=window.toggleItem;
    window.toggleItem=original;
    const observe=new MutationObserver(()=>{
      const rows=[...document.querySelectorAll('#items tr')];
      if(!rows.length)return;
      rows.forEach(row=>{
        const buttons=row.querySelectorAll('button');
        if(buttons.length===1){
          const m=buttons[0].getAttribute('onclick')?.match(/toggleItem\((\d+)\)/);if(!m)return;
          const del=document.createElement('button');del.className='btn danger';del.textContent='ลบ';del.setAttribute('onclick',`deleteCheckItem(${m[1]})`);buttons[0].parentElement.appendChild(del);
        }
      });
    });
    observe.observe($('items'),{childList:true,subtree:true});
  };
  window.deleteCheckItem=async id=>{
    const row=[...document.querySelectorAll('#items tr')].find(r=>r.querySelector(`button[onclick="toggleItem(${id})"]`));
    const label=row?.children?.[1]?.textContent?.trim()||'รายการนี้';
    if(!confirm(`ยืนยันการลบ "${label}" ?\n\nการลบจะนำรายการออกจากการตั้งค่าปัจจุบันถาวร แต่ผลการตรวจในรายงานย้อนหลังจะยังคงอยู่`))return;
    try{
      const r=await fetch('/api/device-check-item-delete.js',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({id}),cache:'no-store'});
      const d=await r.json().catch(()=>({error:'เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง'}));
      if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
      alert(d.message||'ลบรายการตรวจเรียบร้อยแล้ว');
      if(typeof window.jmwReloadDeviceCheckItems==='function')await window.jmwReloadDeviceCheckItems();
      else location.reload();
    }catch(e){alert('ลบรายการไม่สำเร็จ: '+e.message)}
  };
  wrap();
})();