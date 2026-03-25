import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    const res = await fetch(url);
    const html = await res.text();

    const getMeta = (metaName: string) => {
      const reg = new RegExp(`<meta[^>]+(?:name|property)=["']${metaName}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(reg);
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || 'Link';
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    const domain = new URL(url).hostname.replace('www.', '');

    return NextResponse.json({ title, description, image, domain, url });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
