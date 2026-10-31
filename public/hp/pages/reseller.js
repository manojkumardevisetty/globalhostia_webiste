/* Reseller page: client accounts appearing in the white-label panel, flow connectors, revenue calculator. */
(function(f){ var W=window; if(W.HP&&W.HP.on) W.HP.on(f); else { W.HP=W.HP||{}; (W.HP._q=W.HP._q||[]).push(f) } })(function(HP){
  "use strict";
  var $=HP.$, $$=HP.$$;

  /* ---------- panel: accounts are created one by one, then the demo restarts ---------- */
  var panel=$("[data-rs-panel]");
  if(panel && !HP.reduce){
    var rows=$$(".rs-acc",panel), count=$("[data-rs-count]",panel), n=rows.length;
    var STEP=1600, HOLD=4200, CYCLE=600+(n-2)*STEP+HOLD+600, T=0, shown=-1;
    function show(k){
      if(k===shown) return; shown=k;
      rows.forEach(function(r,i){ var on=i<k; r.classList.toggle("is-out",!on); if(on&&i===k-1){ r.classList.remove("is-new"); void r.offsetWidth; r.classList.add("is-new") } });
      if(count) count.textContent=k;
    }
    rows.forEach(function(r,i){ if(i>=2) r.classList.add("is-out") }); shown=2; if(count) count.textContent="2";
    panel.classList.add("is-ready");
    HP.loop(panel,function(dt){
      T=(T+dt)%CYCLE;
      var k=T<600?2:Math.min(n,3+Math.floor((T-600)/STEP));
      if(T>CYCLE-600) k=2;
      show(k);
    });
  }

  /* ---------- flow connectors start when the flow is on screen ---------- */
  var flow=$("[data-rs-flow]");
  if(flow) HP.once(flow,function(el){ el.classList.add("is-in") });

  /* ---------- calculator: clients x price, nothing else ---------- */
  var calc=$("[data-rs-calc]");
  if(calc){
    var form=$("[data-rs-form]",calc), range=$("[data-rs-range]",calc), clients=$("[data-rs-clients]",calc), price=$("[data-rs-price]",calc),
        outM=$("[data-rs-month]",calc), outY=$("[data-rs-year]",calc), prefix=calc.getAttribute("data-prefix")||"$";
    var fmt=function(v){ try{ return prefix+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) }catch(e){ return prefix+v.toFixed(2) } };
    function run(){
      var c=Math.max(0,Math.floor(+clients.value||0)), p=parseFloat(price.value);
      if(!c || !isFinite(p) || p<0){ outM.textContent="—"; outY.textContent="—"; return }
      outM.textContent=fmt(c*p); outY.textContent=fmt(c*p*12);
    }
    if(form) form.addEventListener("submit",function(e){ e.preventDefault() });
    range.addEventListener("input",function(){ clients.value=range.value; run() });
    clients.addEventListener("input",function(){ var v=+clients.value; if(v>=1&&v<=200) range.value=v; run() });
    price.addEventListener("input",run);
    run();
  }
});
