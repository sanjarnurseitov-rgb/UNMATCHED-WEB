import { NextResponse } from 'next/server';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadAppData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
