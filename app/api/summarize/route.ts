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
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // ✅ FIXED MODEL
        messages: [
          {
            role: 'user',
            content: `Summarize this note in 2-3 clear sentences. Capture key points only. No preamble.\n\nTitle: ${title}\n\nContent:\n${body}`
          }
        ],
        max_tokens: 200
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Groq error:', data)
      return NextResponse.json({ error: 'Groq API failed' }, { status: 500 })
    }

    const summary = data.choices?.[0]?.message?.content || 'Could not generate summary.'

    return NextResponse.json({ summary })

  } catch (err: any) {
    console.error('Server error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
