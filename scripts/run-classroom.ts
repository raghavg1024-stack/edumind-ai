import {spawn,type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
const children:ChildProcess[]=[];
const start=(args:string[])=>{const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true});children.push(child);return child;};
async function main(){
 try{const r=await fetch('http://127.0.0.1:8787/health');if(!r.ok)throw new Error();}catch{
  const python=process.env.SPEECH_PYTHON_PATH||resolve('../../work/speech-venv/Scripts/python.exe');
  const speech=spawn(python,['worker/speech_api.py'],{stdio:'inherit',windowsHide:true,env:{...process.env,WHISPER_CACHE:resolve('../../work/whisper-models'),HF_HOME:resolve('../../work/huggingface-cache')}});children.push(speech);
 }
 let webRunning=false;try{webRunning=(await fetch('http://127.0.0.1:3000/api/classroom',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"list"}'})).status===401;}catch{}
 if(!webRunning)start(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000']);
 start(['--env-file=.env.local','--import','tsx','worker/video-worker.ts']);
 console.log('EduMind classroom services running. http://localhost:3000');
 const keepAlive=setInterval(()=>{},30000);
 const stop=()=>{clearInterval(keepAlive);for(const child of children)if(child.exitCode===null)child.kill();};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 for(const child of children)child.on('error',()=>console.error('A classroom service failed to start. Check its configuration.'));
}
void main().catch(()=>{console.error('Classroom services could not start.');process.exitCode=1;});
