import {chromium} from '@playwright/test';
import fs from 'node:fs';
const origin=process.env.VERIFY_ORIGIN;
if(!origin?.startsWith('https://'))throw new Error('Set VERIFY_ORIGIN to the deployed HTTPS origin');
const report={origin,tested_at:new Date().toISOString(),checks:{}};
const home=await fetch(origin);if(home.status!==200)throw new Error('Homepage: '+home.status);report.checks.homepage='passed';
for(const route of ['study','classroom']){const r=await fetch(origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'snapshot'})});if(r.status!==401)throw new Error(route+' authentication: '+r.status);report.checks[route+'_requires_auth']='passed';}
const media=await fetch(origin+'/samples/photosynthesis.mp4',{headers:{Range:'bytes=0-255'}});if(media.status!==206)throw new Error('Video range request: '+media.status);report.checks.sample_video_range='passed';
const form=new FormData();form.set('file',new Blob(['Photosynthesis converts light energy into chemical energy.']), 'deployment-check.txt');form.set('topic','Photosynthesis');
const ingestion=await fetch(origin+'/api/ingest',{method:'POST',body:form});if(!ingestion.ok||!(await ingestion.json()).segments.length)throw new Error('Text ingestion failed');report.checks.text_ingestion='passed';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('heading',{name:/Welcome back/}).waitFor();
 const nav=page.getByRole('navigation',{name:'Mobile navigation'});if(!await nav.isVisible())throw new Error('Mobile bottom navigation missing');
 await page.screenshot({path:'docs/stitch-dashboard-mobile.png',fullPage:true});
 await nav.getByRole('button',{name:'Galaxy',exact:true}).click();await page.getByRole('heading',{name:'Knowledge Galaxy',exact:true}).waitFor();await page.screenshot({path:'docs/stitch-galaxy-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Review with AI Tutor',exact:true}).click();await page.getByText('Here are the relevant passages',{exact:false}).waitFor();await page.screenshot({path:'docs/stitch-tutor-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Overview',exact:true}).click();await page.screenshot({path:'docs/stitch-dashboard-desktop.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));report.checks.responsive_browser_navigation='passed';report.checks.console_page_errors='none';
}finally{await browser.close();}
fs.writeFileSync('docs/deployment-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
