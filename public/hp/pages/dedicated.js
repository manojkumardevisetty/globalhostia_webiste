/* Dedicated page: rack entrance + pause off-screen, spec explorer filters/sort. */
(function(){
  "use strict";
  function init(HP){
    var $=HP.$, $$=HP.$$;
    $$("[data-dr-rack]").forEach(function(r){ HP.pauseOff(r); HP.once(r,function(){ r.classList.add("is-in") },"0px") });

    $$("[data-dx]").forEach(function(box){
      var body=$("[data-dx-body]",box), rows=$$(".dx-row",body), count=$("[data-dx-count]",box), empty=$("[data-dx-empty]",box), reset=$("[data-dx-reset]",box);
      var ram=$("[data-f-ram]",box), sort=$("[data-sort]",box), eol=$("[data-eol-toggle]",box), checks=$$("[data-f]",box);
      var orig=rows.slice();
      function sel(k){ return checks.filter(function(c){return c.getAttribute("data-f")===k && c.checked}).map(function(c){return c.value}) }
      function apply(animate){
        var f={fam:sel("fam"),st:sel("st"),port:sel("port")}, minRam=+(ram&&ram.value||0), showEol=!eol||eol.checked;
        var shown=0, hiddenEol=0;
        rows.forEach(function(r){
          var ok=(!f.fam.length||f.fam.indexOf(r.getAttribute("data-fam"))>-1)&&(!f.st.length||f.st.indexOf(r.getAttribute("data-st"))>-1)&&(!f.port.length||f.port.indexOf(r.getAttribute("data-port"))>-1)&&(+r.getAttribute("data-ram")>=minRam);
          if(ok && !showEol && r.getAttribute("data-eol")==="1"){ ok=false; hiddenEol++ }
          var was=!r.hidden; r.hidden=!ok; if(ok){ shown++; if(animate && !was){ r.classList.remove("is-new"); void r.offsetWidth; r.classList.add("is-new") } }
        });
        var s=sort?sort.value:"price", key=function(r){ var p=r.getAttribute("data-price"); return p===""?1e9:+p };
        var list=orig.slice().sort(function(a,b){
          if(s==="price") return key(a)-key(b);
          if(s==="price-d") return (key(b)%1e9)-(key(a)%1e9);
          if(s==="thr") return (+b.getAttribute("data-thr"))-(+a.getAttribute("data-thr"))||key(a)-key(b);
          if(s==="ram") return (+b.getAttribute("data-ram"))-(+a.getAttribute("data-ram"))||key(a)-key(b);
          return 0;
        });
        list.forEach(function(r){ body.appendChild(r) });
        count.textContent = shown+" of "+rows.length+" servers"+(hiddenEol?" (end-of-life models hidden)":"");
        empty.hidden = shown>0;
        var any=checks.some(function(c){return c.checked})||minRam>0; reset.hidden=!any;
      }
      checks.forEach(function(c){ c.addEventListener("change",function(){apply(true)}) });
      [ram,sort,eol].forEach(function(e){ if(e) e.addEventListener("change",function(){apply(true)}) });
      reset.addEventListener("click",function(){ checks.forEach(function(c){c.checked=false}); if(ram) ram.value="0"; apply(true) });
      // tier links pre-filter the table
      $$("[data-dx-jump]").forEach(function(a){ a.addEventListener("click",function(){
        var k=a.getAttribute("data-dx-jump"); checks.forEach(function(c){c.checked=false}); if(ram) ram.value="0";
        if(k==="10g") checks.forEach(function(c){ if(c.getAttribute("data-f")==="port") c.checked=c.value==="10Gbps" });
        else if(k==="ryzen") checks.forEach(function(c){ if(c.getAttribute("data-f")==="fam") c.checked=/ryzen/i.test(c.value) });
        else checks.forEach(function(c){ if(c.getAttribute("data-f")==="fam") c.checked=/xeon/i.test(c.value) });
        if(k==="xeon"){ checks.forEach(function(c){ if(c.getAttribute("data-f")==="port") c.checked=c.value==="1Gbps" }) }
        apply(true);
      }) });
      apply(false);
    });
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
