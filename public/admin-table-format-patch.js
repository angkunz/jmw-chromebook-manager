(()=>{
  const naturalCompare=(a,b)=>{
    const sa=String(a??''),sb=String(b??'');
    const split=s=>s.match(/\d+|\D+/g)||[''];
    const aa=split(sa),bb=split(sb),n=Math.max(aa.length,bb.length);
    for(let i=0;i<n;i++){
      const x=aa[i]??'',y=bb[i]??'';
      if(/^\d+$/.test(x)&&/^\d+$/.test(y)){
        const d=Number(x)-Number(y);if(d)return d;
      }else{
        const d=x.localeCompare(y,'th');if(d)return d;
      }
    }
    return 0;
  };
  const originalLocale=String.prototype.localeCompare;
  if(!String.prototype.__jmwNaturalPatched){
    Object.defineProperty(String.prototype,'__jmwNaturalPatched',{value:true,configurable:false});
    String.prototype.localeCompare=function(other,locales,options){
      const a=String(this),b=String(other??'');
      const pa=a.match(/^(.*?)(\d+)$/),pb=b.match(/^(.*?)(\d+)$/);
      if(pa&&pb&&pa[1].toLowerCase()===pb[1].toLowerCase())return Number(pa[2])-Number(pb[2]);
      return originalLocale.call(this,other,locales,options);
    };
  }
  function labelUserCode(){
    const body=document.getElementById('userRows');if(!body)return;
    body.querySelectorAll('tr').forEach(tr=>{
      const cells=tr.querySelectorAll('td');if(cells.length<3)return;
      const cell=cells[2],text=cell.textContent||'';
      const m=text.match(/^\s*S\/N:\s*(.*?)\s*·\s*(.+?)\s*$/);
      if(m)cell.textContent=`S/N: ${m[1]} · รหัส: ${m[2]}`;
    });
  }
  const run=()=>setTimeout(labelUserCode,0);
  document.addEventListener('input',e=>{if(e.target.matches('#deviceSearch,#userSearch,#repairSearch'))run();});
  document.addEventListener('change',e=>{if(e.target.matches('#deviceStatusFilter,#userActiveFilter,#repairStatusFilter,#deviceSort,#userSort,#repairSort,#auditSort'))run();});
  document.addEventListener('click',e=>{if(e.target.closest('[data-p]'))run();});
  const wait=()=>{if(window.jmwAdminTableRefresh&&!window.__jmwFormatRefreshPatched){const old=window.jmwAdminTableRefresh;window.jmwAdminTableRefresh=async(...args)=>{const r=await old(...args);run();return r};window.__jmwFormatRefreshPatched=true;run();}else setTimeout(wait,100)};wait();
})();
