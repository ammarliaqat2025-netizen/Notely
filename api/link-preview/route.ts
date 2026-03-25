import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  try {
    const res = await fetch(url) // ✅ built-in fetch
    const html = await res.text()

    const titleMatch = html.match(/<title>(.*?)<\/title>/i)
    const descMatch = html.match(
      /<meta name="description" content="(.*?)"/i
    )

    return NextResponse.json({
      title: titleMatch?.[1] || '',
      description: descMatch?.[1] || ''
    })

  } catch {
    return NextResponse.json({
      title: '',
      description: ''
    })
  }
}
