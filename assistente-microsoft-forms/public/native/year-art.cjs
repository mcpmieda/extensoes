// Dynamic year typography for the retained school's artwork. No network or AI service.
const fs=require('fs');const path=require('path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8').replace(/^\ufeff/,''));
const {createCanvas,loadImage,GlobalFonts}=require(path.join(config.nodeModules,'@napi-rs/canvas'));
const fontRoot=path.join(process.env.WINDIR||'C:/Windows','Fonts');
for(const [file,name] of [['arial.ttf','GssfArial'],['arialbd.ttf','GssfArialBold'],['ariali.ttf','GssfArialItalic']]){
 if(fs.existsSync(path.join(fontRoot,file)))GlobalFonts.registerFromPath(path.join(fontRoot,file),name);
}
function findGrayBox(ctx,w,h){const d=ctx.getImageData(0,0,w,h).data;let x0=w,x1=0,y0=h,y1=0;for(let y=0;y<h;y++)for(let x=Math.floor(w*.45);x<w;x++){const i=(y*w+x)*4;if(d[i+3]>30&&d[i]>100&&Math.abs(d[i]-d[i+1])<4&&Math.abs(d[i]-d[i+2])<4){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
let digitBank={};
function numberImage(year,w,h,color){const base=createCanvas(1200,340),c=base.getContext('2d');c.font='260px GssfArialItalic';c.fillStyle=color;c.textBaseline='alphabetic';c.fillText(String(year),30,270);const d=c.getImageData(0,0,1200,340).data;let x0=1200,y0=340,x1=0,y1=0;for(let y=0;y<340;y++)for(let x=0;x<1200;x++)if(d[(y*1200+x)*4+3]>5){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}const out=createCanvas(w,h),ctx=out.getContext('2d');ctx.drawImage(base,x0,y0,x1-x0+1,y1-y0+1,0,0,w,h);
 if(color==='#bfbfbf')for(let i=0;i<4;i++){const digit=digitBank[String(year)[i]];if(!digit)continue;ctx.clearRect(i*w/4,0,w/4,h);ctx.drawImage(digit,0,0,digit.width,digit.height,i*w/4,0,w/4,h);}
 return out;}
(async()=>{
 const year=Number(process.argv[2]),folder=process.argv[3];if(!Number.isInteger(year)||year<2000||year>2099)throw Error('Ano inválido');
 // Reuse the exact original digit shapes when they exist in the retained artwork.
 for(const [file,text] of [['image10.png','2026'],['image12.png','2024'],['image16.png','2023']]){
  const source=path.join(folder,file);if(!fs.existsSync(source))continue;const image=await loadImage(source),canvas=createCanvas(image.width,image.height),c=canvas.getContext('2d');c.drawImage(image,0,0);const b=findGrayBox(c,image.width,image.height);
  for(let i=0;i<4;i++){if(digitBank[text[i]])continue;const digit=createCanvas(Math.ceil(b.w/4),b.h);digit.getContext('2d').drawImage(canvas,b.x+i*b.w/4,b.y,b.w/4,b.h,0,0,digit.width,digit.height);digitBank[text[i]]=digit;}
 }
 for(const file of fs.readdirSync(folder)){
  if(!/^image(?:5|6|10|11|12|13|14|16)\.png$/.test(file))continue;
  const target=path.join(folder,file),image=await loadImage(target),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  if(/^image(?:10|11|12|13|14|16)\.png$/.test(file)){
   const retainedYears={'image10.png':2026,'image11.png':2026,'image12.png':2024,'image13.png':2026,'image14.png':2026,'image16.png':2023};
   if(year===retainedYears[file])continue;
   const b=findGrayBox(ctx,image.width,image.height);if(b.w<=0||b.h<=0)throw Error('Arte sem região do ano: '+file);
   ctx.clearRect(b.x-1,b.y-1,b.w+2,b.h+2);ctx.drawImage(numberImage(year,b.w,b.h,'#bfbfbf'),b.x,b.y);
  }else if(file==='image5.png'){
   if(year===2026)continue;
   // Preserve the original SIMULADO letterforms; replace only each curved numeric band.
   const number=numberImage(year,271,65,'#bfbfbf');
   for(const start of [439,1155]){
    ctx.clearRect(start,0,272,image.height);
    for(let row=0;row<9;row++)for(let x=0;x<271;x++){
     const wave=12*Math.sin((x/716+439/716)*2*Math.PI);
     ctx.drawImage(number,x,0,1,65,start+x,row*76+18+wave,1,65);
    }
   }
  }else if(file==='image6.png'){
   // Alternate slanted wave in the retained template, originally labelled 2022.
   ctx.clearRect(0,0,image.width,image.height);ctx.translate(-10,-40);ctx.rotate(-12*Math.PI/180);ctx.fillStyle='#ffff99';
   for(let row=-1;row<9;row++)for(let col=-1;col<4;col++){
    const x=col*615,y=row*100;ctx.font='bold 62px GssfArialBold';ctx.fillText('SIMULADO',x,y);ctx.drawImage(numberImage(year,232,46,'#ffff99'),x+351,y-46);
   }
  }
  fs.writeFileSync(target,canvas.toBuffer('image/png'));
 }
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});
