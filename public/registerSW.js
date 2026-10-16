/* Actualiza solamente el código de la app. Nunca borra datos, sesiones o trabajos. */
(() => {
  if (window.__planotsVersionStarted) return;
  window.__planotsVersionStarted = true;
  const storageKey = 'planots-last-verified-build';
  const current = {
    id: document.querySelector('meta[name="planots-build"]')?.content || '',
    builtAt: Number(document.querySelector('meta[name="planots-built-at"]')?.content || 0),
  };
  const valid = v => !!v && v.schema === 1 && /^[a-f0-9]{7}$/.test(v.id) && Number.isSafeInteger(v.builtAt) && v.builtAt > 0;
  let latest, registration, inFlight, checkedAt = 0, status = 'checking', applying = false;
  let highest;
  try { const value=JSON.parse(localStorage.getItem(storageKey)||'null'); if(valid(value)) highest=value; } catch { /* no hace falta almacenamiento para comprobar */ }
  if(valid({schema:1,...current}) && (!highest || current.builtAt>highest.builtAt)) highest={schema:1,...current};
  const notice = document.createElement('aside');
  notice.id = 'planots-version-status'; notice.setAttribute('aria-live','polite');
  const label = document.createElement('span'), action = document.createElement('button');
  action.type='button'; notice.append(label,action);
  const style=document.createElement('style');
  style.textContent='#planots-version-status{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;align-items:center;gap:10px;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:6px 10px;border:1px solid var(--border-default,#d6ddeb);border-radius:8px;background:var(--bg-surface,#fff);color:var(--text-primary,#172238);font:12px/1.4 system-ui;box-shadow:0 2px 8px #17223814}#planots-version-status[data-state="current"]{opacity:.8;font-size:10px;padding:3px 8px}#planots-version-status button{flex:none;min-height:32px;padding:4px 9px;border:1px solid var(--border-default,#d6ddeb);border-radius:6px;background:var(--bg-surface,#fff);color:var(--accent,#3d589d);font:inherit;cursor:pointer}#planots-version-status button[hidden]{display:none}@media(max-width:600px){#planots-version-status:not([data-state="current"]){bottom:70px;width:calc(100vw - 24px)}}';
  document.head.append(style); document.body.append(notice);
  function render(next) {
    status=next; notice.dataset.state=next; action.hidden=false; action.disabled=applying;
    const build=current.id ? `Versión ${current.id}` : 'Versión anterior';
    if(next==='current'){label.textContent=`${build} · verificada`;action.hidden=true;}
    else if(next==='update'){label.textContent=`${build} · actualización disponible. Guardá tus cambios.`;action.textContent='Actualizar';}
    else if(next==='rollback'){label.textContent=`${build} · el servidor entregó una versión anterior; no se aplicará.`;action.textContent='Reintentar';}
    else if(next==='offline'){label.textContent=`${build} · sin conexión verificada. Estás usando la copia guardada.`;action.textContent='Reintentar';}
    else if(next==='dirty'){label.textContent='Guardá o cerrá el formulario abierto antes de actualizar.';action.textContent='Comprobar';}
    else if(next==='loading'){label.textContent='Preparando la actualización. Se conservan los datos guardados.';action.hidden=true;}
    else {label.textContent=`${build} · comprobando actualización…`;action.hidden=true;}
  }
  async function adoptMatchingWorker() {
    const worker=registration?.waiting;
    if(!worker || status!=='current')return;
    // HTML nuevo bajo un controlador anterior: activar solo el worker de esta misma compilación.
    const build=await new Promise(resolve=>{
      const channel=new MessageChannel();
      const timer=setTimeout(()=>{channel.port1.close();resolve(null);},1500);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
      worker.postMessage({type:'PLANOTS_BUILD'},[channel.port2]);
    });
    if(valid(build) && build.id===current.id && build.builtAt===current.builtAt)worker.postMessage({type:'SKIP_WAITING'});
  }
  async function verify(force=false) {
    if(inFlight)return inFlight;
    if(!force && Date.now()-checkedAt<60000)return;
    checkedAt=Date.now();
    inFlight=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try {
        const response=await fetch(`/version.json?check=${Date.now()}`,{cache:'no-store',credentials:'omit',signal:controller.signal});
        if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))throw new Error('Versión sin verificar');
        const value=await response.json(); if(!valid(value))throw new Error('Versión inválida');
        latest=value;
        if(highest && value.builtAt<highest.builtAt){render('rollback');return;}
        highest=value;try{localStorage.setItem(storageKey,JSON.stringify(value));}catch{/* almacenamiento opcional */}
        render(value.id===current.id && value.builtAt===current.builtAt ? 'current' : 'update');
        void adoptMatchingWorker();
        void registration?.update().catch(()=>{});
      } catch {render('offline');}
      finally {clearTimeout(timer);inFlight=null;}
    })();
    return inFlight;
  }
  async function update() {
    if(applying)return;
    if(!window.dispatchEvent(new Event('beforeunload',{cancelable:true}))){render('dirty');return;}
    applying=true;action.disabled=true;
    try {
      await verify(true);
      if(status!=='update' || !latest)return;
      render('loading');
      if(registration){
        await registration.update();
        if(registration.installing){
          await new Promise((resolve,reject)=>{
            const worker=registration.installing,timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(new Error('Descarga pendiente'));},15000);
            function changed(){if(worker.state==='installed'){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',changed);reject(new Error('No se instaló'));}}
            worker.addEventListener('statechange',changed);changed();
          });
        }
      }
      // Preparar HTML nuevo evita que una conexión lenta vuelva a mostrar la navegación anterior.
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await fetch(window.location.href,{cache:'no-store',credentials:'omit',signal:controller.signal});
        if(!response.ok || !response.headers.get('content-type')?.includes('text/html'))throw new Error('HTML sin verificar');
        const html=await response.clone().text();
        const id=html.match(/<meta\s+name="planots-build"\s+content="([a-f0-9]{7})"/)?.[1];
        const builtAt=Number(html.match(/<meta\s+name="planots-built-at"\s+content="(\d+)"/)?.[1]||0);
        if(id!==latest.id || builtAt!==latest.builtAt)throw new Error('La actualización cambió; comprobar nuevamente');
        if(typeof caches!=='undefined'){
          const key=new URL(window.location.href);key.pathname='/';key.searchParams.delete('release');
          await (await caches.open('planots-navigation-v1')).put(key.href,response);
        }
      } finally {clearTimeout(timer);}
      if(registration?.waiting){
          await new Promise((resolve,reject)=>{
            const changed=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();};
            const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('Activación pendiente'));},10000);
            navigator.serviceWorker.addEventListener('controllerchange',changed);registration.waiting.postMessage({type:'SKIP_WAITING'});
          });
      }
      // La recarga es una acción del usuario y conserva las guardas beforeunload de los formularios.
      window.location.reload();
    } catch {render('update');}
    finally {applying=false;action.disabled=false;}
  }
  action.addEventListener('click',()=>{if(status==='update')void update();else void verify(true);});
  window.addEventListener('online',()=>void verify(true));
  window.addEventListener('offline',()=>render('offline'));
  window.addEventListener('focus',()=>void verify());
  window.addEventListener('vite:preloadError',()=>{render('update');void verify(true);});
  if(current.id){const url=new URL(window.location.href);if(url.searchParams.has('release')){url.searchParams.set('release',current.id);history.replaceState(history.state,'',url);}}
  render(highest && current.builtAt<highest.builtAt?'update':'checking');
  if('serviceWorker' in navigator){
    void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(value=>{
      registration=value;void value.update().catch(()=>{});
      void adoptMatchingWorker();
      value.addEventListener('updatefound',()=>{const worker=value.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')void verify(true);});});
    }).catch(()=>{});
  }
  void verify(true);
  setInterval(()=>{if(document.visibilityState==='visible')void verify();},300000);
})();
