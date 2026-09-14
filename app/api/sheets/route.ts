import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

function getGoogleSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  
  // Vercel 환경변수 체크 및 기본 시트 ID 폴백(Fallback) 적용
  const spreadsheetId = 
    process.env.GOOGLE_SPREADSHEET_ID || 
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 
    process.env.SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_SPREADSHEET_ID;

  if (!email || !privateKey) {
    throw new Error(`구글 서비스 계정 인증 정보가 부족합니다. (email: ${!!email}, key: ${!!privateKey})`);
  }

  if (!spreadsheetId) {
    throw new Error(`Google Sheets ID 환경 변수가 설정되지 않았습니다. Vercel에서 GOOGLE_SPREADSHEET_ID를 설정해주세요.`);
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId };
}

export async function GET(req: NextRequest) {
  try {
    const { sheets, spreadsheetId } = getGoogleSheetsClient();
    const url = new URL(req.url);
    const dataType = url.searchParams.get('type');

    if (dataType === 'trips') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!B1',
      });

      const rawData = response.data.values?.[0]?.[0];
      const trips = rawData ? JSON.parse(rawData) : [];
      return NextResponse.json({ trips });
    } else {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!A1',
      });

      const rawData = response.data.values?.[0]?.[0];
      const checklists = rawData ? JSON.parse(rawData) : [];
      return NextResponse.json({ checklists });
    }
  } catch (err: any) {
    console.error('Sheets GET 에러:', err);
    return NextResponse.json({ error: err.message || '시트 읽기 실패' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sheets, spreadsheetId } = getGoogleSheetsClient();
    const body = await req.json();

    if (body.type === 'trips') {
      const tripsJson = JSON.stringify(body.trips || []);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!B1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[tripsJson]],
        },
      });
      return NextResponse.json({ success: true, message: '여정 저장 완료' });
    } else {
      const checklistJson = JSON.stringify(body.checklists || []);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[checklistJson]],
        },
      });
      return NextResponse.json({ success: true, message: '체크리스트 저장 완료' });
    }
  } catch (err: any) {
    console.error('Sheets POST 에러:', err);
    return NextResponse.json({ error: err.message || '시트 저장 실패' }, { status: 500 });
  }
}