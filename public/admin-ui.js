(()=>{
  const load=()=>{if(window.__jmwAdminModulesLoaded)return;window.__jmwAdminModulesLoaded=true;for(const src of ['/admin-table.js?v=20260819-3','/admin-export.js?v=20260819-1']){const s=document.createElement('script');s.src=src;s.defer=true;document.head.appendChild(s)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();