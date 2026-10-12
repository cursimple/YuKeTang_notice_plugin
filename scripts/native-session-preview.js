// Test-only native bridge model; never included in the component ZIP.
(() => {
 const sdk = window.CurSimpleComponent, original = sdk.request.bind(sdk);
 const sockets = new Map(), requests = new Map();let next=0;
 const fetchMock = window.fetch.bind(window);
 window.previewNativeCommands=[];
 sdk.capabilities={sessionFetch:true,nativeWebSocket:true};
 sdk.request=async(command,payload={})=>{
  if(!command.startsWith('network.'))return original(command,payload);
  window.previewNativeCommands.push(command);
  if(command==='network.session.fetch'){
   const controller=new AbortController();requests.set(payload.requestId,controller);
   try{const response=await fetchMock(payload.url,{method:payload.method,headers:payload.headers,body:payload.body||undefined,signal:controller.signal});
    return {status:response.status,body:await response.text(),contentType:'application/json'};
   }finally{requests.delete(payload.requestId);}
  }
  if(command==='network.session.cancel'){requests.get(payload.requestId)?.abort();return true;}
  if(command==='network.socket.open'){
   const id='native-'+(++next),socket=new window.WebSocket(payload.url),entry={socket,queue:[],waiter:null};sockets.set(id,entry);
   const emit=event=>{entry.queue.push(event);if(entry.waiter){const resolve=entry.waiter;entry.waiter=null;resolve({events:entry.queue.splice(0)});}};
   socket.onopen=()=>emit({type:'open'});socket.onmessage=e=>emit({type:'message',data:e.data});
   socket.onerror=()=>emit({type:'error'});socket.onclose=()=>emit({type:'close'});return id;
  }
  const entry=sockets.get(payload.socketId);
  if(command==='network.socket.poll'){
   if(!entry)return {events:[{type:'close'}]};
   if(entry.queue.length)return {events:entry.queue.splice(0)};
   return new Promise(resolve=>entry.waiter=resolve);
  }
  if(command==='network.socket.send'){entry.socket.send(payload.text);return true;}
  if(command==='network.socket.close'){entry?.socket.close();sockets.delete(payload.socketId);return true;}
  throw Error('Preview command not supported');
 };
})();
