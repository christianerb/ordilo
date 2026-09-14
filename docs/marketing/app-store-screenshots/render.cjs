const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const root = path.resolve(out, '../../..');
const fontConfig = path.join(os.tmpdir(), 'ordilo-store-fonts.conf');
fs.writeFileSync(fontConfig, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${root}/node_modules/@expo-google-fonts/figtree</dir><cachedir>${os.tmpdir()}/ordilo-fontcache</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontConfig;
const sharp = require('sharp');
const W=1260,H=2736;
const svg = s => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${s}</svg>`);
const text = (x,y,t,size=50,color='#305460',weight=600) => `<text x="${x}" y="${y}" font-family="Figtree" font-size="${size}" font-weight="${weight}" letter-spacing="-${size*.035}">${t}</text>`.replace('<text ',`<text fill="${color}" `);
const configs=[
 {name:'01-keine-suchmaschine',bg:'#305460',fg:'#FDFCFA',tag:'WENIGER PAPIERKRAM IM KOPF',lines:['Du bist Elternteil.','Keine','Suchmaschine.'],sub:['Fragen zum Familienpapierkram?','Frag Ordilo.'],asset:'native-answer.png',crop:{left:48,top:849,width:1083,height:1248},label:'Eine Frage. Die Antwort. Die Fundstelle.'},
 {name:'02-der-schulbrief',bg:'#EFE8DC',fg:'#262421',tag:'FÜR DIE ZETTEL DES FAMILIENLEBENS',lines:['Morgen Ausflug.','Was muss','noch mal mit?'],sub:['Der Brief weiß es.','Ordilo hilft dir beim Nachschauen.'],asset:'native-letter.png',crop:{left:48,top:849,width:1083,height:972},label:'Am Beispielbrief direkt ausprobieren.'},
 {name:'03-antwort-mit-fundstelle',bg:'#FDFCFA',fg:'#305460',tag:'ANTWORTEN MIT FUNDSTELLE',lines:['Ah, die','Regenjacke.','Kopf wieder frei.'],sub:['Die Antwort auf deine Frage.','Mit der passenden Stelle im Brief.'],asset:'native-answer.png',crop:{left:48,top:849,width:1083,height:1248},label:'Für heute genug im Kopf.'}
];
(async()=>{
const mark=await sharp(path.join(root,'docs/marketing/instagram-drafts/ordilo-original-mark.svg')).resize(84,84).png().toBuffer();
for(let i=0;i<configs.length;i++){
const c=configs[i];
let s=`<rect width="1260" height="2736" fill="${c.bg}"/>`;
s+=text(202,173,'Ordilo', 60,c.fg);
s+=text(106,308,c.tag,25,c.fg,500);
c.lines.forEach((t,j)=>s+=text(100,480+j*153,t,137,c.fg));
c.sub.forEach((t,j)=>s+=text(106,909+j*60,t,46,c.fg,400));
s+=`<rect x="72" y="1100" width="1116" height="1425" rx="58" fill="${i===0?'#23434D':i===1?'#DCD3C4':'#EFE8DC'}" transform="rotate(${i===1?-3:3} 630 1812)"/>`;
s+=text(106,2615,c.label,36,c.fg,500);
s+=text(106,2673,'Echtes App-Beispiel · Fiktiver Schulbrief',25,c.fg,400);
s+=text(1104,2673,`0${i+1}`,28,c.fg,500);
const crop=await sharp(path.join(root,'apps/video/public/campaign',c.asset)).extract(c.crop).resize(1056).png().toBuffer();
const meta=await sharp(crop).metadata();
const y=i===1?1260:1150;
await sharp(svg(s)).composite([{input:mark,left:100,top:104},{input:crop,left:102,top:y}]).flatten({background:c.bg}).removeAlpha().png().toFile(path.join(out,c.name+'.png'));
}
const thumbs=await Promise.all(configs.map(c=>sharp(path.join(out,c.name+'.png')).resize(378,821).toBuffer()));
await sharp({create:{width:1174,height:861,channels:3,background:'#E5E0D8'}}).composite(thumbs.map((input,i)=>({input,left:10+i*388,top:20}))).png().toFile(path.join(out,'preview.png'));
})();
