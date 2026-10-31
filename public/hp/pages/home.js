/* Homepage signature hero: rotating keyword, dotted 3D globe (orthographic canvas) with datacenter pins and
   great-circle arcs from Dubai, floating event cards with pointer parallax, magnetic secondary CTA.
   Land dots: a Fibonacci sphere of N points, one bit per point (1 = land), sampled at build time from
   Natural Earth 110m land (world-atlas). rAF runs only while the hero is on screen and the tab is visible. */
(function(){
  "use strict";
  var LAND="AAAAAAAQAIQEJCAxIQkgCEhAQEITkBAYhMAEZgAwIQHATMwCYCMTiZmcTOJOdxMzWZGW3gsb2tLWnta0taWlrS2taWtLa1paUtLW1v3/b3//U9ue/t7e/7e1P7+p7c/vamt329qf3tTG7/e1PbmpqU7uamZzs5Kd3NTU5mclM7mJ6U7uSm5zs5eZnIT852cjNzmd2czORn5zs5ednMTt52cvPzlZ2c7OTnbzs5ednKzs52cvOzlZ287OVnZzs5OcnKzs52cvOTlZ287OXnJzs5ecnKzk52crOTlZ247OVnJzs5WcnKzkx2YvOTlZis7OVnJjMxWcnKzExyYvOXnZis5ORmKjExOcvKzFRyYjOVnZys5ORnKjE5GYrITlRycjOVnIycxGQnKjEZGYrMRkRycjOVGIyMxWQnIjEZGcrKRk5ycpOVmIysxGQnLzEZWYjIRFZychMXmIysxWQmKzE5SYrIRlZiMhMVmIykxeQnKzEZSYrIRlJi8pMVnIykxWQnKTlZScrIRlJyspOVnIyk5WUjKTlZScrKRlJygpOVnKSk5SUjKTlJScpKUlJygpGVnKSk5QUrKTlJSYrKUlJygpGUnKSk5QUpKTlJSIrKUlJykpWUHKSgZQUpKClJSooKUlBykpSUHKSg5SUpKClJSoJKUlAyspSUBKShYSUpKIlJSsqCUlAwkpSUBKyhQSUpKBlJSsqCVlAwkJSUBKShQQErKhhISsoCVlCwgpWUBCShQUErKAhISsoCElCwgJWUBCClQQErKGhASsICFlCQgJWUBCClAQELKEhASsICFFCQgIWUNCClIQEKKGhASkoCFFCQgIQUJCClAQEKKGhASgqCEFCQgISUNCAlAUEKKGhAQkKCEBaQoIQFNCAlJUEKCkhQQkKCEBKQoIQVNCAlIUEKCkhQQgKKEBCSoIQFNCglIUEICkhQQgKKEBSQoIQFJCghAUEICkhRQgKCFBSSoIAFJKipAUEICghQQAKCFFQCoIAFBKioAUEACgBQQAKCFFQCoIAFBKgoAUECKgFQQAKCFFQCoIEVAKgoAUEKKgFRQIqAFFQAoIEVAKggAUAKKgFQQIqAFBQAoIUVEKioQUAKCgFQUIqIFFQAoAUVAKgoRUAKCiFQEIKIFFRAoCUVEKgowUBOCiBQEIKAFFRgoCUFEKgIwUBKKiBQEIKAFBRgoCUFEKgIwUBKCiFQEIKAFBRioCUFECgIwUBKCiBQEIqIFAQgoCUVEDgIwUAKCgBQEoKAFAQgoAUFACgIQUAKChBQEoKAFAQgoAUFACgIQUAKAhBRAoKAFAQgogUFACiBQUAKAhBRQoKIFESgoAUFACiBQUAKIhBQAoKIFESgoAURACihQUQKIlBRAo6vtf////+1tLyBRUQKKkBRAoiIFFCgogURACiBREQKKEBRAoiAFECiIgUVACiBREQKKFERAoiIFECiIgUUIKiBREQKIFERAoqIVECiIgUUIKiBREQqIFERAooIVECiIgUQKIiBRAQqIFERAooIVECiAhUQKIiBRAQqIFEBAogcRECiAhUQKICBRAQiIFEBAogURECiAhUQKICBRAYiIFEBAogUQECiAhEQKICBRAYgIFEBCogUQECiAhEQKICBRAIgIFEBCIgUQECiAxAQKICARAIgIFABCAgUAEAgARAQKACERAoAIBAAiAgEAEAgAQAQCACAAAIAIBAAgAgEAEAAAQAQCABAAAIAIAAAgAgEACAAAQIQCABAAAIAAAAAgQAAACAAAQAAAABAAAAAAAAAgQAAACAAAAAQAABAgAAAEAAAgAAAACBAAAAAAABAAAAAECAAAAAAACAAAAAIEAAAAAAAEAAAAAAIACAAAAAIAAAAAAAAEAAAAAQAACAAAAAIAAAAAAAAGAAAAAQAAAAAAAAIAAAAAAAAAAAAgAQAAAAAAAAIAAAAAgAAAAAAAAQAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", N=13000;
  var TAU=Math.PI*2, RAD=Math.PI/180;

  function init(HP){
    var $=HP.$, $$=HP.$$, W=window, D=document, reduce=HP.reduce;
    var hero=$("[data-hx]"); if(!hero) return;
    var fine=W.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var narrow=W.matchMedia("(max-width: 899px)");
    var heroIn=true;
    if("IntersectionObserver" in W) new IntersectionObserver(function(es){ heroIn=es[es.length-1].isIntersecting }).observe(hero);
    var live=function(){ return heroIn && !D.hidden };

    /* ---------- rotating keyword ---------- */
    (function(){
      var box=$("[data-hx-rot]",hero); if(!box) return;
      var ws=$$(".hx-rot__w",box), k=0;
      var setW=function(){ box.style.setProperty("--w",ws[k].offsetWidth+"px") };
      setW(); if(D.fonts && D.fonts.ready) D.fonts.ready.then(setW);
      W.addEventListener("resize",setW);
      if(reduce || ws.length<2) return;
      setInterval(function(){
        if(!live()) return;
        var o=ws[k]; k=(k+1)%ws.length; var n=ws[k];
        o.classList.remove("is-on"); o.classList.add("is-out");
        n.classList.add("is-on"); setW();
        setTimeout(function(){ o.classList.add("is-reset"); o.classList.remove("is-out"); void o.offsetWidth; o.classList.remove("is-reset") },700);
      },2800);
    })();

    /* ---------- floating event cards ---------- */
    var cards=$$(".hx-card",hero), depth=[18,28,12];
    (function(){
      var wrap=$("[data-hx-events]",hero); if(!wrap || reduce) return;
      var ev; try{ ev=JSON.parse(wrap.getAttribute("data-hx-events")) }catch(e){ return }
      if(!ev || !ev.length) return;
      var merged=[], idx=ev.map(function(){return 0}), slot=0, mi=0, r, s;
      for(r=0;r<3;r++) for(s=0;s<ev.length;s++) if(ev[s][r]) merged.push(ev[s][r]);
      var show=function(card,e){
        if(!card) return;
        card.classList.add("is-swap");
        setTimeout(function(){
          var u=$(".hx-card__ico use",card), b=$(".hx-card__txt b",card), sm=$(".hx-card__txt small",card);
          if(u) u.setAttribute("href","#i-"+e.i);
          if(b) b.textContent=e.t; if(sm) sm.textContent=e.s;
          card.classList.remove("is-swap");
        },380);
      };
      setInterval(function(){
        if(!live()) return;
        if(narrow.matches){ mi=(mi+1)%merged.length; show(cards[0],merged[mi]); return }
        idx[slot]=(idx[slot]+1)%ev[slot].length; show(cards[slot],ev[slot][idx[slot]]); slot=(slot+1)%Math.min(cards.length,ev.length);
      },2400);
    })();

    /* ---------- magnetic secondary CTA (the brand CTA is handled by theme.js) ---------- */
    if(fine && !reduce){
      var mb=$(".hx-cta .hp-btn--outline",hero), mr=null;
      if(mb){
        mb.addEventListener("pointerenter",function(){ mb.style.translate=""; mr=mb.getBoundingClientRect(); mb.classList.add("is-mag") });
        mb.addEventListener("pointermove",function(e){ if(!mr) return;
          var dx=(e.clientX-(mr.left+mr.width/2))/(mr.width/2), dy=(e.clientY-(mr.top+mr.height/2))/(mr.height/2);
          mb.style.translate=(Math.max(-1,Math.min(1,dx))*5).toFixed(2)+"px "+(Math.max(-1,Math.min(1,dy))*4).toFixed(2)+"px" });
        mb.addEventListener("pointerleave",function(){ mr=null; mb.style.translate=""; mb.classList.remove("is-mag") });
      }
    }

    /* ---------- globe ---------- */
    var host=$("[data-hx-globe]",hero); if(!host) return;
    var cv=$("canvas",host), ctx=cv && cv.getContext("2d"); if(!ctx) return;
    var DCS=[]; try{ DCS=JSON.parse(host.getAttribute("data-dcs")||"[]") }catch(e){}

    // land points (unit vectors), full set and a half set for small globes
    var bin=W.atob(LAND), ga=Math.PI*(3-Math.sqrt(5)), a=[], h=[], c=0;
    for(var i=0;i<N;i++){
      if(!((bin.charCodeAt(i>>3)>>(7-(i&7)))&1)) continue;
      var y=1-(i+.5)/N*2, r=Math.sqrt(1-y*y), th=(i*ga)%TAU-Math.PI, x=r*Math.sin(th), z=r*Math.cos(th);
      a.push(x,y,z); if((c++)%2===0) h.push(x,y,z);
    }
    var FULL=new Float32Array(a), HALF=new Float32Array(h), P=FULL;
    var SX=new Float32Array(FULL.length/3), SY=new Float32Array(FULL.length/3), BK=new Uint8Array(FULL.length/3);

    var vec=function(lat,lon){ var la=lat*RAD, lo=lon*RAD; return [Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)] };
    var hq=null, dcs=[];
    DCS.forEach(function(d){ var o={label:d[0],v:vec(d[1],d[2]),hq:!!d[3]}; if(o.hq) hq=o; else dcs.push(o) });
    if(!hq) hq={label:"Dubai HQ",v:vec(25.2,55.27),hq:true};

    // great-circle arcs Dubai → each DC, lifted off the surface
    var SEG=64, arcs=dcs.map(function(d,k){
      var A=hq.v, B=d.v, dot=A[0]*B[0]+A[1]*B[1]+A[2]*B[2], om=Math.acos(Math.max(-1,Math.min(1,dot))), so=Math.sin(om)||1, lift=.05+.2*om/Math.PI, pts=new Float32Array((SEG+1)*3);
      for(var s=0;s<=SEG;s++){
        var t=s/SEG, w1=Math.sin((1-t)*om)/so, w2=Math.sin(t*om)/so, e=1+lift*Math.sin(Math.PI*t);
        pts[s*3]=(A[0]*w1+B[0]*w2)*e; pts[s*3+1]=(A[1]*w1+B[1]*w2)*e; pts[s*3+2]=(A[2]*w1+B[2]*w2)*e;
      }
      return {pts:pts, sx:new Float32Array(SEG+1), sy:new Float32Array(SEG+1), vis:new Uint8Array(SEG+1), off:k*.37+.1};
    });

    // glow sprites
    var sprite=function(rgb){ var s=D.createElement("canvas"); s.width=s.height=64; var g=s.getContext("2d"), gr=g.createRadialGradient(32,32,0,32,32,32);
      gr.addColorStop(0,"rgba(255,255,255,1)"); gr.addColorStop(.18,"rgba("+rgb+",.9)"); gr.addColorStop(.5,"rgba("+rgb+",.22)"); gr.addColorStop(1,"rgba("+rgb+",0)");
      g.fillStyle=gr; g.fillRect(0,0,64,64); return s };
    var GOLD=sprite("253,215,0"), RASP=sprite("225,76,127");

    var S=0, R=0, CX=0, CY=0, dotR=1, small=false, dpr=1;
    var BASE_TILT=.32, yaw=-32*RAD, tilt=BASE_TILT, AUTO=reduce?0:.000085, vel=AUTO, drag=false;
    var t0=performance.now(), started=false;

    function size(){
      var rc=host.getBoundingClientRect(); if(!rc.width) return;
      dpr=Math.min(2,W.devicePixelRatio||1); S=rc.width; R=S*.36; CX=S/2; CY=S/2;
      small=S<440; P=small?HALF:FULL; dotR=Math.max(.85,R/(small?150:205));
      cv.width=Math.round(S*dpr); cv.height=Math.round(S*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
      draw(performance.now());
    }

    function hexPath(x,y,r){ ctx.beginPath(); for(var k=0;k<6;k++){ var an=Math.PI/3*k-Math.PI/2, px=x+r*Math.cos(an), py=y+r*Math.sin(an); if(k) ctx.lineTo(px,py); else ctx.moveTo(px,py) } ctx.closePath() }
    var ease=function(u){ u=Math.max(0,Math.min(1,u)); return 1-Math.pow(1-u,3) };

    function draw(t){
      if(!S) return;
      var cy=Math.cos(yaw), sy=Math.sin(yaw), ct=Math.cos(tilt), st=Math.sin(tilt);
      ctx.clearRect(0,0,S,S);
      var n=P.length/3, k, x, y, z, x1, z1, y2, z2;

      // dots: bucket 0 = back, 1..3 = front by depth
      for(k=0;k<n;k++){
        x=P[k*3]; y=P[k*3+1]; z=P[k*3+2];
        x1=x*cy+z*sy; z1=-x*sy+z*cy; y2=y*ct-z1*st; z2=y*st+z1*ct;
        SX[k]=CX+x1*R; SY[k]=CY-y2*R; BK[k]= z2<0 ? 0 : z2<.35 ? 1 : z2<.7 ? 2 : 3;
      }
      var fills=["rgba(169,180,191,.13)","rgba(205,214,223,.36)","rgba(216,224,232,.62)","rgba(236,241,245,.92)"], rads=[.8,.8,.95,1.1];
      for(var b=0;b<4;b++){
        var rr=dotR*rads[b]; ctx.beginPath();
        for(k=0;k<n;k++) if(BK[k]===b){ ctx.moveTo(SX[k]+rr,SY[k]); ctx.arc(SX[k],SY[k],rr,0,TAU) }
        ctx.fillStyle=fills[b]; ctx.fill();
        if(b===0) drawArcs(t,cy,sy,ct,st,false);
      }
      drawArcs(t,cy,sy,ct,st,true);
      drawPins(t,cy,sy,ct,st);
    }

    function arcProg(i,t){ return (reduce||!started) ? (reduce?1:0) : ease((t-t0-480-i*95)/620) }

    function drawArcs(t,cy,sy,ct,st,front){
      var i, s, A;
      if(!front){
        // project once per frame (back pass runs first)
        for(i=0;i<arcs.length;i++){ A=arcs[i];
          for(s=0;s<=SEG;s++){
            var x=A.pts[s*3], y=A.pts[s*3+1], z=A.pts[s*3+2], x1=x*cy+z*sy, z1=-x*sy+z*cy, y2=y*ct-z1*st, z2=y*st+z1*ct;
            A.sx[s]=CX+x1*R; A.sy[s]=CY-y2*R; A.vis[s]= (z2>0 || x1*x1+y2*y2>1) ? 1 : 0;
          }
        }
        ctx.beginPath();
        for(i=0;i<arcs.length;i++){ A=arcs[i]; var m=Math.floor(arcProg(i,t)*SEG), pen=false;
          for(s=0;s<=m;s++){ if(!A.vis[s]){ if(pen) ctx.lineTo(A.sx[s],A.sy[s]); else ctx.moveTo(A.sx[s],A.sy[s]); pen=true } else pen=false }
        }
        ctx.setLineDash([2,4]); ctx.strokeStyle="rgba(225,76,127,.22)"; ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      ctx.lineCap="round";
      for(i=0;i<arcs.length;i++){ A=arcs[i]; var p=arcProg(i,t), mm=Math.floor(p*SEG), on=false;
        if(mm<1) continue;
        var g=ctx.createLinearGradient(A.sx[0],A.sy[0],A.sx[SEG],A.sy[SEG]);
        g.addColorStop(0,"rgba(253,215,0,.75)"); g.addColorStop(.45,"rgba(240,110,150,.7)"); g.addColorStop(1,"rgba(225,76,127,.55)");
        ctx.beginPath();
        for(s=0;s<=mm;s++){ if(A.vis[s]){ if(on) ctx.lineTo(A.sx[s],A.sy[s]); else ctx.moveTo(A.sx[s],A.sy[s]); on=true } else on=false }
        ctx.strokeStyle=g; ctx.lineWidth=1.4; ctx.stroke();
        // drawing head while the arc grows
        if(p<1 && A.vis[mm]) ctx.drawImage(RASP,A.sx[mm]-9,A.sy[mm]-9,18,18);
        // light packet
        if(p>=1 && !reduce){
          var u=((t/3000)+A.off)%1*1.3; if(u>1) continue;
          var hi=u*SEG, tail=Math.max(0,hi-9), s0=Math.floor(tail), s1=Math.floor(hi);
          if(!A.vis[s1]) continue;
          var tg=ctx.createLinearGradient(A.sx[s0],A.sy[s0],A.sx[s1],A.sy[s1]);
          tg.addColorStop(0,"rgba(255,236,150,0)"); tg.addColorStop(1,"rgba(255,244,200,.95)");
          ctx.beginPath(); on=false;
          for(s=s0;s<=s1;s++){ if(A.vis[s]){ if(on) ctx.lineTo(A.sx[s],A.sy[s]); else ctx.moveTo(A.sx[s],A.sy[s]); on=true } else on=false }
          ctx.strokeStyle=tg; ctx.lineWidth=2.2; ctx.stroke();
          ctx.drawImage(GOLD,A.sx[s1]-10,A.sy[s1]-10,20,20);
        }
      }
    }

    function drawPins(t,cy,sy,ct,st){
      var list=dcs.concat([hq]), labels=[];
      ctx.font="600 "+(small?10.5:11.5)+"px Inter, system-ui, sans-serif"; ctx.textBaseline="middle";
      for(var k=0;k<list.length;k++){
        var d=list[k], v=d.v, x1=v[0]*cy+v[2]*sy, z1=-v[0]*sy+v[2]*cy, y2=v[1]*ct-z1*st, z2=v[1]*st+z1*ct;
        if(z2<.04) continue;
        var al=Math.min(1,(z2-.04)*4), X=CX+x1*R, Y=CY-y2*R;
        var appear=reduce?1:ease((t-t0-420-k*70)/500); al*=appear; if(al<=0) continue;
        var col=d.hq?"253,215,0":"225,76,127";
        ctx.globalAlpha=al;
        if(!reduce){
          var ph=((t/2600)+k*.19)%1; hexPath(X,Y,5+ph*15);
          ctx.strokeStyle="rgba("+col+","+(.6*(1-ph)).toFixed(3)+")"; ctx.lineWidth=1.2; ctx.stroke();
        } else { hexPath(X,Y,11); ctx.strokeStyle="rgba("+col+",.35)"; ctx.lineWidth=1; ctx.stroke() }
        var gs=d.hq?34:24; ctx.drawImage(d.hq?GOLD:RASP,X-gs/2,Y-gs/2,gs,gs);
        hexPath(X,Y,d.hq?5.2:4); ctx.fillStyle="rgb("+col+")"; ctx.fill();
        ctx.strokeStyle="rgba(22,33,43,.9)"; ctx.lineWidth=1; ctx.stroke();
        if(z2>.18) labels.push({d:d,X:X,Y:Y,a:al*Math.min(1,(z2-.18)*4)});
      }
      // labels: HQ first, then each DC takes the first free spot (right, below-right, left, above) so tags never overlap
      labels.sort(function(p,q){ return (q.d.hq?1:0)-(p.d.hq?1:0) });
      var used=[];
      for(var j=0;j<labels.length;j++){
        var L=labels[j], w=ctx.measureText(L.d.label).width+10, hgt=19, g=L.d.hq?11:9, cand=[[g,-hgt/2],[g-2,6],[-g-w,-hgt/2],[-w/2,-hgt-g+2],[-w/2,g-1]], pick=null;
        for(var q=0;q<cand.length && !pick;q++){
          var bx=L.X+cand[q][0], by=L.Y+cand[q][1], hit=false;
          for(var u=0;u<used.length;u++){ var o=used[u]; if(bx<o[0]+o[2]+3 && bx+w+3>o[0] && by<o[1]+o[3]+2 && by+hgt+2>o[1]){ hit=true; break } }
          if(!hit) pick=[bx,by];
        }
        if(!pick) continue;
        used.push([pick[0],pick[1],w,hgt]);
        ctx.globalAlpha=L.a; ctx.fillStyle="rgba(16,24,32,.66)"; ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(pick[0],pick[1],w,hgt,6); else ctx.rect(pick[0],pick[1],w,hgt); ctx.fill();
        ctx.fillStyle=L.d.hq?"#ffe873":"rgba(236,241,245,.95)"; ctx.fillText(L.d.label,pick[0]+5,pick[1]+hgt/2+.5);
      }
      ctx.globalAlpha=1;
    }

    /* drag to rotate (horizontal on touch, both axes with a mouse), with inertia */
    var lx=0, ly=0, lt=0, pid=null, ptype="";
    host.addEventListener("pointerdown",function(e){
      if(e.button && e.button!==0) return;
      drag=true; pid=e.pointerId; ptype=e.pointerType; lx=e.clientX; ly=e.clientY; lt=performance.now(); vel=0;
      if(ptype==="mouse"){ try{ host.setPointerCapture(pid) }catch(_){} host.classList.add("is-drag") }
    });
    host.addEventListener("pointermove",function(e){
      if(!drag || e.pointerId!==pid || !R) return;
      var now=performance.now(), dx=e.clientX-lx, dy=e.clientY-ly, dt=Math.max(8,now-lt);
      if(ptype!=="mouse" && Math.abs(dy)>Math.abs(dx)*1.2 && Math.abs(dx)<6){ return }
      yaw+=dx/R; if(ptype==="mouse") tilt=Math.max(-.15,Math.min(.85,tilt+dy/R));
      vel=vel*.5+(dx/R/dt)*.5; lx=e.clientX; ly=e.clientY; lt=now;
      if(reduce) draw(now);
    });
    var end=function(e){ if(!drag || (e && e.pointerId!==pid)) return; drag=false; pid=null; host.classList.remove("is-drag");
      if(performance.now()-lt>90) vel=0; vel=Math.max(-.006,Math.min(.006,vel)); if(reduce){ vel=0; draw(performance.now()) } };
    host.addEventListener("pointerup",end); host.addEventListener("pointercancel",end); host.addEventListener("lostpointercapture",end);

    /* pointer parallax for cards and globe (mouse only) */
    var ptx=0, pty=0, cpx=0, cpy=0;
    if(fine && !reduce){
      hero.addEventListener("pointermove",function(e){ if(e.pointerType!=="mouse") return; var rc=hero.getBoundingClientRect();
        ptx=((e.clientX-rc.left)/rc.width-.5)*2; pty=((e.clientY-rc.top)/rc.height-.5)*2 },{passive:true});
      hero.addEventListener("pointerleave",function(){ ptx=0; pty=0 });
    }
    function parallax(dt){
      var f=1-Math.exp(-dt/240), nx=cpx+(ptx-cpx)*f, ny=cpy+(pty-cpy)*f;
      if(Math.abs(nx-cpx)<.0005 && Math.abs(ny-cpy)<.0005) return;
      cpx=nx; cpy=ny;
      for(var k=0;k<cards.length;k++){ var d=depth[k]||14; cards[k].style.translate=(cpx*d).toFixed(2)+"px "+(cpy*d*.7).toFixed(2)+"px" }
      host.style.translate=(-cpx*7).toFixed(2)+"px "+(-cpy*5).toFixed(2)+"px";
    }

    if("ResizeObserver" in W) new ResizeObserver(size).observe(host); else W.addEventListener("resize",size);
    size();
    if(D.fonts && D.fonts.ready) D.fonts.ready.then(function(){ if(reduce) draw(performance.now()) });
    if(reduce) return;
    started=true; t0=performance.now();
    // aurora: three soft glows drawn into a tiny canvas that CSS stretches over the stage. They drift very slowly,
    // so redrawing ~8 times a second is visually continuous and keeps the per-frame cost near zero.
    var auC=$(".hx-aurora",hero), auX=auC && auC.getContext("2d"), auT=1e9;
    var AU=[[.86,.12,.62,"197,56,111",.28,.07,.05,47],[.06,1.0,.5,"225,76,127",.18,-.08,-.07,59],[.84,1.02,.4,"253,215,0",.13,-.09,-.05,41]];
    function aurora(t){
      if(!auX) return; var w=auC.width, hh=auC.height; auX.clearRect(0,0,w,hh);
      for(var k=0;k<AU.length;k++){ var m=AU[k], q=Math.sin(t/1000/m[7]*Math.PI), x=(m[0]+m[5]*q)*w, y=(m[1]+m[6]*q)*hh, rr=m[2]*w*(1+.06*q);
        var g=auX.createRadialGradient(x,y,0,x,y,rr); g.addColorStop(0,"rgba("+m[3]+","+m[4]+")"); g.addColorStop(.55,"rgba("+m[3]+","+(m[4]*.3).toFixed(3)+")"); g.addColorStop(1,"rgba("+m[3]+",0)");
        auX.fillStyle=g; auX.fillRect(0,0,w,hh) }
      auC.classList.add("is-on");
    }
    HP.loop(host,function(dt,t){
      auT+=dt; if(auT>125){ auT=0; aurora(t) }
      if(!drag){
        vel+=(AUTO-vel)*(1-Math.exp(-dt/1100)); yaw+=vel*dt;
        tilt+=(BASE_TILT-tilt)*(1-Math.exp(-dt/1800));
      }
      parallax(dt);
      draw(t);
    });
    HP.hxStats={ dots:function(){ return P.length/3 } };
  }
  (window.HP && window.HP.on) ? window.HP.on(init) : (window.HP=window.HP||{}, (window.HP._q=window.HP._q||[]).push(init));
})();
