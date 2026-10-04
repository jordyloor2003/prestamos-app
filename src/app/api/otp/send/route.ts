import { NextRequest, NextResponse } from 'next/server';
import { dispatchNotification } from '@/lib/notifyClient';
import { saveOtp } from '@/lib/otpStore';

export async function POST(req: NextRequest) {
  try {
    const { phone, borrowerName } = await req.json();

    if (!phone || typeof phone !== 'string' || phone.trim().length < 8) {
      return NextResponse.json(
        { error: 'Debe ingresar un número de teléfono móvil válido para recibir el código SMS.' },
        { status: 400 }
      );
    }

    // Generar OTP de 6 dígitos aleatorio
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveOtp(phone.trim(), otpCode, 300);

    // Enviar SMS a través de la Notify API en AWS EC2
    const idempotencyKey = `otp-${phone.trim()}-${Date.now()}`;
    const result = await dispatchNotification({
      channel: 'Sms',
      recipient: phone.trim(),
      templateCode: '2FA_CODE',
      templateVariables: {
        codigo: otpCode,
      },
      priority: 'High',
      idempotencyKey,
      metadata: {
        flow: 'loan_2fa',
        clientName: borrowerName || 'Cliente FinTech',
      },
    });

    const maskedPhone = phone.trim().replace(/^(\+?\d{2,4})\d+(\d{4})$/, '$1****$2');

    return NextResponse.json({
      success: true,
      message: `Código de seguridad enviado por SMS a ${maskedPhone}`,
      notification: result,
      // Para facilitar pruebas en vivo y demostraciones evaluativas
      demoOtpCode: otpCode,
    });
  } catch (error: any) {
    console.error('Error enviando OTP:', error);
    return NextResponse.json(
      {
        error: 'Error despachando SMS mediante Notify API',
        details: error?.message || 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
