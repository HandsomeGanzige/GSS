import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { SemanticAtomicCssWebpackPlugin } from '@semantic-atomic-css/webpack';
const root=path.dirname(fileURLToPath(import.meta.url));
const suite=process.env.GSS_FIXTURE_SUITE==='preprocessor'?'preprocessor':'base';
const semantic=process.env.GSS_FIXTURE_CSS_MODE!=='native';
const dev=process.env.GSS_FIXTURE_ACTION==='dev';
const suiteRoot=path.join(root,'suites',suite);
const out=process.env.GSS_FIXTURE_OUT_DIR??path.join(root,'dist',suite,semantic?'semantic':'native');
const owner=dev?await import('style-loader').then(()=> 'style-loader'):MiniCssExtractPlugin.loader;
const cssOptions={esModule:true,modules:{auto:/\.module\.(?:css|scss|less)$/,namedExport:false,exportLocalsConvention:'camel-case-only',localIdentName:'fixture_[name]__[local]'},url:{filter:(url)=>!url.startsWith('/')}};
export default {
 mode:dev?'development':'production',target:'web',context:root,entry:path.join(suiteRoot,'src/main.js'),
 output:{path:out,filename:'static/js/main.js',chunkFilename:'static/js/[name].js',publicPath:process.env.GSS_FIXTURE_PUBLIC_PATH??'/',clean:true},
 cache:{type:'filesystem',cacheDirectory:path.join(root,'.webpack-cache',suite,semantic?'semantic':'native',dev?'dev':'build'),version:[suite,semantic?'semantic':'native',dev?'dev':'build',process.env.GSS_FIXTURE_INLINE_ASSETS??'external',process.env.GSS_FIXTURE_PUBLIC_PATH??'/'].join('|')},
 module:{rules:[
  {test:/\.css$/,include:path.join(suiteRoot,'src'),use:[owner,{loader:'css-loader',options:cssOptions}]},
  {test:/\.scss$/,include:path.join(suiteRoot,'src'),use:[owner,{loader:'css-loader',options:cssOptions},{loader:'sass-loader',options:{additionalData:'$fixture-runtime-gap: 3px;\n'}}]},
  {test:/\.less$/,include:path.join(suiteRoot,'src'),use:[owner,{loader:'css-loader',options:cssOptions},{loader:'less-loader',options:{additionalData:'@fixture-runtime-radius: 9px;\n'}}]},
  {test:/\.svg$/,type:process.env.GSS_FIXTURE_INLINE_ASSETS==='true'?'asset/inline':'asset/resource'}
 ]},
 plugins:[
  new HtmlWebpackPlugin({template:path.join(suiteRoot,'index.html')}),
  ...(!dev?[new MiniCssExtractPlugin({filename:'static/css/native.css'})]:[]),
  ...(semantic?[new SemanticAtomicCssWebpackPlugin({core:{className:{strategy:'readable-keyed'}},manifest:{enabled:suite==='preprocessor'},report:{enabled:suite==='preprocessor'},devtools:{enabled:dev,pollIntervalMs:250}})]:[])
 ],
 devServer:{host:'127.0.0.1',port:Number(process.env.GSS_FIXTURE_PORT??5193),hot:true,liveReload:true,static:{directory:path.join(root,'public')},devMiddleware:{writeToDisk:false},client:{logging:'error'}}
};
