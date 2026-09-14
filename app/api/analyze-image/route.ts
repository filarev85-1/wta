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

    // 1. 구글 드라이브 업로드 시도
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      if (email && privateKey && folderId) {
        // 개행 문자 처리
        privateKey = privateKey.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT(
          email,
          undefined,
          privateKey,
          ['https://www.googleapis.com/auth/drive.file']
        );

        const drive = google.drive({ version: 'v3', auth });

        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);

        const response = await drive.files.create({
          requestBody: {
            name: `wta_${Date.now()}_${file.name}`,
            parents: [folderId],
          },
          media: {
            mimeType: file.type,
            body: bufferStream,
          },
          fields: 'id, webViewLink, webContentLink',
        });

        const fileId = response.data.id;
        if (fileId) {
          // 공개 권한 부여
          await drive.permissions.create({
            fileId: fileId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          });
          fileUrl = `https://drive.google.com/uc?id=${fileId}`;
        }
      }
    } catch (driveErr) {
      console.error('구글 드라이브 업로드 실패 (백업 모드 작동):', driveErr);
    }

    // 2. Gemini AI를 활용한 이미지 분석 (체크리스트 / 장소 카드 추출)
    let extractedData: any[] = [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const imagePart = {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: file.type,
          },
        };

        if (mode === 'checklist') {
          const prompt = `이 이미지에 있는 여행 준비물, 짐싸기 목록, 텍스트들을 추출해줘. JSON 배열 형태로 출력해줘. 예: [{"category": "음식/식재료", "title": "삼겹살"}, {"category": "캠핑장비", "title": "랜턴"}]`;
          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const cleanJson = text.replace(/```json|```/g, '').trim();
          extractedData = JSON.parse(cleanJson);
        } else if (mode === 'place') {
          const prompt = `이 이미지에 있는 여행 장소, 상호명, 주소, 팁 정보나 텍스트를 추출해줘. JSON 배열 형태로 출력해줘. 예: [{"name": "아침고요수목원", "address": "경기 가평군...", "tip": "유모차 추천"}]`;
          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const cleanJson = text.replace(/```json|```/g, '').trim();
          extractedData = JSON.parse(cleanJson);
        }
      } catch (aiErr) {
        console.error('Gemini AI 분석 에러:', aiErr);
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