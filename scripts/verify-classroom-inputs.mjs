import {chromium} from '@playwright/test';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const warnings=[];
 page.on('console',message=>{if(message.type()==='error'&&/uncontrolled|controlled input/i.test(message.text()))warnings.push(message.text());});
 await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Smart Classroom',exact:true}).click();
 await page.getByRole('button',{name:'Add lecture',exact:true}).click();
 await page.getByLabel('Lecture title',{exact:true}).fill('Input switch check');
 await page.getByLabel('Course',{exact:true}).fill('Biology');
 await page.getByLabel('Topic',{exact:true}).fill('Photosynthesis');
 await page.getByLabel('Lecture MP4 (H.264/AAC, max 50 MB)',{exact:true}).setInputFiles('public/samples/photosynthesis.mp4');
 await page.getByRole('button',{name:'YouTube link',exact:true}).click();
 await page.getByLabel('YouTube URL',{exact:true}).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 await page.getByRole('button',{name:'MP4 video',exact:true}).click();
 if(await page.getByLabel('Lecture MP4 (H.264/AAC, max 50 MB)',{exact:true}).evaluate(el=>el.files.length)!==0)throw new Error('File selection was not reset');
 await page.getByRole('button',{name:'Open local preview',exact:true}).click();
 await page.getByText('Choose an MP4 smaller than 50 MB.',{exact:true}).waitFor();
 for(let i=0;i<3;i++){
  await page.getByRole('button',{name:'YouTube link',exact:true}).click();
  if(await page.getByLabel('YouTube URL',{exact:true}).inputValue()!=='https://www.youtube.com/watch?v=dQw4w9WgXcQ')throw new Error('YouTube URL was lost');
  await page.getByRole('button',{name:'MP4 video',exact:true}).click();
 }
 if(warnings.length)throw new Error(warnings.join('\n'));
 console.log('Classroom input switching passed: no controlled/uncontrolled warnings, URL preserved, stale file cleared.');
}finally{await browser.close();}
