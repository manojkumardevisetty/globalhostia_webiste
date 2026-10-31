/* Projects page: kanban cards flow To do → Doing → Done (FLIP), team-size cost explainer. */
(function(){
  "use strict";
  function init(HP){
    HP.$$("[data-kb]").forEach(function(kb){
      if(HP.reduce) return;
      var lists=HP.$$(".kb-col ul",kb), counts=HP.$$(".kb-col h3 em",kb), t=0, phase=0;
      function flip(move){
        var cards=HP.$$(".kb-card",kb), first=cards.map(function(c){return c.getBoundingClientRect()});
        move();
        cards.forEach(function(c,i){
          var r=c.getBoundingClientRect(), dx=first[i].left-r.left, dy=first[i].top-r.top;
          if(!dx&&!dy) return;
          c.style.transition="none"; c.style.transform="translate("+dx+"px,"+dy+"px)";
          if(Math.abs(dx)>4) c.classList.add("is-moving");
        });
        kb.offsetWidth; // commit
        cards.forEach(function(c){
          if(!c.style.transform) return;
          c.style.transition="transform .75s cubic-bezier(.16,1,.3,1)"; c.style.transform="";
          setTimeout(function(){ c.classList.remove("is-moving"); c.style.transition="" },780);
        });
        counts.forEach(function(e,i){ e.textContent=String(lists[i].children.length) });
        lists.forEach(function(l,i){ HP.$$(".kb-card",l).forEach(function(c){ var d=HP.$(".kb-due",c); if(d&&d.lastChild) d.lastChild.nodeValue=i===2?"Done":c.getAttribute("data-due") }) });
      }
      function step(){
        var todo=lists[0], doing=lists[1], done=lists[2];
        if(phase===0 && doing.firstElementChild){ flip(function(){ done.insertBefore(doing.firstElementChild,done.firstElementChild) }) }
        else if(phase===1 && todo.firstElementChild){ flip(function(){ doing.appendChild(todo.firstElementChild) }) }
        else if(phase===2 && done.children.length>2){ flip(function(){ todo.appendChild(done.lastElementChild) }) }
        phase=(phase+1)%3;
      }
      HP.loop(kb,function(dt){ t+=dt; if(t>1700){ t=0; step() } });
    });

    HP.$$("[data-pm-cost]").forEach(function(fig){
      var range=HP.$("[data-pm-range]",fig), out=HP.$("output",fig), dots=HP.$$(".pm-people i",fig), mark=HP.$("[data-pm-mark]",fig), seat=HP.$(".pm-mark__seat",fig);
      function upd(){
        var n=+range.value, f=(n-1)/23, x=30+f*362, y=152-f*134;
        out.textContent=n+(n===1?" person":" people");
        dots.forEach(function(d,i){ d.classList.toggle("is-off",i>=n) });
        mark.setAttribute("transform","translate("+x.toFixed(1)+" 0)");
        seat.setAttribute("cy",y.toFixed(1));
      }
      range.addEventListener("input",upd); upd();
    });
  }
  var HP=window.HP=window.HP||{};
  if(HP.on) HP.on(init); else (HP._q=HP._q||[]).push(init);
})();
