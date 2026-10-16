import {deflateSync} from 'node:zlib';
const crc=bytes=>{let c=0xffffffff;for(const x of bytes){c^=x;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
const chunk=(type,bytes)=>{const h=Buffer.alloc(4),t=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type),bytes]);h.writeUInt32BE(bytes.length);t.writeUInt32BE(crc(body));return Buffer.concat([h,body,t]);};
const h=Buffer.alloc(13);h.writeUInt32BE(96);h.writeUInt32BE(32,4);h[8]=8;h[9]=6;
const pixels=Buffer.alloc(32*(96*4+1));for(let y=0;y<32;y++)for(let x=0;x<96;x++){const p=y*(96*4+1)+1+x*4;pixels[p]=25;pixels[p+1]=45;pixels[p+2]=70;pixels[p+3]=Math.abs(y-(6+x%20))<2?255:0;}
export const signatureFixture='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
