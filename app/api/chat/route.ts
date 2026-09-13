import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { message, isWarmup } = await req.json();

    if (isWarmup) {
      return NextResponse.json({ ok: true });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `너는 WTA 전용 여행 도우미 AI야. 경완님의 질문에 친절하고 명확하게 핵심만 답변해줘.\n\n질문: ${message}` }],
        },
      ],
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    
    // 429 한도 초과 오류 처리
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota exceeded')) {
      return NextResponse.json(
        { error: '⏳ 무료 사용 한도를 초과했습니다. 약 1~2분 정도 기다린 후 다시 질문해 주세요!' },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: '답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}