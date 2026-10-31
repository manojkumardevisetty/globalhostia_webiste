/* Forex page: illustrative latency ticker (values jitter around a baseline, sparkline scrolls). */
(function(){
  "use strict";
  function init(HP){
    var $=HP.$, $$=HP.$$;
    $$("[data-fx-flow]").forEach(function(f){ HP.pauseOff(f) });
    $$("[data-fx-tick]").forEach(function(t){
      var rows=$$(".fx-row",t).map(function(r){
        var base=+r.getAttribute("data-base"), pl=$("polyline",r), b=$("[data-ms]",r), vals=[];
        for(var k=0;k<25;k++) vals.push(base+(Math.random()-.5)*.6);
        return {base:base,pl:pl,b:b,vals:vals,last:base};
      });
      function draw(r){
        var mn=r.base-.8, mx=r.base+.8;
        r.pl.setAttribute("points", r.vals.map(function(v,k){ return (k*5)+","+(32-((v-mn)/(mx-mn))*28).toFixed(1) }).join(" "));
      }
      rows.forEach(draw);
      if(HP.reduce) return;
      var acc=0;
      HP.loop(t,function(dt){
        acc+=dt; if(acc<900) return; acc=0;
        rows.forEach(function(r,i){
          var spike=Math.random()<.06?.5:0, v=Math.max(.3,r.base+(Math.random()-.5)*.6+spike);
          r.vals.shift(); r.vals.push(v); draw(r);
          r.b.textContent=v.toFixed(1);
          r.b.classList.toggle("is-up",v>r.last+.15); r.b.classList.toggle("is-dn",v<r.last-.15); r.last=v;
        });
      });
    });
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
