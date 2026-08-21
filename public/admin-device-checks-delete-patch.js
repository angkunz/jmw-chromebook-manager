(()=>{
  const $=id=>document.getElementById(id),token=()=>localStorage.getItem('jmw_token');
  if(window.__JMW_DELETE_ITEM_PATCH__)return;window.__JMW_DELETE_ITEM_PATCH__=true;
  const style=document.createElement('style');style.id='jmw-check-item-actions-style';style.textContent=`#items .item-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}#items .item-actions .item-action{min-width:92px;height:38px;padding:0 14px;border:0;border-radius:9px;color:#fff;font:600 14px/1 'Noto Sans Thai',sans-serif;cursor:pointer;transition:transform .15s,box-shadow .15s,filter .15s;box-shadow:0 2px 5px rgba(15,23,42,.10)}#items .item-actions .item-action:hover{transform:translateY(-1px);filter:brightness(.96);box-shadow:0 4px 9px rgba(15,23,42,.14)}#items .item-actions .toggle{background:#e11d2e}#items .item-actions .enable{background:#0f766e}#items .item-actions .delete{background:#64748b;min-width:68px}#items .item-actions .delete:hover{background:#475569}@media(max-width:800px){#items .item-actions{gap:6px}#items .item-actions .item-action{min-width:auto;padding:0 11px;font-size:13px}}`;
  document.head.appendChild(style);
  const decorate=()=>{const el=$('items');if(!el)return;el.querySelectorAll('tr').forEach(row=>{const buttons=[...row.querySelectorAll('button')];if(!buttons.length)return;let box=row.querySelector('.item-actions');if(!box){box=document.createElement('div');box.className='item-actions';buttons[0].parentElement.replaceChildren(box);buttons.forEach(b=>box.appendChild(b))}buttons.forEach(b=>{b.classList.add('item-action');const onclick=b.getAttribute('onclick')||'';if(onclick.startsWith('toggleItem')){b.classList.add(onclick.includes('false')?'enable':'toggle')}else if(onclick.startsWith('deleteCheckItem')){b.classList.add('delete')}})})};
  window.deleteCheckItem=async id=>{
    const row=[...document.querySelectorAll('#items tr')].find(r=>r.querySelector(`button[onclick="toggleItem(${id})"]`));
    const label=row?.children?.[1]?.textContent?.trim()||'รายการนี้';
    if(!confirm(`⚠️ ยืนยันการลบ "${label}" ?\n\nรายการตรวจนี้และผลตรวจย้อนหลังทั้งหมดของรายการนี้จะถูกลบถาวร\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`))return;
    try{
      const r=await fetch('/api/device-check-item-delete.js',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({id}),cache:'no-store'});
      const d=await r.json().catch(()=>({error:'เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง'}));
      if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
      alert(d.message||'ลบรายการตรวจเรียบร้อยแล้ว');location.reload();
    }catch(e){alert('ลบรายการไม่สำเร็จ: '+e.message)}
  };
  const observe=new MutationObserver(decorate);const start=()=>{const el=$('items');if(!el){setTimeout(start,100);return}decorate();observe.observe(el,{childList:true,subtree:true})};start();
})();