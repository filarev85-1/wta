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

    // 1. 구글 드라이브(WTA_Captures)에 사진 직접 저장
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      if (email && privateKey && folderId) {
        privateKey = privateKey.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT(
          email,
          undefined,
          privateKey,
          ['https://www.googleapis.com/auth/drive']
        );

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
          await drive.permissions.create({
            fileId: fileId,
            requestBody: { role: 'reader', type: 'anyone' },
            supportsAllDrives: true,
          });
          fileUrl = `https://drive.google.com/uc?id=${fileId}`;
        }
      }
    } catch (driveErr) {
      console.error('Drive upload error:', driveErr);
    }

    // 2. Gemini AI 스마트 파싱 (mode가 분석용일 경우)
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
          const prompt = `이 이미지에 있는 여행 준비물, 장보기 항목, 음식 식재료를 추출해줘. 
반드시 다른 설명 없이 JSON 배열 구조로만 작성해줘. 예시: [{"category": "음식/식재료", "title": "삼겹살"}]`;
          const result = await model.generateContent([prompt, imagePart]);
          const text = result.response.text();
          const cleanText = text.replace(/```json|```/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          }
        } else if (mode === 'place') {
          const prompt = `이 이미지에 있는 관광지나 맛집/카페 상호명(name), 주소(address), 팁(tip)을 추출해줘.
반드시 다른 설명 없이 JSON 배열 구조로만 작성해줘. 예시: [{"name": "속초해수욕장", "address": "강원 속초시 조양동", "tip": "주차 가능"}]`;
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