(()=>{
  const ensureLoader=()=>{
    if(document.getElementById('jmwGlobalLoader'))return document.getElementById('jmwGlobalLoader');
    const el=document.createElement('div');
    el.id='jmwGlobalLoader';
    el.innerHTML='<span class="jmw-loader-dot"></span><span id="jmwLoaderText">กำลังโหลดข้อมูล...</span>';
    el.style.cssText='position:fixed;top:14px;right:18px;z-index:100000;display:none;align-items:center;gap:8px;padding:9px 13px;border-radius:999px;background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.18);font:600 13px Noto Sans Thai,sans-serif;pointer-events:none';
    const css=document.createElement('style');
    css.textContent='.jmw-loader-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;animation:jmwPulse 1s infinite}.jmw-loader-error{background:#991b1b!important}@keyframes jmwPulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}';
    document.head.appendChild(css);document.body.appendChild(el);return el;
  };
  let pending=0;
  const showLoading=(text='กำลังโหลดข้อมูล...')=>{const el=ensureLoader();pending++;el.classList.remove('jmw-loader-error');el.style.display='flex';const t=document.getElementById('jmwLoaderText');if(t)t.textContent=text};
  const hideLoading=()=>{pending=Math.max(0,pending-1);if(!pending){const el=document.getElementById('jmwGlobalLoader');if(el)el.style.display='none'}};
  const patchFetch=()=>{
    if(window.__jmwAdminFetchPatched)return;window.__jmwAdminFetchPatched=true;
    const original=window.fetch;
    window.fetch=async(...args)=>{
      const url=String(args[0]?.url||args[0]||'');
      const isApi=/\/api\//.test(url);
      if(isApi)showLoading('กำลังโหลดข้อมูล...');
      try{return await original(...args)}catch(e){if(isApi){const el=ensureLoader();el.classList.add('jmw-loader-error');const t=document.getElementById('jmwLoaderText');if(t)t.textContent='โหลดข้อมูลไม่สำเร็จ';setTimeout(hideLoading,900)}throw e}finally{if(isApi)hideLoading()}
    };
  };
  const load=()=>{
    patchFetch();
    if(window.__jmwAdminModulesLoaded)return;
    window.__jmwAdminModulesLoaded=true;
    window.__jmwAdminTableOwnsRender=true;
    const s=document.createElement('script');
    s.src='/admin-table.js?v=20260820-2';
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
      b.type='button';b.dataset.jmwDeviceCheckMenu='1';b.textContent='✅ ตรวจเช็คอุปกรณ์';
      b.style.cssText='width:100%;text-align:left;padding:10px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer';
      b.addEventListener('click',()=>{window.location.href='/admin-device-checks.html';});
      if(ref)ref.insertAdjacentElement('afterend',b);else aside.appendChild(b);
    };
    inject();setTimeout(inject,500);setTimeout(inject,1500);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();