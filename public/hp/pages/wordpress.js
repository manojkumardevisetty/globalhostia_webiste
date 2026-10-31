/* WordPress page: staged wp-admin demo (gauge, cache hit, updates, backup), paused off-screen. */
(function(f){ var W=window; if(W.HP&&W.HP.on) W.HP.on(f); else { W.HP=W.HP||{}; (W.HP._q=W.HP._q||[]).push(f) } })(function(HP){
  "use strict";
  var win=HP.$("[data-wpx-demo]"); if(!win) return;
  var tasks=HP.$$(".wpx-task",win), score=HP.$("[data-wpx-score]",win), TARGET=96;
  if(HP.reduce){ win.classList.add("is-run"); tasks.forEach(function(t){t.classList.add("is-done")}); return }
  HP.pauseOff(win);
  // timeline (ms): 0 reset · 300 gauge · 1500/2900/4300 tasks start, done 900ms later · 9000 fade · 9600 loop
  var T=0, CYCLE=9600, last=-1;
  function state(t){
    win.classList.toggle("is-run", t>=300 && t<9000);
    win.classList.toggle("is-fade", t>=9000);
    tasks.forEach(function(el,i){ var s=1500+i*1400; el.classList.toggle("is-busy", t>=s && t<s+900); el.classList.toggle("is-done", t>=s+900 && t<9000+400) });
    if(score){ var p=Math.max(0,Math.min(1,(t-300)/1400)); p=1-Math.pow(1-p,3); score.textContent=t>=9000?TARGET:Math.round(TARGET*p) }
  }
  state(0);
  HP.loop(win,function(dt){ T=(T+dt)%CYCLE; var b=Math.floor(T/50); if(b!==last){ last=b; state(T) } });
});
