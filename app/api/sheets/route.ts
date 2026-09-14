import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

function getGoogleSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  
  const spreadsheetId = 
    process.env.GOOGLE_SPREADSHEET_ID || 
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || 
    process.env.SPREADSHEET_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_SPREADSHEET_ID;

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error('Google Sheets 환경 변수가 설정되지 않았습니다.');
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

    // 💡 생성하신 Checklist, Trips 탭 이름으로 명확하게 지정
    const range = dataType === 'trips' ? 'Trips!A1' : 'Checklist!A1';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rawData = response.data.values?.[0]?.[0];
    if (dataType === 'trips') {
      const trips = rawData ? JSON.parse(rawData) : [];
      return NextResponse.json({ trips });
    } else {
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
        range: 'Trips!A1',
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
        range: 'Checklist!A1',
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