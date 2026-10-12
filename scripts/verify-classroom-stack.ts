import {spawn,type ChildProcess} from 'node:child_process';
const children:ChildProcess[]=[];
async function main(){
 const url='http://127.0.0.1:3001';
 try{
  const speech=await fetch('http://127.0.0.1:8787/health');if(!speech.ok)throw new Error('Start the speech API first.');
  const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3001'],{stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(web);web.stdout?.on('data',b=>process.stdout.write(b));web.stderr?.on('data',b=>process.stderr.write(b));
  const worker=spawn(process.execPath,['--env-file=.env.local','--import','tsx','worker/video-worker.ts'],{stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(worker);worker.stdout?.on('data',b=>process.stdout.write(b));worker.stderr?.on('data',b=>process.stderr.write(b));
  let ready=false;for(let i=0;i<20;i++){try{const response=await fetch(url+'/api/classroom',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"list"}'});if(response.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw new Error('Test web server did not start.');
  const verifier=spawn(process.execPath,['--env-file=.env.local','--import','tsx','scripts/verify-classroom-cloud.ts'],{env:{...process.env,TEST_APP_URL:url},stdio:'inherit',windowsHide:true});children.push(verifier);
  const code=await new Promise<number>((resolve,reject)=>{verifier.once('exit',c=>resolve(c||0));verifier.once('error',reject);});process.exitCode=code;
 }finally{for(const child of children)if(child.exitCode===null)child.kill();}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:'Stack verification failed.');process.exitCode=1;});
