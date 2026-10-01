// Word local: only trusted Forms tabs from this extension can request the fixed host actions.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'GSSF_SIMULADO_WORD') return false;
  if (!gssfAllowedSender(sender)) {sendResponse({ok:false,error:'Origem não permitida.'});return false;}
  if (!['status','model','generate','open'].includes(message.action)) {sendResponse({ok:false,error:'Ação não permitida.'});return false;}
  const request={action:message.action};
  if (message.action === 'generate') {
    if (typeof message.html !== 'string' || message.html.length > 64000000) {sendResponse({ok:false,error:'Documento inválido.'});return false;}
    Object.assign(request,{html:message.html,title:String(message.title||'Simulado'),options:message.options||{},expectedQuestions:Number(message.expectedQuestions)||0,expectedImages:Number(message.expectedImages)||0});
  }
  if (message.action === 'open') Object.assign(request,{path:String(message.path||''),print:!!message.print});
  // A native port keeps Manifest V3 alive while Word paginates a large exam.
  let port,finished=false;
  const finish=result=>{
    if(finished)return;finished=true;clearTimeout(timer);
    sendResponse(result);try{port?.disconnect();}catch(_){}
  };
  const failure=error=>{
    const reason=String(error||'');
    const code=/not found/i.test(reason)?'WORD_CONNECTOR_MISSING':/forbidden/i.test(reason)?'WORD_CONNECTOR_FORBIDDEN':'WORD_CONNECTOR_UNAVAILABLE';
    const text=code==='WORD_CONNECTOR_MISSING'?'O conector local do Word ainda não está configurado para este navegador.':code==='WORD_CONNECTOR_FORBIDDEN'?'O conector não está autorizado para o ID desta instalação da extensão.':'Não foi possível concluir a conexão com o Word local.';
    finish({ok:false,code,error:text,technicalDetail:reason,extensionId:chrome.runtime.id});
  };
  const timer=setTimeout(()=>failure('Tempo limite. Confira se o Word está aguardando uma resposta.'),660000);
  try{
    port=chrome.runtime.connectNative('com.gssf.simulado_word');
    port.onMessage.addListener(result=>finish(result));
    port.onDisconnect.addListener(()=>{const error=chrome.runtime.lastError;if(!finished)failure(error?.message||'A conexão foi encerrada antes da conclusão.');});
    port.postMessage(request);
  }catch(error){failure(error.message);}
  return true;
});
