/* AI page: streaming answer + utilisation bars (illustrative), and the memory sizing guide. */
(function(){
  "use strict";
  function init(HP){
    var $=HP.$, $$=HP.$$;
    /* ---------- token stream ---------- */
    $$("[data-ai-vis]").forEach(function(v){
      var holder=$("[data-text]",v), bars=$$(".ai-util__bars i",v), tps=$("[data-ai-tps]",v), tok=$("[data-ai-tok]",v);
      var words=holder.getAttribute("data-text").split(" ");
      function setBars(level){ bars.forEach(function(b){ b.style.setProperty("--u",Math.max(.06,Math.min(1,level*(.7+Math.random()*.45))).toFixed(2)) }) }
      if(HP.reduce){ setBars(.5); tok.textContent=Math.round(words.length*1.3); tps.textContent="18"; return }
      holder.innerHTML=words.map(function(w){return '<span class="ai-w">'+w.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</span>'}).join(" ");
      var ws=$$(".ai-w",holder), caret=$(".ai-caret",v), i=0, wait=900, n=0;
      HP.pauseOff(v);
      HP.loop(v,function(dt){
        wait-=dt; if(wait>0) return;
        if(i>=ws.length){ ws.forEach(function(w){w.classList.remove("on")}); i=0; n=0; tok.textContent="0"; tps.textContent="0"; setBars(.08); holder.appendChild(caret); wait=1400; return }
        ws[i].classList.add("on"); ws[i].appendChild(caret); i++;
        n+=1+(ws[i-1].textContent.length>6?1:0); tok.textContent=n;
        var rate=15+Math.round(Math.random()*7); tps.textContent=rate;
        setBars(.72);
        wait = i>=ws.length ? 3800 : 1000/rate*1.25;
        if(i>=ws.length){ setBars(.1); tps.textContent="0" }
      });
    });

    /* ---------- sizing ---------- */
    $$("[data-ai-size]").forEach(function(box){
      var boxes; try{boxes=JSON.parse($("[data-boxes]",box).textContent)}catch(e){boxes=[]}
      var range=$("#ai-p",box), params=range.getAttribute("data-params").split(",").map(Number), btns=$$(".ai-prec button",box);
      var need=$("[data-ai-need]",box), gauge=$("[data-ai-gauge]",box), fit=$("[data-ai-fit]",box), list=$("[data-ai-list]",box), out=$("[data-out-p]",box);
      var maxRam=Math.max.apply(null,[256].concat(boxes.map(function(b){return b.ram})));
      var q=+(btns.filter(function(b){return b.getAttribute("aria-checked")==="true"})[0]||btns[0]).getAttribute("data-b");
      var qs=location.search.indexOf("theme=hostpen")>-1?"?theme=hostpen":"";
      function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}
      function update(animate){
        var p=params[+range.value], gbNeed=Math.ceil(p*q*1.2+2);
        out.textContent=p+"B parameters"; range.setAttribute("aria-valuetext",p+" billion parameters");
        range.style.setProperty("--p",(range.value/range.max*100)+"%");
        need.textContent=gbNeed; gauge.style.setProperty("--v",Math.min(1,gbNeed/maxRam).toFixed(3));
        var ok=boxes.filter(function(b){return b.ram>=gbNeed*1.25}).slice(0,3);
        if(!ok.length) ok=boxes.filter(function(b){return b.ram>=gbNeed}).slice(0,3);
        fit.textContent = ok.length ? "Servers in our catalog with enough memory, with headroom where possible:" : "None of the servers listed today has enough memory for this. Talk to us about a larger build.";
        list.innerHTML=ok.map(function(b,i){ return '<li'+(animate?' class="is-new" style="--i:'+i+'"':'')+'><a href="/p/'+esc(b.slug)+qs+'"><b>'+esc(b.name)+'</b><span class="num">'+b.ram+'GB RAM, '+esc(b.cpu)+'</span></a><em class="num">'+esc(b.price||"See price")+'</em></li>' }).join("");
      }
      range.addEventListener("input",function(){update(true)});
      function pick(b){ btns.forEach(function(x){var on=x===b; x.setAttribute("aria-checked",on); x.tabIndex=on?0:-1}); q=+b.getAttribute("data-b"); update(true) }
      btns.forEach(function(b,k){ b.addEventListener("click",function(){pick(b)}); b.addEventListener("keydown",function(e){ var d=e.key==="ArrowRight"||e.key==="ArrowDown"?1:e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:0; if(!d) return; e.preventDefault(); var n=btns[(k+d+btns.length)%btns.length]; n.focus(); pick(n) }) });
      update(false);
    });
    $$(".ai-flowd").forEach(function(f){ HP.pauseOff(f) });
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
