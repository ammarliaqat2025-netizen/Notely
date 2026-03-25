import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    // We add a 'User-Agent' header so websites don't block the request
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!res.ok) throw new Error('Site blocked request');

    const html = await res.text();

    const getMeta = (metaName: string) => {
      const reg = new RegExp(`<meta[^>]+(?:name|property)=["']${metaName}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(reg);
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Link Preview';
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    const domain = new URL(url).hostname.replace('www.', '');

    return NextResponse.json({ title, description, image, domain, url });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
