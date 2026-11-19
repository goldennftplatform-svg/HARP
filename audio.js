export function inspectWav(buffer){
  if(buffer.length<44||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE')return null;
  let format,data;
  for(let offset=12;offset+8<=buffer.length;){const id=buffer.toString('ascii',offset,offset+4),length=buffer.readUInt32LE(offset+4),start=offset+8;
    if(start+length>buffer.length)break;
    if(id==='fmt '&&length>=16)format={encoding:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),sampleRate:buffer.readUInt32LE(start+4),blockAlign:buffer.readUInt16LE(start+12),bits:buffer.readUInt16LE(start+14)};
    if(id==='data')data=length;
    offset=start+length+(length%2);
  }
  if(!format||!data||!format.sampleRate||!format.blockAlign)return null;
  return {...format,duration:data/format.blockAlign/format.sampleRate};
}
