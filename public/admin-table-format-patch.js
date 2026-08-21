(()=>{
  const patchFetch=()=>{
    if(window.__jmwAdminLivePatch)return;
    window.__jmwAdminLivePatch=true;
    const original=window.fetch;
    window.fetch=async(...args)=>{
      const req=args[0],opts=args[1]||{};
      const url=String(req?.url||req||'');
      const method=String(opts.method||req?.method||'GET').toUpperCase();
      const res=await original(...args);
      if(/\/api\/(users|devices)(?:\/|\?|$)/.test(url)&&['POST','PUT','PATCH','DELETE'].includes(method)&&res.ok){
        setTimeout(()=>window.jmwAdminTableRefresh?.(),200);
      }
      return res;
    };
  };
  function dedupUsers(){
    const body=document.getElementById('userRows');if(!body)return;
    const seen=new Set();
    body.querySelectorAll('tr').forEach(tr=>{
      const edit=tr.querySelector('[data-jmw-action="edit-user"]');
      const id=edit?.dataset.id;
      if(!id)return;
      if(seen.has(id))tr.remove();else seen.add(id);
    });
  }
  const originalLocale=String.prototype.localeCompare;
  if(!String.prototype.__jmwNaturalPatched){
    Object.defineProperty(String.prototype,'__jmwNaturalPatched',{value:true,configurable:false});
    String.prototype.localeCompare=function(other,locales,options){
      const a=String(this),b=String(other??''),pa=a.match(/^(.*?)(\d+)$/),pb=b.match(/^(.*?)(\d+)$/);
      if(pa&&pb&&pa[1].toLowerCase()===pb[1].toLowerCase())return Number(pa[2])-Number(pb[2]);
      return originalLocale.call(this,other,locales,options);
    };
  }
  const observe=()=>{const body=document.getElementById('userRows');if(!body||body.__jmwDedupObserver)return;const ob=new MutationObserver(dedupUsers);ob.observe(body,{childList:true});body.__jmwDedupObserver=ob;dedupUsers()};
  patchFetch();observe();setTimeout(observe,300);setTimeout(observe,1000);
})();
