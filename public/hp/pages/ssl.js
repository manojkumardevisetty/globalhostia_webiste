/* SSL page: hero secure/insecure cycle + DV/OV/EV chooser. */
(function(){
  "use strict";
  function init(HP){
    var D=document;
    // hero: alternate "Not secure" and "secure" while on screen; reduced motion shows the secure state
    HP.$$("[data-ssl-demo]").forEach(function(demo){
      if(HP.reduce){ demo.classList.add("is-secure"); return }
      var t=0, secure=false;
      HP.loop(demo,function(dt){
        t+=dt;
        var hold=secure?5200:2600;
        if(t>hold){ t=0; secure=!secure; demo.classList.toggle("is-secure",secure) }
      });
    });
    // chooser
    HP.$$("[data-ssl-chooser]").forEach(function(group){
      var btns=HP.$$("button",group), sec=group.closest("section"), levels=HP.$("[data-ssl-levels]",sec), why=HP.$("[data-ssl-why]",sec);
      var NAMES={dv:"Domain Validated (DV)",ov:"Organization Validated (OV)",ev:"Extended Validation (EV)"};
      function pick(b){
        btns.forEach(function(x){ x.setAttribute("aria-checked",String(x===b)); x.tabIndex=x===b?0:-1 });
        var lv=b.getAttribute("data-pick");
        levels.classList.add("has-pick");
        HP.$$(".ssl-level",levels).forEach(function(a){ a.classList.toggle("is-pick",a.getAttribute("data-level")===lv) });
        why.innerHTML="";
        var s=D.createElement("b"); s.textContent=NAMES[lv]+". "; why.appendChild(s);
        why.appendChild(D.createTextNode(b.getAttribute("data-why")||""));
      }
      btns.forEach(function(b,i){
        if(i) b.tabIndex=-1;
        b.addEventListener("click",function(){pick(b)});
        b.addEventListener("keydown",function(e){
          var k=e.key, j=btns.indexOf(b);
          if(k==="ArrowRight"||k==="ArrowDown") j=(j+1)%btns.length; else if(k==="ArrowLeft"||k==="ArrowUp") j=(j-1+btns.length)%btns.length; else return;
          e.preventDefault(); btns[j].focus(); pick(btns[j]);
        });
      });
    });
  }
  var HP=window.HP=window.HP||{};
  if(HP.on) HP.on(init); else (HP._q=HP._q||[]).push(init);
})();
