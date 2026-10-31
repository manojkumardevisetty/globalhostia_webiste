/* Business email page: messages arriving in the inbox mock, MX record switcher. */
(function(f){ var W=window; if(W.HP&&W.HP.on) W.HP.on(f); else { W.HP=W.HP||{}; (W.HP._q=W.HP._q||[]).push(f) } })(function(HP){
  "use strict";
  var $=HP.$, $$=HP.$$;

  /* ---------- inbox: the oldest message is recycled as a new arrival at the top ---------- */
  var box=$("[data-em-inbox]");
  if(box && !HP.reduce){
    var rows=$$(".em-msg",box), unreadEl=$("[data-em-unread]",box), VISIBLE=4, order=rows.slice(), T=0, EVERY=2600, clock=9*60+41;
    function layout(){
      order.forEach(function(r,i){ r.style.setProperty("--p",i); r.classList.toggle("is-gone",i>=VISIBLE); if(i>=2) r.classList.remove("is-unread") });
      var n=order.filter(function(r){return r.classList.contains("is-unread")}).length;
      if(unreadEl && unreadEl.textContent!==String(n)){ unreadEl.textContent=n; unreadEl.classList.remove("is-bump"); void unreadEl.offsetWidth; unreadEl.classList.add("is-bump") }
    }
    box.classList.add("is-live"); layout();
    function arrive(){
      var r=order.pop(); order.unshift(r);
      clock+=1+Math.floor(Math.random()*4); var t=$("time",r); if(t) t.textContent=("0"+Math.floor(clock/60%24)).slice(-2)+":"+("0"+clock%60).slice(-2);
      r.classList.add("is-arriving","is-unread"); r.classList.remove("is-gone"); r.style.setProperty("--p",0);
      void r.offsetWidth; r.classList.remove("is-arriving");
      layout();
    }
    HP.loop(box,function(dt){ T+=dt; if(T>=EVERY){ T=0; arrive() } });
  }

  /* ---------- MX switcher ---------- */
  var mx=$("[data-em-mx]");
  if(mx){
    var btns=$$("[data-mx]",mx), label=$("[data-mx-label]",mx), dests=$$("[data-mx-dest]",mx);
    var LBL={host:"your hosting server",gws:"Google's mail servers"};
    function set(v,focus){
      btns.forEach(function(b){ var on=b.getAttribute("data-mx")===v; b.setAttribute("aria-checked",on); b.tabIndex=on?0:-1; if(on&&focus) b.focus() });
      dests.forEach(function(d){ d.hidden=d.getAttribute("data-mx-dest")!==v });
      if(label) label.textContent=LBL[v]||"";
    }
    btns.forEach(function(b,i){
      b.addEventListener("click",function(){ set(b.getAttribute("data-mx")) });
      b.addEventListener("keydown",function(e){ var d=e.key==="ArrowRight"||e.key==="ArrowDown"?1:e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:0; if(!d) return; e.preventDefault(); set(btns[(i+d+btns.length)%btns.length].getAttribute("data-mx"),true) });
    });
  }
});
