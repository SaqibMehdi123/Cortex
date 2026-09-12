import ZAI from 'z-ai-web-dev-sdk'

const URLS = [
  'https://help.ticktick.com/articles/7055782025193586688', // Pomodoro help
  'https://blog.ticktick.com/2020/05/06/brand-new-focus-experience-ticktick/', // focus experience blog
]

async function main() {
  const zai = await ZAI.create()
  for (const url of URLS) {
    try {
      const res: any = await zai.functions.invoke('page_reader', { url })
      const html: string = res?.data?.html ?? ''
      const title = res?.data?.title ?? url
      // strip tags crudely
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
      console.log('='.repeat(80))
      console.log('TITLE:', title)
      console.log(text.slice(0, 5000))
    } catch (e: any) {
      console.error('FAILED', url, e?.message || e)
    }
  }
}

main()
