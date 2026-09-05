import { PDFParse } from 'pdf-parse'
import fs from 'fs'

async function main() {
  try {
    const buf = fs.readFileSync('/tmp/test.pdf')
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const result = await parser.getText()
    console.log('PDF OK | pages:', result.pages?.length ?? result.total ?? '?', '| keys:', Object.keys(result).join(','))
    const text = result.text
    console.log('text length:', text?.length)
    console.log('text sample:', text.replace(/\s+/g, ' ').slice(0, 200))
    const info = await parser.getInfo()
    console.log('meta title:', (info.info as { Title?: string })?.Title ?? '(none)')
    await parser.destroy()
  } catch (e) {
    console.error('PDF FAIL', e)
  }
}
main()
