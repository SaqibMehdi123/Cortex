// Vendored pdf.js worker — the EXACT version bundled inside pdf-parse
// (pdfjs-dist 5.4.296, legacy build, minified). Worker and API are
// version-checked against each other, so this copy must be updated whenever
// pdf-parse is.
//
// Why vendored: in Node, pdf.js runs a "fake worker" by importing
// GlobalWorkerOptions.workerSrc — a COMPUTED "./pdf.worker.mjs" path that
// Vercel's serverless module tracer never packs into the lambda, so text
// extraction died there with "Cannot find module .../pdf.worker.mjs"
// (root-caused live via /api/ops/url-import-probe). Importing the worker
// HERE, with a static relative specifier, bundles it with OUR code — always
// present, nothing to trace. On import it registers itself as
// globalThis.pdfjsWorker, which pdf.js checks before touching workerSrc.
