import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!email || !privateKey || !folderId) {
      return NextResponse.json({ error: '구글 드라이브 환경 변수 설정 누락' }, { status: 500 });
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.JWT(
      email,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });

    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    // 서비스 계정 용량 에러 방지 (공유 폴더 명시 및 옵션 처리)
    const response = await drive.files.create({
      requestBody: {
        name: `WTA_${Date.now()}_${file.name}`,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: bufferStream,
      },
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    const fileId = response.data.id;

    if (fileId) {
      // 파일 읽기 권한 설정
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      });

      // 이미지 직접 접근 가능한 URL
      const fileUrl = `https://drive.google.com/uc?id=${fileId}`;
      return NextResponse.json({ success: true, fileUrl, fileId });
    }

    return NextResponse.json({ error: '파일 ID 생성 실패' }, { status: 500 });

  } catch (err: any) {
    console.error('Drive upload error:', err);
    return NextResponse.json({ error: err.message || '업로드 중 오류 발생' }, { status: 500 });
  }
}