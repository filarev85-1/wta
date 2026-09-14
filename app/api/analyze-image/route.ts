import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let fileUrl = '';

    // 1. 구글 드라이브 업로드 시도 (Quota 에러 시 무시하고 진행)
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      if (email && privateKey && folderId) {
        privateKey = privateKey.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT({
          email: email,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });

        await auth.authorize();
        const drive = google.drive({ version: 'v3', auth });

        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const response = await drive.files.create({
          requestBody: {
            name: `WTA_${Date.now()}_${file.name}`,
            parents: [folderId],
          },
          media: {
            mimeType: file.type || 'image/jpeg',
            body: bufferStream,
          },
          fields: 'id, webViewLink, webContentLink',
          supportsAllDrives: true,
        });

        const fileId = response.data.id;
        if (fileId) {
          try {
            await drive.permissions.create({
              fileId: fileId,
              requestBody: { role: 'reader', type: 'anyone' },
              supportsAllDrives: true,
            });
          } catch (permErr) {
            console.error('Drive permission warning:', permErr);
          }
          fileUrl = `https://drive.google.com/uc?id=${fileId}`;
        }
      }
    } catch (driveErr) {
      console.error('Drive quota ignored for AI analysis');
    }

    // 2. Gemini AI 비전 시각 유추 분석 (글자가 없어도 음식/물건 자체를 인식)
    let extractedData: any[] = [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && (mode === 'checklist' || mode === 'place')) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const imagePart = {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: file.type || 'image/jpeg',
          },
        };

        if (mode === 'checklist') {
          const prompt = `이 이미지를 분석해줘. 
1. 글자/텍스트가 있다면 짐싸기 목록이나 장보기 항목을 추출해.
2. 만약 글자가 없는 음식, 물건, 장비 사진(예: 물회, 삼겹살, 버너 등)이라면 시각적으로 보이는 대상의 이름을 유추해서 체크리스트 품목으로 만들어.
카테고리는 무조건 [음식/식재료, 아이용품, 캠핑장비, 의류/세면, 중요사항, 기타] 중 하나로 지정해줘.
반드시 마크다운 글자 없이 아래 형태의 순수 JSON 배열만 반환해:
[{"category": "음식/식재료", "title": "물회"}]`;

          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const firstBracket = text.indexOf('[');
          const lastBracket = text.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket !== -1) {
            const jsonString = text.substring(firstBracket, lastBracket + 1);
            extractedData = JSON.parse(jsonString);
          }
        } else if (mode === 'place') {
          const prompt = `이 이미지를 분석해줘.
1. 지도/인스타그램/영수증 캡처라면 상호명(name), 주소(address), 팁(tip)을 추출해.
2. 만약 일반 장소/음식 사진이라면 시각적인 특징을 통해 예상 장소나 대표 메뉴명을 상호명으로 유추해.
반드시 마크다운 글자 없이 아래 형태의 순수 JSON 배열만 반환해:
[{"name": "속초 물회 맛집", "address": "강원 속초시", "tip": "시원한 물회 추천"}]`;

          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const firstBracket = text.indexOf('[');
          const lastBracket = text.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket !== -1) {
            const jsonString = text.substring(firstBracket, lastBracket + 1);
            extractedData = JSON.parse(jsonString);
          }
        }
      } catch (aiErr) {
        console.error('Gemini AI 분석 실패:', aiErr);
      }
    }

    return NextResponse.json({
      success: true,
      fileUrl,
      extractedData,
    });
  } catch (err: any) {
    console.error('API 에러:', err);
    return NextResponse.json({ error: err.message || '서버 오류 발생' }, { status: 500 });
  }
}