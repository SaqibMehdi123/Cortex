// Proves the upload-url fix: handleUpload must receive a PARSED event object.
// 1) OLD behaviour (stream body)  → expected: BlobError "Invalid event type"
// 2) NEW behaviour (parsed body)  → expected: { type, clientToken }
// Uses a dummy read-write token: client-token generation is local HMAC
// signing and never talks to the Blob service.
process.env.BLOB_READ_WRITE_TOKEN = 'dummy_local_test_token'

const { handleUpload } = await import('@vercel/blob/client')

const event = {
  type: 'blob.generate-client-token',
  payload: { pathname: 'SEECS_Semester_Planner.pdf', clientPayload: undefined, multipart: false },
}

const makeRequest = () =>
  new Request('https://cortex-sync.vercel.app/api/documents/upload-url', {
    method: 'POST',
    body: JSON.stringify(event),
    headers: { 'content-type': 'application/json' },
  })

const onBeforeGenerateToken = async () => ({
  allowedContentTypes: ['application/pdf'],
  maximumSizeInBytes: 200 * 1024 * 1024,
  addRandomSuffix: true,
  tokenPayload: JSON.stringify({ userId: 'test-user' }),
})

// 1) The old, broken call shape
try {
  await handleUpload({ body: makeRequest().body, request: makeRequest(), onBeforeGenerateToken })
  console.log('OLD SHAPE: unexpectedly succeeded (fix unnecessary?)')
} catch (e) {
  console.log('OLD SHAPE: threw as predicted →', JSON.stringify(e.message))
}

// 2) The fixed call shape
try {
  const res = await handleUpload({ body: event, request: makeRequest(), onBeforeGenerateToken })
  console.log('NEW SHAPE: OK →', res.type, '| clientToken is', typeof res.clientToken, `(${res.clientToken.length} chars)`)
} catch (e) {
  console.log('NEW SHAPE: FAILED →', JSON.stringify(e.message))
  process.exit(1)
}
