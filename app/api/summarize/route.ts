import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { title, body } = await request.json()
  if (!body?.trim()) {
    return NextResponse.json({ error: 'No content' }, { status: 400 })
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY!}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instruct',
        
        messages: [
          {
            role: 'user',
            content: `Summarize this note in 2-3 clear sentences. Capture key points only. No preamble, just the summary.\n\nTitle: ${title}\n\nContent:\n${body}`
          }
        ],
        max_tokens: 300
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json({ error: `Groq error: ${errText}` }, { status: response.status })
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content || 'Could not generate summary.'
    return NextResponse.json({ summary })
  } catch (err: any) {
    return NextResponse.json({ error: `Request failed: ${err.message}` }, { status: 500 })
  }
}
