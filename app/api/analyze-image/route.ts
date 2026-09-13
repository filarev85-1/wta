import { google } from 'googleapis';
import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mode = (formData.get('mode') as string) || 'checklist';

    if (!file) {
      return NextResponse.json({ success: false, error: '업로드할 이미지가 선택되지 않았습니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let driveFileUrl = '';

    // 구글 드라이브 업로드 및 영구 접근 URL 생성
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      try {
        const driveRes = await drive.files.create({
          requestBody: {
            name: `WTA_${Date.now()}_${file.name}`,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          },
          media: {
            mimeType: file.type,
            body: require('stream').Readable.from(buffer),
          },
          fields: 'id, webViewLink, webContentLink',
        });

        const fileId = driveRes.data.id;
        if (fileId) {
          await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
          });
          driveFileUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        }
      } catch (driveErr) {
        console.error('Drive Upload Warning:', driveErr);
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Gemini API 키가 설정되어 있지 않습니다.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Image = buffer.toString('base64');

    // Mode별 분리 프롬프트 설정 (과해석 방지)
    const prompt = mode === 'checklist' 
      ? `이 이미지에서 보이는 대표 항목(상품, 음식, 식재료, 장비 등)만 정확히 1~2개로 지정해줘.
         보이지 않는 주변 용품(보조배터리 등)을 추측하거나 지어내지 마.
         
         카테고리 구분:
         - 음식, 밀키트, 식재료, 음료, 간식: "음식/식재료"
         - 아이 관련 용품: "아이용품"
         - 캠핑, 아웃도어 장비: "캠핑장비"
         - 의류, 세면도구: "의류/세면"
         - 그 외 상품/용품: "기타"

         응답 포맷 (JSON 전용): [{"category": "카테고리명", "title": "상품/음식/식재료명"}]`
      : `이 이미지에서 장소의 정확한 상호명(장소명)과 주요 특징만 추출해줘. 
         주소가 명확히 써있지 않다면 주소("address") 필드는 절대 추측하지 말고 빈 문자열("")로 남겨둬.
         
         응답 포맷 (JSON 전용): [{"name": "상호명", "address": "", "tip": "특징"}]`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          inlineData: {
            mimeType: file.type || 'image/jpeg',
            data: base64Image,
          },
        },
        prompt,
      ],
    });

    const rawText = response.text || '[]';
    const jsonString = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let extractedData = [];
    try {
      extractedData = JSON.parse(jsonString);
    } catch (e) {
      extractedData = [];
    }

    return NextResponse.json({
      success: true,
      fileUrl: driveFileUrl,
      extractedData,
    });
  } catch (error: any) {
    console.error('Analyze Image Server Error:', error);
    return NextResponse.json({ success: false, error: '이미지 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}