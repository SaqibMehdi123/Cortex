// Quick outbound connectivity probe: can we reach SMTP ports / HTTPS APIs?
import net from 'node:net'
import tls from 'node:tls'

const probe = (host, port, timeout = 6000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => {
      sock.destroy()
      resolve(`${host}:${port} TIMEOUT`)
    }, timeout)
    const sock = net.connect({ host, port })
    sock.once('connect', () => {
      clearTimeout(t)
      sock.destroy()
      resolve(`${host}:${port} OPEN`)
    })
    sock.once('error', (e) => {
      clearTimeout(t)
      resolve(`${host}:${port} ${e.code || 'ERR'}`)
    })
  })

const httpsProbe = (host, timeout = 6000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => {
      req.destroy()
      resolve(`${host} HTTPS TIMEOUT`)
    }, timeout)
    const req = https.request({ host, port: 443, method: 'HEAD', path: '/', timeout })
    req.on('response', (r) => {
      clearTimeout(t)
      resolve(`${host} HTTPS ${r.statusCode}`)
      r.resume()
    })
    req.on('timeout', () => {
      clearTimeout(t)
      req.destroy()
      resolve(`${host} HTTPS TIMEOUT`)
    })
    req.on('error', (e) => {
      clearTimeout(t)
      resolve(`${host} HTTPS ${e.code || 'ERR'}`)
    })
    req.end()
  })

import https from 'node:https'
const results = await Promise.all([
  probe('smtp.gmail.com', 587),
  probe('smtp.gmail.com', 465),
  httpsProbe('api.brevo.com'),
])
console.log(results.join('\n'))
process.exit(0)
