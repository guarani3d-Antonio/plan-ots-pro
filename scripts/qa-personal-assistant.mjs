// Local UI fixture. No authentication, provider requests or production writes.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const mock = `
const chain=new Proxy(function(){},{get(_t,key){if(key==='then')return resolve=>resolve({data:[],error:null,count:0});return (..._args)=>chain;},apply(){return chain;}});
export const supabase={from:()=>chain,rpc:async()=>({data:[],error:null}),channel:()=>chain,removeChannel:async()=>{},functions:{invoke:async()=>({data:{installed:false,ready:false,connected:false,models:[]},error:null})},auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
`;
const server = await createServer({ configFile:false, envPrefix:'ASSISTANT_QA_NO_ENV_', define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://qa.invalid')}, server:{host:'127.0.0.1',port:5173,strictPort:true}, plugins:[{name:'assistant-local-fixture',enforce:'pre',resolveId(id){if(/(?:^|\/)db\/supabase(?:\.ts)?$/.test(id))return '\0assistant-supabase-fixture';},load(id){if(id==='\0assistant-supabase-fixture')return mock;}},react()] });
await server.listen();
console.log(`http://127.0.0.1:${server.httpServer.address().port}/scripts/fixtures/assistant-ui-qa.html`);
