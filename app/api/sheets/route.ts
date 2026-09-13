import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'checklists' 또는 'trips'

    if (type === 'trips') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Trips!A2:E',
      });
      const rows = response.data.values || [];
      const trips = rows.map((row, idx) => ({
        id: row[0] || `trip-${idx}`,
        title: row[1] || '',
        startDate: row[2] || '',
        endDate: row[3] || '',
        type: row[4] || '🏕️ 캠핑',
        places: row[5] ? JSON.parse(row[5]) : [],
      }));
      return NextResponse.json({ trips });
    }

    // 기본 체크리스트 GET
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Checklist!A2:C',
    });
    const rows = response.data.values || [];
    const checklists = rows.map((row, index) => ({
      id: index + 1,
      category: row[0] || '기타',
      title: row[1] || '',
      completed: row[2] === 'TRUE',
    }));

    return NextResponse.json({ checklists });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, checklists, trips } = await req.json();

    if (type === 'trips') {
      const values = trips.map((t: any) => [
        t.id,
        t.title,
        t.startDate,
        t.endDate,
        t.type,
        JSON.stringify(t.places || []),
      ]);

      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Trips!A2:F100',
      });

      if (values.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Trips!A2',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
      return NextResponse.json({ success: true });
    }

    // 체크리스트 POST
    const values = checklists.map((item: any) => [
      item.category,
      item.title,
      item.completed ? 'TRUE' : 'FALSE',
    ]);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Checklist!A2:C100',
    });

    if (values.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Checklist!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}