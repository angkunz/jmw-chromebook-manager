(()=>{
const PAGE=25;
const state={devices:{page:1,q:'',filter:'',sort:'asset_code_asc'},users:{page:1,q:'',filter:'',sort:'name_asc'},repairs:{page:1,q:'',filter:'',sort:'id_desc'},audit:{page:1,q:'',sort:'date_desc'}};
const data={devices:[],users:[],repairs:[],audit:[]};
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#