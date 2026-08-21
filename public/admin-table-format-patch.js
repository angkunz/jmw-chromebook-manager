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
  const originalLocale=String.prototype.localeCompare;
  if(!String.prototype.__jmwNaturalPatched){
    Object.defineProperty(String.prototype,'__jmwNaturalPatched',{value:true,configurable:false});
    String.prototype.localeCompare=function(other,locales,options){
      const a=String(this),b=String(other??''),pa=a.match(/^(.*?)(\d+)$/),pb=b.match(/^(.*?)(\d+)$/);
      if(pa&&pb&&pa[1].toLowerCase()===pb[1].toLowerCase())return Number(pa[2])-Number(pb[2]);
      return originalLocale.call(this,other,locales,options);
    };
  }
  function dateForInput(value){
    const s=String(value??'').trim();
    if(!s)return '';
    const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const d=new Date(s);
    if(Number.isNaN(d.getTime()))return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  async function fillEditDates(id){
    try{
      const token=localStorage.getItem('jmw_token');
      if(!token)return;
      const res=await fetch('/api/users',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
      if(!res.ok)return;
      const rows=await res.json();
      const user=(Array.isArray(rows)?rows:[]).find(x=>Number(x.id)===Number(id));
      if(!user)return;
      const form=document.getElementById('mf');
      if(!form)return;
      const borrow=form.elements?.borrow_date;
      const due=form.elements?.return_due_date;
      if(borrow)borrow.value=dateForInput(user.borrow_date);
      if(due)due.value=dateForInput(user.return_due_date);
    }catch(e){console.warn('[JMW EDIT DATE]',e)}
  }
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
  function bindEditDates(){
    if(document.__jmwEditDateBound)return;
    document.__jmwEditDateBound=true;
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-jmw-action="edit-user"]');
      if(!btn)return;
      setTimeout(()=>fillEditDates(btn.dataset.id),0);
    },true);
  }
  const observe=()=>{const body=document.getElementById('userRows');if(!body||body.__jmwDedupObserver)return;const ob=new MutationObserver(dedupUsers);ob.observe(body,{childList:true});body.__jmwDedupObserver=ob;dedupUsers()};
  patchFetch();bindEditDates();observe();
  setTimeout(observe,300);setTimeout(observe,1000);
})();