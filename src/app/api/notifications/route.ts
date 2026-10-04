import { NextRequest, NextResponse } from 'next/server';
import { listNotifications } from '@/lib/notifyClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const data = await listNotifications(page, pageSize);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error obteniendo listado de notificaciones:', error);
    return NextResponse.json(
      { error: 'Error consultando Notify API', details: error?.message },
      { status: 500 }
    );
  }
}
