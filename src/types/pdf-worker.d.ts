// The vendored pdf.js worker (src/lib/pdf-worker/pdf.worker.min.mjs) is a
// pre-built ESM bundle without type declarations. It registers
// globalThis.pdfjsWorker and exports WorkerMessageHandler — nothing else in
// it is consumed by our code.
declare module '*pdf.worker.min.mjs' {
  const WorkerMessageHandler: unknown
  export { WorkerMessageHandler }
}
