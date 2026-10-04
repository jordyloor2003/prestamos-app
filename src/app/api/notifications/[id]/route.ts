import { NextRequest, NextResponse } from 'next/server';
import { getNotificationDetail } from '@/lib/notifyClient';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'ID de notificación requerido' }, { status: 400 });
    }

    const data = await getNotificationDetail(id);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error consultando detalle de notificación:', error);
    return NextResponse.json(
      { error: 'Error consultando Notify API', details: error?.message },
      { status: 500 }
    );
  }
}
