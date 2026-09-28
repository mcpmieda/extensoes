
  async function mount(panel){
    if(mounted&&hostPanel===panel)return;
    if(mountPromise)return mountPromise;
    mountPromise=(async()=>{
      await globalThis.GSSF_STORAGE?.init?.();
      if(mounted&&hostPanel!==panel)await unmount();
      hostPanel=panel;
      const host=panel?.querySelector?.('#gssf-native-organizer-host');
      if(!host)throw new Error('Área nativa do Organizador não encontrada.');
      host.replaceChildren();
      shadowRoot=host.shadowRoot||host.attachShadow({mode:'open'});
      shadowRoot.innerHTML=`<style>${ORGANIZER_RUNTIME_CSS}</style><div class="organizer-app-root">${ORGANIZER_ORIGINAL_BODY}</div>`;
      runtime=await startOrganizerRuntime(shadowRoot);
      resizeObserver?.disconnect?.();
      if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(()=>{try{runtime?.resize?.();}catch(_){}});resizeObserver.observe(host);}
      mounted=true;
    })().finally(()=>{mountPromise=null;});
    return mountPromise;
  }
  function activate(){runtime?.activate?.();}
  async function unmount(){resizeObserver?.disconnect?.();resizeObserver=null;const currentRuntime=runtime;runtime=null;shadowRoot=null;hostPanel=null;mounted=false;try{await currentRuntime?.destroy?.();}catch(error){console.warn('Falha ao encerrar Organizador:',error);}}
  async function flushBackupState(){await runtime?.flushBackupState?.();await globalThis.GSSF_STORAGE?.flush?.();}
  async function reloadBackupState(){await runtime?.reloadBackupState?.();}
  async function clearStoredData({resetRuntime=true}={}){const panel=hostPanel;if(runtime)await runtime.clearRuntime?.();else await createOrganizerStorageAdapter().clear();if(resetRuntime&&panel?.isConnected&&!mounted)await mount(panel);}
  const publicApi=Object.freeze({workspaceHtml,mount,activate,unmount,clearStoredData,flushBackupState,reloadBackupState,isMounted:()=>mounted,getSourceVersion:()=>ORGANIZER_SOURCE_VERSION,getSourceHashes:()=>({...ORGANIZER_SOURCE_HASHES}),getSharedSnapshot:()=>runtime?.getSnapshot?.()||null});
  globalThis.GSSFOrganizer=publicApi;
  globalThis.OrganizadorConteudosApp=publicApi;
