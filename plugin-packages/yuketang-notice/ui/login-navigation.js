/** Enter the feed after saving the account; never restart authentication to retry navigation. */
export function savedLoginNavigation({request,canNavigate=()=>true,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}) {
  let saved=false,pending=false,done=false,timer=null,attempts=0,closed=false;
  async function enter(){
    if(!saved||pending||done||closed||!canNavigate())return;
    clearTimer(timer);timer=null;pending=true;
    try{
      const accepted=await request('ui.feed',{replace:true});
      if(closed)return;
      if(accepted===false){
        if(++attempts>=20)throw new Error('课堂页面暂未打开，请点击「查看我的课堂」重试');
        timer=setTimer(enter,250);
      }else done=true;
    }catch(error){if(!closed)onError(error);}
    finally{pending=false;}
  }
  return {saved(){saved=true;return enter();},resume:enter,retry(){attempts=0;done=false;return enter();},
    close(){closed=true;clearTimer(timer);},get completed(){return done;}};
}
