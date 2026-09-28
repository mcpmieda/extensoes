
    const api=runtimeWindow.__GSSF_DIAGNOSTIC_RUNTIME__||{};
    return Object.freeze({
      ...api,
      activate:()=>api.activate?.(),
      destroy:async()=>{try{await api.destroy?.();}finally{listenerRegistry.splice(0).forEach(([target,type,listener,options])=>target.removeEventListener(type,listener,options));}}
    });
  