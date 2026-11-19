import fs from 'node:fs/promises';
const target='D:\\Harpsachord\\maestro-output';
const link='C:\\pinokio\\api\\Maestro.git\\app\\outputs\\Harpsachord';
await fs.access('D:\\Harpsachord');
await fs.mkdir(target,{recursive:true});
try{
  const stat=await fs.lstat(link);
  if(!stat.isSymbolicLink()||(await fs.realpath(link)).toLowerCase()!==target.toLowerCase())throw Error('Output path already exists; refusing to replace it.');
}catch(e){if(e.code==='ENOENT')await fs.symlink(target,link,'junction');else throw e;}
console.log('Maestro Harpsachord workspace points to '+await fs.realpath(link));
