import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const res = await fetch(url);
    const html = await res.text();

    // Simple parsing for title and description
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) || 
                      html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
    
    const title = titleMatch ? titleMatch[1] : 'Link Preview';
    const description = descMatch ? descMatch[1] : '';

    return NextResponse.json({ title, description, url });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
