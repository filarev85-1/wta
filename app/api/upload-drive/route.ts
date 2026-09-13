// app/api/upload-drive/route.ts
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '파일이 전달되지 않았습니다.' }, { status: 400 });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!email || !privateKey || !folderId) {
      return NextResponse.json({ error: '구글 서비스 계정 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const buffer = Buffer.from(await file.arrayBuffer());

    const driveRes = await drive.files.create({
      requestBody: {
        name: `wta_${Date.now()}_${file.name}`,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || 'image/jpeg',
        body: require('stream').Readable.from(buffer),
      },
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = driveRes.data.id;

    // 사진 누구나 볼 수 있도록 권한 부여
    if (fileId) {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    // 구글 드라이브 Direct 이미지 URL 생성
    const fileUrl = `https://lh3.googleusercontent.com/u/0/d/${fileId}`;

    return NextResponse.json({ success: true, fileUrl, fileId });
  } catch (err: any) {
    console.error('Drive upload error:', err);
    return NextResponse.json({ error: err.message || '업로드 실패' }, { status: 500 });
  }
}