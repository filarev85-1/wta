import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || !query.trim()) {
      return NextResponse.json({ success: false, message: '검색어를 입력해 주세요.' });
    }

    const cleanQuery = query.replace(/[^\w\s가-힣]/g, '').trim();
    const fallbackUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(cleanQuery)}`;

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({
        success: true,
        title: cleanQuery,
        address: '',
        mapUrl: fallbackUrl,
      });
    }

    const response = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(cleanQuery)}&display=1`,
      {
        headers: {
          'X-Naver-Client-Id': clientId.trim(),
          'X-Naver-Client-Secret': clientSecret.trim(),
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        title: cleanQuery,
        address: '',
        mapUrl: fallbackUrl,
      });
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const cleanTitle = item.title.replace(/<[^>]*>?/g, '');
      const cleanAddress = item.roadAddress || item.address || '';
      const mapUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(cleanAddress || cleanTitle)}`;

      return NextResponse.json({
        success: true,
        title: cleanTitle,
        address: cleanAddress,
        mapUrl: mapUrl,
      });
    }

    return NextResponse.json({
      success: true,
      title: cleanQuery,
      address: '',
      mapUrl: fallbackUrl,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: true,
      title: '검색 장소',
      address: '',
      mapUrl: 'https://m.map.naver.com',
    });
  }
}