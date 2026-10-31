/* n8n page: pulses travel along workflow edges; nodes light up as they "run". */
(function(){
  "use strict";
  var NS="http://www.w3.org/2000/svg";
  function init(HP){
    HP.$$("[data-wf]").forEach(function(fig){ var runsEl=HP.$("[data-wf-runs]",fig), runs=0; HP.$$("svg.wf__svg",fig).forEach(function(svg){
      var layer=HP.$("[data-wf-pulses]",svg);
      var edges=HP.$$(".wf-edge",svg).map(function(p){ return {p:p,len:0,from:p.getAttribute("data-from"),to:p.getAttribute("data-to")} });
      var nodes={}; HP.$$("[data-node]",svg).forEach(function(n){ nodes[n.getAttribute("data-node")]=n });
      function flash(id){ var n=nodes[id]; if(!n) return; n.classList.add("is-run","is-done"); setTimeout(function(){ n.classList.remove("is-run") },380) }
      if(HP.reduce){ Object.keys(nodes).forEach(function(k){ nodes[k].classList.add("is-done") }); if(runsEl) runsEl.textContent="1"; return }
      // the edge order defines the run: edges leaving the same node start together
      var start=edges[0]?edges[0].from:null, pulses=[], gap=0;
      function spawn(fromId){
        edges.forEach(function(e){ if(e.from!==fromId) return;
          var g=document.createElementNS(NS,"g"), glow=document.createElementNS(NS,"circle"), dot=document.createElementNS(NS,"circle");
          glow.setAttribute("r","9"); glow.setAttribute("class","wf-pulse__glow"); dot.setAttribute("r","4"); dot.setAttribute("class","wf-pulse");
          g.appendChild(glow); g.appendChild(dot); layer.appendChild(g);
          pulses.push({e:e,g:g,d:0});
        });
      }
      function begin(){
        Object.keys(nodes).forEach(function(k){ nodes[k].classList.remove("is-done") });
        flash(start); spawn(start);
      }
      var SPEED=0.16; // px per ms
      HP.loop(svg,function(dt){
        if(!edges.length) return;
        if(!edges[0].len){ try{ edges.forEach(function(e){ e.len=e.p.getTotalLength() }) }catch(err){ return } if(!edges[0].len) return }
        if(!pulses.length){ gap+=dt; if(gap>900){ gap=0; begin() } return }
        for(var i=pulses.length-1;i>=0;i--){
          var pl=pulses[i]; pl.d+=dt*SPEED;
          if(pl.d>=pl.e.len){
            layer.removeChild(pl.g); pulses.splice(i,1); flash(pl.e.to); spawn(pl.e.to);
            if(!edges.some(function(e){return e.from===pl.e.to}) && !pulses.length){ runs++; if(runsEl) runsEl.textContent=String(runs) }
            continue;
          }
          var pt=pl.e.p.getPointAtLength(pl.d);
          pl.g.setAttribute("transform","translate("+pt.x.toFixed(1)+" "+pt.y.toFixed(1)+")");
        }
      });
    }); });
  }
  var HP=window.HP=window.HP||{};
  if(HP.on) HP.on(init); else (HP._q=HP._q||[]).push(init);
})();
