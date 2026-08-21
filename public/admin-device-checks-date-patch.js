(()=>{
  const months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const en=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const monthNo=v=>{const m=String(v??'').match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);return m?en.indexOf(m[1].toLowerCase())+1:0};
  const yearNo=v=>{const m=String(v??'').match(/\b(19\d{2}|20\d{2})\b/);return m?Number(m[1]):0};
  const thaiMonth=(value,fallback)=>{
    const s=String(value??'').trim();
    const direct=s.match(/^(\d{4})-(\d{2})/);
    if(direct)return `${months[Number(direct[2])-1]} ${Number(direct[1])+543}`;
    const mo=monthNo(s);
    if(!mo)return s||'-';
    let y=yearNo(s)||yearNo(fallback);
    if(!y){const selected=document.getElementById('reportMonth')?.value||'';const m=selected.match(/^(\d{4})-(\d{2})$/);if(m)y=Number(m[1]);}
    if(!y)y=new Date().getFullYear();
    return `${months[mo-1]} ${y+543}`;
  };
  function patchRows(){
    const body=document.getElementById('reports');
    if(body)body.querySelectorAll('tr').forEach(tr=>{
      const cells=tr.querySelectorAll('td');
      if(cells.length<8)return;
      const label=cells[0].textContent.trim();
      if(/^(Sat|Sun|Mon|Tue|Wed|Thu|Fri)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(label)){
        cells[0].textContent=thaiMonth(label,cells[7].textContent);
      }
    });
  }
  function patchDetail(){
    const h=document.querySelector('#detail h2');
    if(!h)return;
    const text=h.textContent||'';
    const m=text.match(/·\s*(Sat|Sun|Mon|Tue|Wed|Thu|Fri)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    if(!m)return;
    const p=document.querySelector('#detail p');
    const thai=thaiMonth(`${m[1]||''} ${m[2]||''}`,p?.textContent||'');
    h.textContent=text.replace(m[0],`· ${thai}`);
  }
  const run=()=>{patchRows();patchDetail()};
  const start=()=>{
    run();
    const reports=document.getElementById('reports');
    if(reports&&!reports.__jmwThaiMonthObserver){const o=new MutationObserver(run);o.observe(reports,{childList:true,subtree:true});reports.__jmwThaiMonthObserver=true;}
    const detail=document.getElementById('detail');
    if(detail&&!detail.__jmwThaiMonthObserver){const o=new MutationObserver(run);o.observe(detail,{childList:true,subtree:true});detail.__jmwThaiMonthObserver=true;}
    setInterval(run,1000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();