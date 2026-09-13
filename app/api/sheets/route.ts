// app/api/sheets/route.ts
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

function getGoogleSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error('Google Service Account environment variables are missing');
  }

  privateKey = privateKey.replace(/\\n/g, '\n');
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

export async function GET(req: Request) {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'trips') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Trips!A2:G100',
      });

      const rows = response.data.values || [];
      const trips = rows.map((row) => {
        let parsedPlaces = [];
        if (row[5]) {
          try {
            parsedPlaces = typeof row[5] === 'string' ? JSON.parse(row[5]) : row[5];
          } catch (e) {
            console.error('places JSON parse error:', e);
            parsedPlaces = [];
          }
        }
        return {
          id: row[0] || '',
          title: row[1] || '',
          startDate: row[2] || '',
          endDate: row[3] || '',
          type: row[4] || '🏕️ 캠핑',
          places: Array.isArray(parsedPlaces) ? parsedPlaces : [],
          review: row[6] || '',
        };
      });

      return NextResponse.json({ trips });
    } else {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Checklist!A2:F100',
      });

      const rows = response.data.values || [];
      const checklists = rows.map((row) => ({
        id: Number(row[0]),
        tripId: row[1] || undefined,
        category: row[2] || '음식/식재료',
        title: row[3] || '',
        completed: row[4] === 'TRUE' || row[4] === 'true',
        imageUrl: row[5] || undefined,
      }));

      return NextResponse.json({ checklists });
    }
  } catch (err: any) {
    console.error('Sheets GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const body = await req.json();

    if (body.type === 'trips') {
      const trips = body.trips || [];
      const rows = trips.map((t: any) => [
        t.id,
        t.title,
        t.startDate,
        t.endDate,
        t.type,
        JSON.stringify(t.places || []),
        t.review || '',
      ]);

      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Trips!A2:G100',
      });

      if (rows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Trips!A2',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows },
        });
      }

      return NextResponse.json({ success: true, count: rows.length });
    } else {
      const checklists = body.checklists || [];
      const rows = checklists.map((c: any) => [
        c.id,
        c.tripId || '',
        c.category || '기타',
        c.title,
        c.completed ? 'TRUE' : 'FALSE',
        c.imageUrl || '',
      ]);

      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Checklist!A2:F100',
      });

      if (rows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Checklist!A2',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows },
        });
      }

      return NextResponse.json({ success: true, count: rows.length });
    }
  } catch (err: any) {
    console.error('Sheets POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}