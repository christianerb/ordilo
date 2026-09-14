const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os');
const out=__dirname, root=path.resolve(out,'../../../..');
const fc=path.join(os.tmpdir(),'ordilo-store-fonts.conf'); fs.writeFileSync(fc,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${root}/node_modules/@expo-google-fonts/figtree</dir><cachedir>${os.tmpdir()}/ordilo-fontcache</cachedir></fontconfig>`); process.env.FONTCONFIG_FILE=fc;
const sharp=require('sharp'); const W=1260,H=2736;
const svg=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${s}</svg>`);
const text=(x,y,t,size,color,weight=600)=>`<text x="${x}" y="${y}" fill="${color}" font-family="Figtree" font-size="${size}" font-weight="${weight}" letter-spacing="-${size*.035}">${t}</text>`;
const shots=[
 {file:'04-angaben-v3',bg:'#EFE8DC',fg:'#262421',tag:'DAS WICHTIGE AUF EINEN BLICK',lines:['Wann? Wo?','Steht schon','bereit.'],sub:['Ordilo erkennt wichtige Angaben.','Du prüfst, ob alles stimmt.'],source:path.join(out,'native-details.png'),crop:{left:48,top:480,width:1083,height:1060},y:1190,width:1080,foot:'Weniger lesen. Mehr Überblick.',note:'Originalansicht · Fiktive Beispieldaten'},
 {file:'05-ablage-v3',bg:'#FDFCFA',fg:'#305460',tag:'AUCH NOTIZEN HABEN IHREN PLATZ',lines:['Alles zu Emma.','Schneller','gefunden.'],sub:['Unterlagen, Notizen und Kontakte.','In eurer gemeinsamen Ablage.'],source:path.join(out,'native-notes.png'),crop:{left:48,top:466,width:1083,height:1360},y:1120,width:1080,foot:'Für das, was ihr wieder braucht.',note:'Originalansicht · Fiktive Beispieldaten'},
 {file:'06-familienplan-v3',bg:'#305460',fg:'#FDFCFA',tag:'EIN PLAN. FÜR EUCH ALLE.',lines:['Nicht alles','muss an dir','hängen.'],sub:['Aufgaben zuordnen. Termine im Blick.','Gemeinsam den Alltag organisieren.'],source:path.join(out,'native-plan.png'),crop:{left:48,top:466,width:1083,height:1620},y:1100,width:900,foot:'Zusammen daran denken.',note:'Originalansicht · Fiktive Beispieldaten'}
];
(async()=>{
 const mark=await sharp(path.join(root,'docs/marketing/instagram-drafts/ordilo-original-mark.svg')).resize(90,90).png().toBuffer();
 for(let i=0;i<shots.length;i++){
  const c=shots[i]; let s=`<rect width="1260" height="2736" fill="${c.bg}"/>`;
  s+=text(204,168,'Ordilo',60,c.fg)+text(102,294,c.tag,26,c.fg,500);
  c.lines.forEach((t,j)=>s+=text(96,480+j*155,t,137,c.fg));
  c.sub.forEach((t,j)=>s+=text(102,910+j*59,t,45,c.fg,400));
  s+=`<rect x="67" y="1080" width="1126" height="1375" rx="56" fill="${i===2?'#25454F':i===0?'#DBD2C3':'#EFE8DC'}" transform="rotate(${i===1?-3:3} 630 1760)"/>`;
  s+=text(102,2574,c.foot,37,c.fg,500)+text(102,2650,c.note,27,c.fg,400)+text(1108,2650,`0${i+4}`,29,c.fg,500);
  const crop=await sharp(c.source).extract(c.crop).resize(c.width).png().toBuffer(); const m=await sharp(crop).metadata();
  const mask=Buffer.from(`<svg width="${m.width}" height="${m.height}"><rect width="100%" height="100%" rx="35" fill="white"/></svg>`);
  const card=await sharp(crop).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  await sharp(svg(s)).composite([{input:mark,left:100,top:100},{input:card,left:Math.round((W-c.width)/2),top:c.y}]).flatten({background:c.bg}).removeAlpha().png().toFile(path.join(out,c.file+'.png'));
 }
 const thumbs=await Promise.all(shots.map(c=>sharp(path.join(out,c.file+'.png')).resize(378,821).toBuffer()));
 await sharp({create:{width:1174,height:861,channels:3,background:'#E5E0D8'}}).composite(thumbs.map((input,i)=>({input,left:10+i*388,top:20}))).png().toFile(path.join(out,'preview-v3.png'));
})();
