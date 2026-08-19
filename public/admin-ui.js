(()=>{
  const load=()=>{
    if(window.__jmwAdminModulesLoaded)return;
    window.__jmwAdminModulesLoaded=true;
    // Claim table rendering before app.js can render raw API values.
    window.__jmwAdminTableOwnsRender=true;
    const s=document.createElement('script');
    s.src='/admin-table.js?v=20260819-5';
    s.onload=()=>window.jmwAdminTableRefresh?.();
    s.onerror=()=>{
      window.__jmwAdminTableOwnsRender=false;
      console.error('[JMW] admin-table.js failed to load');
    };
    document.head.appendChild(s);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();