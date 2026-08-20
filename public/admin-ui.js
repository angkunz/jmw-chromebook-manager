(()=>{
  const load=()=>{
    if(window.__jmwAdminModulesLoaded)return;
    window.__jmwAdminModulesLoaded=true;
    window.__jmwAdminTableOwnsRender=true;
    const s=document.createElement('script');
    s.src='/admin-table.js?v=20260820-1';
    s.onload=()=>{window.jmwAdminTableRefresh?.(); addDeviceCheckMenu();};
    s.onerror=()=>{window.__jmwAdminTableOwnsRender=false;console.error('[JMW] admin-table.js failed to load');};
    document.head.appendChild(s);
  };
  const addDeviceCheckMenu=()=>{
    const inject=()=>{
      const aside=document.querySelector('aside');
      if(!aside || aside.querySelector('[data-jmw-device-check-menu]')) return;
      const ref=aside.querySelector('[data-page="audit"]');
      const b=document.createElement('button');
      b.type='button';
      b.dataset.jmwDeviceCheckMenu='1';
      b.textContent='✅ ตรวจเช็คอุปกรณ์';
      b.style.cssText='width:100%;text-align:left;padding:10px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer';
      b.addEventListener('click',()=>{window.location.href='/admin-device-checks.html';});
      if(ref) ref.insertAdjacentElement('afterend',b); else aside.appendChild(b);
    };
    inject();
    setTimeout(inject,500);
    setTimeout(inject,1500);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',load,{once:true}); else load();
})();