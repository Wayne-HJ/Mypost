import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// 自包含 PNG 生成器：从品牌标记的简单矢量路径生成安装包图标。
const size = 512;
const raw = Buffer.alloc((size * 4 + 1) * size);
const segments = [[17,43,17,22], [17,22,32,34], [32,34,47,22], [47,22,47,43]];
function distance(x, y, [a,b,c,d]) {
  const t = Math.max(0, Math.min(1, ((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));
  return Math.hypot(x-a-t*(c-a), y-b-t*(d-b));
}
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let red=0, green=0, blue=0, alpha=0;
    for (let sy=0;sy<2;sy++) for(let sx=0;sx<2;sx++) {
      const px=(x+(sx+.5)/2)/size*64, py=(y+(sy+.5)/2)/size*64;
      const cx=Math.max(18,Math.min(46,px)),cy=Math.max(18,Math.min(46,py));
      if (Math.hypot(px-cx,py-cy)>18) continue;
      const white=segments.some(segment=>distance(px,py,segment)<=2.5);
      red+=white?255:223;green+=white?255:103;blue+=white?255:62;alpha++;
    }
    const index=y*(size*4+1)+1+x*4;
    raw[index]=alpha?red/alpha:0;raw[index+1]=alpha?green/alpha:0;raw[index+2]=alpha?blue/alpha:0;raw[index+3]=alpha/4*255;
  }
}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data){const name=Buffer.from(type);const result=Buffer.alloc(12+data.length);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);let crc=0xffffffff;for(const byte of Buffer.concat([name,data]))crc=table[(crc^byte)&255]^(crc>>>8);result.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length);return result;}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
await mkdir('build',{recursive:true});
await writeFile('build/icon.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
console.log('Generated build/icon.png (512×512)');
