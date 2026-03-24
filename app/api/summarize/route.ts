import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { title, body } = await request.json()

  if (!body?.trim()) {
    return NextResponse.json({ error: 'No content' }, { status: 400 })
  }

  try {
    const response = await fetch('https://api.groq.com/v1/generate', { // <-- correct endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // or another free model
        prompt: `Summarize this note in 2-3 clear sentences. Capture key points only. No preamble.\n\nTitle: ${title}\n\nContent:\n${body}`,
        max_output_tokens: 200 // Groq uses this instead of max_tokens
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Groq API error:', data)
      return NextResponse.json({ error: 'Groq API failed' }, { status: 500 })
    }

    const summary = data.output_text || 'Could not generate summary.'
    return NextResponse.json({ summary })
  } catch (err: any) {
    console.error('Server error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
