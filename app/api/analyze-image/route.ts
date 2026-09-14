import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // 1. ImgBB API 연동 (추억, 프로필, 로그인 배경 등 초고속 업로드 전용)
    const imgbbApiKey = process.env.IMGBB_API_KEY;

    if (imgbbApiKey) {
      try {
        const base64Image = buffer.toString('base64');
        const imgbbFormData = new FormData();
        imgbbFormData.append('image', base64Image);

        const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
          method: 'POST',
          body: imgbbFormData,
        });

        const imgbbData = await imgbbRes.json();
        if (imgbbData.success && imgbbData.data?.url) {
          fileUrl = imgbbData.data.url;
        }
      } catch (imgbbErr: any) {
        console.error('ImgBB API 업로드 오류:', imgbbErr?.message || imgbbErr);
      }
    }

    // 2. 구글 드라이브 백업 업로드 (ImgBB 실패 시 예외 백업용)
    if (!fileUrl) {
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
            supportsTeamDrives: true,
          });

          const fileId = response.data?.id;
          if (fileId) {
            try {
              await drive.permissions.create({
                fileId: fileId,
                requestBody: { role: 'reader', type: 'anyone' },
                supportsAllDrives: true,
              });
            } catch (permErr: any) {
              console.error('Drive permission warning:', permErr?.message || permErr);
            }
            fileUrl = `https://drive.google.com/uc?id=${fileId}`;
          }
        }
      } catch (driveErr: any) {
        console.error('Drive upload warning:', driveErr?.message || driveErr);
      }
    }

    // 3. Gemini AI 분석 (여정 상세 카드 'place' 모드 전용)
    let extractedData: any[] = [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && mode === 'place') {
      const genAI = new GoogleGenerativeAI(apiKey);

      const imagePart = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: file.type || 'image/jpeg',
        },
      };

      const prompt = `이 이미지를 분석해줘.
1. 지도/인스타그램/영수증 캡처라면 상호명(name), 주소(address), 팁(tip)을 추출해.
2. 만약 일반 장소/음식 사진이라면 시각적인 특징을 통해 예상 장소나 대표 메뉴명을 상호명으로 유추해.
반드시 마크다운 글자 없이 아래 형태의 순수 JSON 배열만 반환해:
[{"name": "속초 물회 맛집", "address": "강원 속초시", "tip": "시원한 물회 추천"}]`;

      const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

      const fetchAIWithRetry = async (retryCount = 0): Promise<string> => {
        try {
          const result = await model.generateContent([prompt, imagePart]);
          return result.response.text();
        } catch (err: any) {
          if (err?.status === 429 && retryCount < 2) {
            const waitTime = (retryCount + 1) * 2000;
            await delay(waitTime);
            return fetchAIWithRetry(retryCount + 1);
          }
          throw err;
        }
      };

      try {
        const aiResponseText = await fetchAIWithRetry();
        if (aiResponseText) {
          const firstBracket = aiResponseText.indexOf('[');
          const lastBracket = aiResponseText.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket !== -1) {
            const jsonString = aiResponseText.substring(firstBracket, lastBracket + 1);
            extractedData = JSON.parse(jsonString);
          }
        }
      } catch (aiErr: any) {
        console.error('Gemini API 분석 오류:', aiErr?.message || aiErr);
      }
    }

    return NextResponse.json({
      success: true,
      fileUrl,
      extractedData,
    });
  } catch (err: any) {
    console.error('API 에러:', err?.message || err);
    return NextResponse.json({ error: err.message || '서버 오류 발생' }, { status: 500 });
  }
}