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

    // 1. 구글 드라이브 업로드 시도 (Quota 없어도 예외 처리 후 AI 파싱으로 진행)
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
            console.error('Drive permission setting warning:', permErr);
          }
          fileUrl = `https://drive.google.com/uc?id=${fileId}`;
        }
      }
    } catch (driveErr) {
      console.error('Drive upload quota warning (Ignored for AI Analysis):', driveErr);
    }

    // 2. Gemini AI 분석 (모델 명칭: gemini-1.5-flash 표준 고정)
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
          const prompt = `이 이미지는 여행 짐싸기 목록, 장보기 영수증, 음식 또는 준비물 이미지야. 이미지에 보이는 텍스트, 물건, 음식 재료들을 모두 찾아내서 짐싸기 체크리스트 항목으로 변환해줘. 반드시 마크다운 글자 없이 아래 형태의 순수 JSON 배열만 반환해줘: [{"category": "음식/식재료", "title": "삼겹살"}, {"category": "캠핑장비", "title": "부탄가스"}]. 카테고리는 무조건 [음식/식재료, 아이용품, 캠핑장비, 의류/세면, 중요사항, 기타] 중 하나로 지정해줘.`;

          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const cleanText = text.replace(/```json|```/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          }
        } else if (mode === 'place') {
          const prompt = `이 이미지는 네이버지도, 인스타그램, 캡처 화면 또는 영수증 이미지야. 이미지에서 관광지/맛집/카페 상호명(name), 주소(address), 팁 정보(tip)를 최우선으로 유추해서 추출해줘. 반드시 마크다운 글자 없이 아래 형태의 순수 JSON 배열만 반환해줘: [{"name": "속초해수욕장", "address": "강원 속초시 조양동", "tip": "주차 가능"}].`;

          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const cleanText = text.replace(/```json|```/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
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