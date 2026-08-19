(()=>{
  const load=()=>{if(window.__jmwAdminModulesLoaded)return;window.__jmwAdminModulesLoaded=true;const s=document.createElement('script');s.src='/admin-table.js?v=20260819-4';s.defer=true;document.head.appendChild(s)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();