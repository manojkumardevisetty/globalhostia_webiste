/* VPS page: terminal typing loop + resource meters, and the "build your VPS" sizer. */
(function(){
  "use strict";
  function init(HP){
    var $=HP.$, $$=HP.$$, reduce=HP.reduce;

    /* ---------- terminal ---------- */
    $$("[data-vx-term]").forEach(function(term){
      var lines=$$(".vx-l",term), meters={}; $$(".vx-meter",term).forEach(function(m){meters[m.getAttribute("data-m")]=m});
      function setM(k,v){var m=meters[k]; if(!m) return; m.querySelector("i").style.setProperty("--v",(v/100).toFixed(3)); m.querySelector("b").textContent=Math.round(v)+"%"}
      if(reduce){ setM("cpu",14); setM("ram",38); setM("io",6); var c0=term.querySelector(".vx-caret"); if(c0) lines[lines.length-1].appendChild(c0); return }
      var caret=term.querySelector(".vx-caret");
      term.classList.add("js"); HP.pauseOff(term);
      var texts=lines.map(function(l){return l.querySelector(".vx-t").textContent});
      var i=0, ch=0, wait=600, phase=0, run=false;
      // CPU/RAM/IO targets per line index (what the server would be doing)
      var load=[[6,22,2],[6,22,2],[34,26,48],[62,30,78],[12,28,10],[28,30,55],[46,34,30],[58,44,52],[64,52,40],[40,58,22],[18,58,8],[12,58,4]];
      function show(n){ lines[n].classList.add("is-shown") }
      function reset(){ lines.forEach(function(l,k){l.classList.remove("is-shown"); l.querySelector(".vx-t").textContent=texts[k]}); i=0; ch=0 }
      function tick(dt){
        if(term.classList.contains("is-paused")) return;
        wait-=dt; if(wait>0) return;
        if(i>=lines.length){ reset(); wait=500; return }
        var l=lines[i], t=l.querySelector(".vx-t"), isCmd=l.getAttribute("data-k")==="cmd";
        if(ch===0){ show(i); if(isCmd) t.textContent=""; if(caret) l.appendChild(caret) }
        if(isCmd && ch<texts[i].length){ ch+=1+(Math.random()<.3?1:0); t.textContent=texts[i].slice(0,ch); wait=34+Math.random()*40; return }
        t.textContent=texts[i];
        var L=load[i]||load[load.length-1]; setM("cpu",L[0]+Math.random()*6); setM("ram",L[1]); setM("io",L[2]+Math.random()*5);
        i++; ch=0; wait=isCmd?420:(i>=lines.length?4200:240);
      }
      HP.loop(term,function(dt){tick(dt)});
    });

    /* ---------- sizer ---------- */
    $$("[data-vx-sizer]").forEach(function(box){
      var plans; try{plans=JSON.parse($("[data-plans]",box).textContent)}catch(e){return}
      var cpu=$("#vx-cpu",box), ram=$("#vx-ram",box), disk=$("#vx-disk",box), os=$(".vx-os",box), match=$(".vx-match",box);
      var R=function(k){return $('[data-r="'+k+'"]',match)};
      if(!plans.length) return;
      var cur=plans[0].os, lastSlug=null;
      function steps(inp){return inp.getAttribute("data-steps").split(",").map(Number)}
      function val(inp){return inp?steps(inp)[+inp.value]:0}
      function paint(inp){ if(!inp) return; var v=val(inp)+(inp.getAttribute("data-unit")||""); inp.style.setProperty("--p",(+inp.max>+inp.min ? (inp.value-inp.min)/(inp.max-inp.min)*100 : 0)+"%"); inp.setAttribute("aria-valuetext",v); var o=$('[data-out="'+inp.id+'"]',box); if(o) o.textContent=v }
      function setTo(inp,v){ if(!inp) return; var s=steps(inp), b=0; s.forEach(function(x,k){ if(Math.abs(x-v)<Math.abs(s[b]-v)) b=k }); inp.value=b; paint(inp) }
      function pick(){
        var want={cpu:val(cpu),ram:val(ram),disk:val(disk)};
        var c=plans.filter(function(p){return p.os===cur}); if(!c.length) c=plans;
        function score(p){ var s=0; ["cpu","ram","disk"].forEach(function(k){ if(!want[k]||!p[k]) return; var r=p[k]/want[k]; s+= r<1 ? (1-r)*4 : (r-1)*.6 }); return s }
        return c.slice().sort(function(a,b){return score(a)-score(b)})[0];
      }
      function show(p, force){
        if(!p) return;
        var changed=p.slug!==lastSlug; lastSlug=p.slug;
        R("name").textContent=p.name; R("cpu").textContent=p.cpu; R("ram").textContent=p.ram+"GB"; R("os").textContent=p.os;
        R("price").textContent=p.price||"Price shown in the order form";
        var a=R("href"); a.href=p.href; a.textContent=p.price?"Order this plan":"See price and order"; a.setAttribute("aria-label",(p.price?"Order this plan: ":"See price and order: ")+p.name);
        R("details").setAttribute("href","/p/"+p.slug+(location.search.indexOf("theme=hostpen")>-1?"?theme=hostpen":""));
        var short=[]; if(disk && val(disk)>p.disk) short.push(p.disk ? (val(disk)-p.disk)+"GB less storage" : "storage capacity not specified"); if(val(cpu)>p.cpu) short.push((val(cpu)-p.cpu)+" fewer vCPU"); if(val(ram)>p.ram) short.push((val(ram)-p.ram)+"GB less RAM");
        var fit=R("fit"); fit.classList.toggle("is-short",!!short.length);
        fit.textContent = short.length ? "Closest available: "+short.join(" and ")+" than you selected. Talk to us if you need more." : (p.cpu===val(cpu)&&p.ram===val(ram)&&(!disk||p.disk===val(disk)) ? "An exact match for what you selected." : "Meets or exceeds what you selected, with room to grow.");
        $$(".vx-chips",box).forEach(function(l){ l.hidden = l.getAttribute("data-os-list")!==cur });
        $$(".vx-chip",box).forEach(function(b){ var on=b.getAttribute("data-slug")===p.slug; b.classList.toggle("is-on",on); b.setAttribute("aria-pressed",on) });
        if(changed && !reduce && !force){ match.classList.remove("is-swap"); void match.offsetWidth; match.classList.add("is-swap") }
      }
      function update(){ $$(".vx-preset",box).forEach(function(b){ b.setAttribute("aria-pressed", +b.getAttribute("data-cpu")===val(cpu) && +b.getAttribute("data-ram")===val(ram)) }); show(pick()) }
      [cpu,ram,disk].forEach(function(inp){ if(!inp) return; paint(inp); inp.addEventListener("input",function(){ paint(inp); update() }) });
      $$(".vx-preset",box).forEach(function(b){ b.addEventListener("click",function(){ setTo(cpu,+b.getAttribute("data-cpu")); setTo(ram,+b.getAttribute("data-ram")); update() }) });
      if(os){
        var btns=$$("button",os), thumb=$(".hp-seg__thumb",os);
        function seg(btn){ btns.forEach(function(b){var on=b===btn; b.setAttribute("aria-checked",on); b.tabIndex=on?0:-1}); if(thumb){thumb.style.width=btn.offsetWidth+"px"; thumb.style.transform="translateX("+(btn.offsetLeft-4)+"px)"} cur=btn.getAttribute("data-os"); update() }
        btns.forEach(function(b,k){ b.addEventListener("click",function(){seg(b)}); b.addEventListener("keydown",function(e){ var d=e.key==="ArrowRight"||e.key==="ArrowDown"?1:e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:0; if(!d) return; e.preventDefault(); var n=btns[(k+d+btns.length)%btns.length]; n.focus(); seg(n) }) });
        var init0=function(){ var b=btns.filter(function(x){return x.getAttribute("aria-checked")==="true"})[0]||btns[0]; if(thumb&&b.offsetWidth){thumb.style.width=b.offsetWidth+"px"; thumb.style.transform="translateX("+(b.offsetLeft-4)+"px)"} };
        init0(); window.addEventListener("resize",init0); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(init0);
      }
      $$(".vx-chip",box).forEach(function(b){ b.addEventListener("click",function(){ var p=plans.filter(function(x){return x.slug===b.getAttribute("data-slug")})[0]; if(!p) return; setTo(cpu,p.cpu); setTo(ram,p.ram); if(disk&&p.disk) setTo(disk,p.disk); $$(".vx-preset",box).forEach(function(x){x.setAttribute("aria-pressed","false")}); show(p) }) });
      show(pick(),true);
    });
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
