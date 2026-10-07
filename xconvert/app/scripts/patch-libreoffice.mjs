// Patches the pinned LibreOffice WebAssembly build so it fits xConvert's rules.
//
//   node scripts/patch-libreoffice.mjs <package dir> <out dir>
//
// Two files change, both JavaScript — the 147 MB WebAssembly module is not touched:
//
// 1. soffice.js (Emscripten's glue). Embind builds two families of call wrappers with
//    `new Function(…)`, which needs 'unsafe-eval' — and xConvert's CSP forbids it (rule 2).
//    Both become plain closures doing the same thing: what Emscripten itself generates with
//    -sDYNAMIC_EXECUTION=0. No document data was ever evaluated; the strings were templates.
//    And it starts eight threads up front rather than four, or Brave deadlocks, and reports a
//    pool that runs dry (see below).
//
// 2. browser.worker.global.js (the converter's worker, from @matbee/libreoffice-converter).
//    Cloudflare Pages refuses files over 25 MiB, and soffice.wasm and soffice.data are 147 and
//    100 MB. vendor.sh ships each gzipped and split into parts listed in <name>.parts.json; the
//    worker now streams the parts, inflates them, compiles the module and hands Emscripten the
//    result (instantiateWasm, getPreloadedPackage) instead of letting it fetch one big file.
//    That code is scripts/libreoffice-assemble.js; it also resumes a dropped part and reports
//    progress by the byte.
//
// Every replacement must match exactly once, or this fails: a new upstream version is reviewed,
// not patched blindly.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [pkg, out] = process.argv.slice(2);
if (!pkg || !out) {
  console.error('usage: node scripts/patch-libreoffice.mjs <package dir> <out dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

function swap(src, file, old, replacement) {
  const count = src.split(old).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one occurrence of ${JSON.stringify(old.slice(0, 70))}…, found ${count}`);
  return src.replace(old, () => replacement);
}

// --- 1. soffice.js: no 'unsafe-eval' --------------------------------------------------------
let glue = readFileSync(join(pkg, 'wasm/soffice.js'), 'utf8');

// craftInvokerFunction: the JavaScript wrapper around every bound C++ function and method.
glue = swap(glue, 'soffice.js',
  'let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);' +
    'args.push(invokerFnBody);var invokerFn=newFunc(Function,args)(...closureArgs);',
  'var invokerFn=function(...a){' +
    'checkArgCount(a.length,minArgs,expectedArgCount,humanName,throwBindingError);' +
    'var destructors=needsDestructorStack?[]:null;var wired=[cppTargetFunc];var thisWired;' +
    'if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);wired.push(thisWired)}' +
    'var argsWired=[];for(var i=0;i<expectedArgCount;++i){argsWired[i]=argTypes[i+2].toWireType(destructors,a[i]);wired.push(argsWired[i])}' +
    'var rv=cppInvokerFunc(...wired);' +
    'if(needsDestructorStack){runDestructors(destructors)}else{' +
    'for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){' +
    'argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}}' +
    'if(returns){return argTypes[0].fromWireType(rv)}};');

// __emval_get_method_caller: calls from C++ into JavaScript values.
const callerStart = 'var functionBody=`return function (obj, func, destructorsRef, args) {\\n`;';
const callerEnd = 'var invokerFunction=newFunc(Function,params)(...args);';
{
  const count = glue.split(callerStart).length - 1;
  if (count !== 1) throw new Error(`soffice.js: method caller not found exactly once (${count})`);
  const start = glue.indexOf(callerStart);
  const end = glue.indexOf(callerEnd, start) + callerEnd.length;
  glue =
    glue.slice(0, start) +
    'var invokerFunction=function(obj,func,destructorsRef,args){' +
    'var offset=0;var argv=kind===0?[obj]:[];' +
    'for(var i=0;i<argCount;++i){argv.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance}' +
    'var rv=kind===1?new func(...argv):func.call(...argv);' +
    'if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};' +
    glue.slice(end);
}
if (/newFunc\(Function/.test(glue)) throw new Error('soffice.js: a newFunc(Function, …) call is left');

// Threads, started before LibreOffice runs. Emscripten starts any further thread on demand, and
// that needs the thread asking for it to return to its event loop — which LibreOffice, blocked in
// lok_documentSaveAs, never does. Chrome sometimes copes; Brave deadlocks: a real document's PDF
// export sat at zero CPU for ten minutes. Measured: documents of every size peak at four or five
// threads, so eight is the default, and the page may ask for more (Module.xconvertThreads).
glue = swap(glue, 'soffice.js', 'var pthreadPoolSize=4;', 'var pthreadPoolSize=Module["xconvertThreads"]||8;');
// And the moment the pool runs dry — the one step before that deadlock — is said out loud, so the
// page can start again with twice the threads instead of waiting forever (src/lib/libreoffice.ts).
glue = swap(glue, 'soffice.js',
  'getNewWorker(){if(PThread.unusedWorkers.length==0){',
  'getNewWorker(){if(PThread.unusedWorkers.length==0){Module["xconvertPoolExhausted"]?.();');
writeFileSync(join(out, 'soffice.js'), glue);

// --- 2. the worker: assemble split, gzipped parts -------------------------------------------
let worker = readFileSync(join(pkg, 'dist/browser.worker.global.js'), 'utf8');
// The assembler is a file of its own, so it can be read in one sitting and tested
// (src/lib/libreoffice-assemble.test.ts).
const ASSEMBLE = readFileSync(new URL('./libreoffice-assemble.js', import.meta.url), 'utf8');
worker = ASSEMBLE + worker;
// The worker turns on every LibreOffice log category (SAL_LOG="+ALL") and prints it all to the
// console: thousands of lines a document, describing its contents, and real time spent. Errors
// only, which is LibreOffice's own default.
worker = swap(worker, 'browser.worker.global.js', 'a.ENV.SAL_LOG="+ALL"', 'a.ENV.SAL_LOG="-INFO-WARN"');
// In the init handler: t is the soffice.wasm URL, r the soffice.data URL, e soffice.js.
worker = swap(worker, 'browser.worker.global.js', 'importScripts(e),', 'await __xconvertAssemble(self.Module,t,r),importScripts(e),');
writeFileSync(join(out, 'libreoffice.worker.js'), worker);

console.log(`patched soffice.js and the worker into ${out}`);
