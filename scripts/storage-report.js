import fs from 'node:fs/promises';
import path from 'node:path';
async function size(dir){let bytes=0,files=0;for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory()){const sub=await size(full);bytes+=sub.bytes;files+=sub.files;}else{bytes+=(await fs.stat(full)).size;files++;}}return {bytes,files,GB:+(bytes/1e9).toFixed(3)};}
for(const directory of ['D:\\Harpsachord\\models','D:\\Harpsachord\\data','D:\\Harpsachord\\maestro-output'])console.log(JSON.stringify({directory,...await size(directory)}));
const disk=await fs.statfs('D:\\');console.log(JSON.stringify({drive:'D:',freeGB:+(disk.bavail*disk.bsize/1e9).toFixed(2)}));
