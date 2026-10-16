import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
// Original upstream 2.1.5 archive: https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz
const base=process.argv[2]??'tmp/liberation-fonts-ttf-2.1.5';
const regular=(await readFile(`${base}/LiberationSans-Regular.ttf`)).toString('base64');
const bold=(await readFile(`${base}/LiberationSans-Bold.ttf`)).toString('base64');
await writeFile('src/services/documentFonts.ts',`// Unmodified Liberation Sans, SIL Open Font License 1.1. See public/licenses/LiberationSans.txt.\nexport const documentFontRegular=${JSON.stringify(regular)};\nexport const documentFontBold=${JSON.stringify(bold)};\n`);
await mkdir('public/licenses',{recursive:true});await copyFile(`${base}/LICENSE`,'public/licenses/LiberationSans.txt');
console.log('Fuentes Unicode autocontenidas y licencia conservada.');
