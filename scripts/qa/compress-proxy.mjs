// Local measurement helper: sits in front of the locally built server and
// compresses responses the way the live host (Cloudflare) does, so a
// Lighthouse run on this machine is not dominated by uncompressed downloads.
//   node scripts/qa/compress-proxy.mjs [listenPort=4174] [targetPort=4173]
import http from "node:http";
import zlib from "node:zlib";

const [listenPort = "4174", targetPort = "4173"] = process.argv.slice(2);
const COMPRESSIBLE = /text\/|javascript|json|xml|svg|css/;

http
  .createServer((req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: Number(targetPort),
        path: req.url,
        method: req.method,
        headers: { ...req.headers, "accept-encoding": "identity" },
      },
      (up) => {
        const type = String(up.headers["content-type"] ?? "");
        const accepts = String(req.headers["accept-encoding"] ?? "");
        const headers = { ...up.headers };
        if (!COMPRESSIBLE.test(type) || up.headers["content-encoding"]) {
          res.writeHead(up.statusCode ?? 502, headers);
          up.pipe(res);
          return;
        }
        delete headers["content-length"];
        const brotli = accepts.includes("br");
        headers["content-encoding"] = brotli ? "br" : "gzip";
        headers.vary = "accept-encoding";
        res.writeHead(up.statusCode ?? 502, headers);
        const encoder = brotli
          ? zlib.createBrotliCompress({
              flush: zlib.constants.BROTLI_OPERATION_FLUSH,
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
            })
          : zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH });
        up.pipe(encoder).pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(Number(listenPort), "127.0.0.1");
