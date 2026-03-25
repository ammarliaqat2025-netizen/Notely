import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

    // Use a timeout and headers to prevent hanging
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36' },
      next: { revalidate: 3600 } 
    });

    const html = await res.text();

    const getMeta = (prop: string) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Link Preview';
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    const domain = new URL(url).hostname.replace('www.', '');

    return NextResponse.json({ title, description, image, domain, url });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
