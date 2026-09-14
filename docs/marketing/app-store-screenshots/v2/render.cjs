const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os');
const out=__dirname, root=path.resolve(out,'../../../..');
const fc=path.join(os.tmpdir(),'ordilo-store-fonts.conf'); fs.writeFileSync(fc,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${root}/node_modules/@expo-google-fonts/figtree</dir><cachedir>${os.tmpdir()}/ordilo-fontcache</cachedir></fontconfig>`); process.env.FONTCONFIG_FILE=fc;
const sharp=require('sharp'); const W=1260,H=2736;
const svg=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${s}</svg>`);
const text=(x,y,t,size,color,weight=600)=>`<text x="${x}" y="${y}" fill="${color}" font-family="Figtree" font-size="${size}" font-weight="${weight}" letter-spacing="-${size*.035}">${t}</text>`;
const shots=[
 {file:'01-scannen-v2',bg:'#305460',fg:'#FDFCFA',tag:'DEIN FAMILIENPAPIERKRAM. DIGITAL.',lines:['Papierkram','rein.','Kopf frei.'],sub:['Briefe scannen. Angaben prüfen.','Später einfach Ordilo fragen.'],source:path.join(out,'native-intake.png'),crop:{left:120,top:754,width:939,height:996},y:1120,width:1040,foot:'Ein guter Anfang für den nächsten Brief.',note:'Originalansicht aus der iPhone-App'},
 {file:'02-fragen-v2',bg:'#EFE8DC',fg:'#262421',tag:'DU BIST ELTERNTEIL. KEINE SUCHMASCHINE.',lines:['Morgen Ausflug.','Was muss','noch mal mit?'],sub:['Der Brief weiß es.','Frag Ordilo nach den wichtigen Infos.'],source:path.join(root,'apps/video/public/campaign/native-letter.png'),crop:{left:48,top:849,width:1083,height:972},y:1210,width:1080,foot:'Eine Frage reicht zum Nachschauen.',note:'Echtes App-Beispiel · Fiktiver Schulbrief'},
 {file:'03-fundstelle-v2',bg:'#FDFCFA',fg:'#305460',tag:'ANTWORTEN MIT FUNDSTELLE',lines:['Ah, die','Regenjacke.','Da steht’s.'],sub:['Die Antwort auf deine Frage.','Und die passende Stelle im Brief.'],source:path.join(root,'apps/video/public/campaign/native-answer.png'),crop:{left:48,top:849,width:1083,height:1248},y:1120,width:1080,foot:'Für heute genug im Kopf.',note:'Echtes App-Beispiel · Fiktiver Schulbrief'}
];
(async()=>{
 const mark=await sharp(path.join(root,'docs/marketing/instagram-drafts/ordilo-original-mark.svg')).resize(90,90).png().toBuffer();
 for(let i=0;i<shots.length;i++){
  const c=shots[i]; let s=`<rect width="1260" height="2736" fill="${c.bg}"/>`;
  s+=text(204,168,'Ordilo',60,c.fg)+text(102,294,c.tag,26,c.fg,500);
  c.lines.forEach((t,j)=>s+=text(96,480+j*155,t,i===0?165:137,c.fg));
  c.sub.forEach((t,j)=>s+=text(102,910+j*59,t,45,c.fg,400));
  s+=`<rect x="67" y="1080" width="1126" height="1375" rx="56" fill="${i===0?'#25454F':i===1?'#DBD2C3':'#EFE8DC'}" transform="rotate(${i===1?-3:3} 630 1760)"/>`;
  s+=text(102,2574,c.foot,37,c.fg,500)+text(102,2650,c.note,27,c.fg,400)+text(1108,2650,`0${i+1}`,29,c.fg,500);
  const crop=await sharp(c.source).extract(c.crop).resize(c.width).png().toBuffer(); const m=await sharp(crop).metadata();
  const mask=Buffer.from(`<svg width="${m.width}" height="${m.height}"><rect width="100%" height="100%" rx="35" fill="white"/></svg>`);
  const card=await sharp(crop).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  await sharp(svg(s)).composite([{input:mark,left:100,top:100},{input:card,left:Math.round((W-c.width)/2),top:c.y}]).flatten({background:c.bg}).removeAlpha().png().toFile(path.join(out,c.file+'.png'));
 }
 const thumbs=await Promise.all(shots.map(c=>sharp(path.join(out,c.file+'.png')).resize(378,821).toBuffer()));
 await sharp({create:{width:1174,height:861,channels:3,background:'#E5E0D8'}}).composite(thumbs.map((input,i)=>({input,left:10+i*388,top:20}))).png().toFile(path.join(out,'preview-v2.png'));
})();
