import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
for(const file of process.argv.slice(2)){
 try{await import(pathToFileURL(resolve(file)));}
 catch(e){console.error(JSON.stringify({check:file,message:e.message,code:e.code,where:e.where},null,2));process.exit(1);}
}
