import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2); const action=args[0]??'build';
const read=(name,fallback)=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:fallback;};
const suites=read('suite','base')==='all'?['base','preprocessor']:[read('suite','base')];
const mode=read('mode','semantic');
for(const suite of suites){
 process.env.GSS_FIXTURE_SUITE=suite;process.env.GSS_FIXTURE_CSS_MODE=mode;process.env.GSS_FIXTURE_ACTION=action;
 const config=(await import(`${path.join(root,'webpack.config.mjs')}?t=${Date.now()}-${suite}`)).default;
 if(action==='dev'){
  const compiler=webpack(config);const server=new WebpackDevServer(compiler.options.devServer,compiler);await server.start();
  const address=server.server?.address();
  if(address&&typeof address==='object')process.stdout.write(`GSS_FIXTURE_URL=http://127.0.0.1:${address.port}\n`);
  continue;
 }
 await new Promise((resolve,reject)=>webpack(config,async(error,stats)=>{if(error||stats?.hasErrors()){reject(error??new Error(stats?.toString({all:false,errors:true,errorDetails:true})));return;}if(process.env.GSS_FIXTURE_STATS_FILE&&stats)await fs.writeFile(process.env.GSS_FIXTURE_STATS_FILE,JSON.stringify(stats.toJson({all:false,modules:true,cachedModules:true})));resolve();}));
 await fs.cp(path.join(root,'public'),config.output.path,{recursive:true});
}
