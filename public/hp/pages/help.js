/* Help centre: "Watch how" search + topic chips (/help-center), illustrated walkthrough player (/help/<slug>). */
(function(){
  function init(){
    /* search and filter the grid */
    var tools=document.querySelector("[data-help-tools]");
    if(tools){
      var q=tools.querySelector("[data-help-q]"), chips=[].slice.call(tools.querySelectorAll("[data-help-g]"));
      var sec=tools.closest("section"), items=[].slice.call(sec.querySelectorAll("[data-help-item]"));
      var empty=sec.querySelector("[data-help-empty]"), count=sec.querySelector("[data-help-count]"), g="";
      var apply=function(){
        var words=(q.value||"").toLowerCase().trim().split(/\s+/).filter(Boolean), n=0;
        items.forEach(function(li){
          var ok=(!g||li.getAttribute("data-g")===g)&&words.every(function(w){return li.getAttribute("data-k").indexOf(w)>-1});
          li.hidden=!ok; if(ok) n++;
        });
        if(empty) empty.hidden=n>0;
        if(count) count.textContent=n+(n===1?" how-to shown":" how-tos shown");
      };
      q.addEventListener("input",apply);
      chips.forEach(function(b){ b.addEventListener("click",function(){
        g=b.getAttribute("data-help-g");
        chips.forEach(function(c){ var on=c===b; c.classList.toggle("is-on",on); c.setAttribute("aria-pressed",String(on)) });
        apply();
      }) });
      // the help center's own search box also filters the videos
      var top=document.getElementById("cn-q");
      if(top) top.addEventListener("input",function(){ q.value=top.value; apply() });
    }

    /* walkthrough: one step at a time with play / previous / next (all steps stay listed without JavaScript) */
    [].forEach.call(document.querySelectorAll("[data-walk]"),function(w){
      var fs=[].slice.call(w.querySelectorAll(".hw-walk__f")), bar=w.querySelector("[data-walk-bar]");
      if(fs.length<2||!bar) return;
      var dots=[].slice.call(w.querySelectorAll("[data-walk-go]")), play=w.querySelector("[data-walk-play]"), i=0, tm=0;
      var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
      w.classList.add("is-js"); bar.hidden=false;
      var show=function(n){
        i=(n+fs.length)%fs.length;
        fs.forEach(function(f,k){ f.classList.toggle("is-on",k===i); f.setAttribute("aria-hidden",String(k!==i)) });
        dots.forEach(function(d,k){ if(k===i) d.setAttribute("aria-current","step"); else d.removeAttribute("aria-current") });
        var img=fs[(i+1)%fs.length].querySelector("img"); if(img) img.loading="eager"; // preload the next step
      };
      var stop=function(){ clearInterval(tm); tm=0; play.setAttribute("aria-label","Play the steps"); play.innerHTML=play.getAttribute("data-play")||play.innerHTML };
      play.setAttribute("data-play",play.innerHTML);
      play.addEventListener("click",function(){
        if(tm){ stop(); return }
        tm=setInterval(function(){ if(i===fs.length-1){ stop(); return } show(i+1) },reduce?6000:4200);
        play.setAttribute("aria-label","Pause");
        play.innerHTML='<svg class="hp-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
        if(i===fs.length-1) show(0);
      });
      w.querySelector("[data-walk-prev]").addEventListener("click",function(){ stop(); show(i-1) });
      w.querySelector("[data-walk-next]").addEventListener("click",function(){ stop(); show(i+1) });
      dots.forEach(function(d,k){ d.addEventListener("click",function(){ stop(); show(k) }) });
      w.addEventListener("keydown",function(e){ if(e.key==="ArrowRight"){ stop(); show(i+1) } else if(e.key==="ArrowLeft"){ stop(); show(i-1) } });
      show(0);
    });
  }
  var HP=window.HP=window.HP||{};
  if(HP.on) HP.on(init); else (HP._q=HP._q||[]).push(init);
})();
