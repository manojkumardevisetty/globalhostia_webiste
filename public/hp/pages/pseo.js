/* /domains/all: filter, sort and paginate the TLD table client-side ([data-tl]). Without JS every row stays visible. */
(function(){
  "use strict";
  var box=document.querySelector("[data-tl]"); if(!box) return;
  var body=box.querySelector("[data-tl-body]"), rows=[].slice.call(body.querySelectorAll("tr[data-tld]")),
      q=box.querySelector("[data-tl-q]"), kind=box.querySelector("[data-tl-kind]"), count=box.querySelector("[data-tl-count]"),
      empty=box.querySelector("[data-tl-empty]"), pager=box.querySelector("[data-tl-pager]"),
      size=parseInt(box.getAttribute("data-page-size"),10)||25, page=0, key="", dir=1, total=rows.length;
  rows.forEach(function(r,i){r._i=i});
  function val(r,k){ if(k==="tld") return r.getAttribute("data-tld"); var v=r.getAttribute("data-"+k); return v===""?null:parseFloat(v) }
  function matches(r){
    var t=(q.value||"").trim().toLowerCase().replace(/^\.?/,".");
    if(t!=="." && r.getAttribute("data-tld").indexOf(t)!==0 && r.getAttribute("data-tld").indexOf(t.slice(1))<0) return false;
    return !kind.value || r.getAttribute("data-kind")===kind.value;
  }
  function render(){
    var list=rows.filter(matches);
    if(key){ list.sort(function(a,b){ var x=val(a,key), y=val(b,key);
      if(x===null&&y===null) return a._i-b._i; if(x===null) return 1; if(y===null) return -1;
      return (typeof x==="string"?x.localeCompare(y):x-y)*dir || a._i-b._i }); }
    else list.sort(function(a,b){return a._i-b._i});
    var pages=Math.max(1,Math.ceil(list.length/size)); if(page>=pages) page=pages-1;
    rows.forEach(function(r){r.hidden=true});
    list.forEach(function(r,i){ body.appendChild(r); r.hidden=!(i>=page*size && i<(page+1)*size) });
    count.textContent=list.length===total?total+" extensions":list.length+" of "+total+" extensions";
    empty.hidden=list.length>0;
    pager.hidden=pages<2; pager.innerHTML="";
    if(pages>1){
      var mk=function(label,p,cur,dis,aria){ var b=document.createElement("button"); b.type="button"; b.textContent=label; if(aria) b.setAttribute("aria-label",aria);
        if(cur) b.setAttribute("aria-current","page"); if(dis) b.disabled=true;
        b.addEventListener("click",function(){ page=p; render(); box.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}) }); pager.appendChild(b) };
      mk("‹",page-1,false,page===0,"Previous page");
      for(var i=0;i<pages;i++){ if(pages>7 && i>0 && i<pages-1 && Math.abs(i-page)>1){ if(i===1||i===pages-2){var s=document.createElement("span");s.textContent="…";s.setAttribute("aria-hidden","true");pager.appendChild(s)} continue }
        mk(String(i+1),i,i===page,false,"Page "+(i+1)) }
      mk("›",page+1,false,page===pages-1,"Next page");
    }
  }
  q.addEventListener("input",function(){page=0;render()});
  kind.addEventListener("change",function(){page=0;render()});
  [].forEach.call(box.querySelectorAll("[data-sort]"),function(b){
    b.addEventListener("click",function(){
      var k=b.getAttribute("data-sort"); if(key===k) dir=-dir; else {key=k; dir=1}
      [].forEach.call(box.querySelectorAll("thead th"),function(th){th.removeAttribute("aria-sort")});
      b.parentNode.setAttribute("aria-sort",dir>0?"ascending":"descending"); page=0; render();
    });
  });
  render();
})();
