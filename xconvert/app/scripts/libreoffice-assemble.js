/* xConvert: soffice.wasm and soffice.data arrive gzipped, in parts under 25 MiB (rule 8).
 *
 * Prepended to the converter's worker by scripts/patch-libreoffice.mjs, and called from its
 * init handler in place of Emscripten's own fetch. A plain script, not a module: the worker is
 * a classic one. Tested by src/lib/libreoffice-assemble.test.ts.
 *
 * 77 MB over a slow line is minutes, so three things matter that do not on localhost:
 *   - progress is reported as the bytes arrive, across both files, not once per 20 MiB part;
 *   - a part whose connection drops is resumed where it stopped (Range), or fetched again and
 *     the bytes already in hand skipped, rather than failing the whole conversion;
 *   - a refusal (404, 403) is not retried: that is a broken deploy, not a bad connection.
 *
 * It also carries the thread count between the page and Emscripten. The page says how many
 * threads to start (`threads` on its init message, read here before the converter's own handler
 * sees it); the patched glue reads Module.xconvertThreads, and calls Module.xconvertPoolExhausted
 * when the pool runs dry, which goes back to the page once as { type: 'xconvert-threads-exhausted' }.
 */

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'init' && event.data.threads) self.__xconvertThreads = event.data.threads;
});

/** How long to wait before each retry of a part, in ms. Three retries, then it fails. */
var __xconvertRetryDelays = [1000, 3000, 9000];

/** One part's bytes, in order, surviving dropped connections. */
async function* __xconvertPart(url, delays) {
  var have = 0;
  for (var attempt = 0; ; attempt++) {
    try {
      var response = await fetch(url, have ? { headers: { Range: 'bytes=' + have + '-' } } : undefined);
      if (!response.ok) {
        var refused = new Error(response.status + ': ' + url);
        refused.status = response.status;
        throw refused;
      }
      // A server, or a cache, that ignores Range sends the whole part again: skip what is in hand.
      var skip = response.status === 206 ? 0 : have;
      var reader = response.body.getReader();
      for (;;) {
        var read = await reader.read();
        if (read.done) return;
        var chunk = read.value;
        if (skip) {
          if (chunk.length <= skip) {
            skip -= chunk.length;
            continue;
          }
          chunk = chunk.subarray(skip);
          skip = 0;
        }
        have += chunk.length;
        yield chunk;
      }
    } catch (error) {
      if ((error.status && error.status < 500) || attempt >= delays.length) throw error;
      await new Promise(function (resolve) {
        setTimeout(resolve, delays[attempt]);
      });
    }
  }
}

/** A manifest's parts as one inflated stream, telling `onBytes` about every gzipped byte. */
function __xconvertStream(dir, parts, onBytes, delays) {
  var next = 0;
  var current = null;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        if (!current) {
          if (next >= parts.length) return controller.close();
          current = __xconvertPart(dir + parts[next++], delays);
        }
        var step = await current.next();
        if (step.done) {
          current = null;
          continue;
        }
        onBytes(step.value.length);
        controller.enqueue(step.value);
        return;
      }
    },
  }).pipeThrough(new DecompressionStream('gzip'));
}

async function __xconvertManifest(url, delays) {
  var chunks = [];
  for await (var chunk of __xconvertPart(url + '.parts.json', delays)) chunks.push(chunk);
  return new Response(new Blob(chunks)).json();
}

/**
 * Downloads, inflates and compiles soffice.wasm, and downloads soffice.data, then hands both to
 * Emscripten. Progress goes to the page as { percent, message, loaded, total }, at most five
 * times a second.
 */
async function __xconvertAssemble(Module, wasmUrl, dataUrl, delays) {
  delays = delays || __xconvertRetryDelays;
  Module.xconvertThreads = self.__xconvertThreads || 8;
  var told = false;
  Module.xconvertPoolExhausted = function () {
    if (told) return;
    told = true;
    self.postMessage({ type: 'xconvert-threads-exhausted', threads: Module.xconvertThreads });
  };
  var dir = function (url) {
    return url.slice(0, url.lastIndexOf('/') + 1);
  };
  var manifests = await Promise.all([__xconvertManifest(wasmUrl, delays), __xconvertManifest(dataUrl, delays)]);
  var total = manifests[0].bytes + manifests[1].bytes;
  var loaded = 0;
  var said = 0;
  var onBytes = function (n) {
    loaded += n;
    var now = Date.now();
    if (now - said < 200 && loaded < total) return;
    said = now;
    self.postMessage({
      type: 'progress',
      progress: { percent: Math.floor((100 * loaded) / total), message: 'Downloading the layout converter, once', loaded: loaded, total: total },
    });
  };
  var wasm = await WebAssembly.compileStreaming(
    new Response(__xconvertStream(dir(wasmUrl), manifests[0].parts, onBytes, delays), { headers: { 'content-type': 'application/wasm' } }),
  );
  Module.instantiateWasm = function (imports, receive) {
    WebAssembly.instantiate(wasm, imports).then(function (instance) {
      receive(instance, wasm);
    });
    return {};
  };
  var data = await new Response(__xconvertStream(dir(dataUrl), manifests[1].parts, onBytes, delays)).arrayBuffer();
  Module.getPreloadedPackage = function () {
    return data;
  };
}
