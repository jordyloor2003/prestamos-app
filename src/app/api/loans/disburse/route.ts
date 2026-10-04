import { NextRequest, NextResponse } from 'next/server';
import { dispatchNotification } from '@/lib/notifyClient';
import { verifyOtp } from '@/lib/otpStore';

export async function POST(req: NextRequest) {
  try {
    const {
      loanId,
      borrowerName,
      identification,
      email,
      phone,
      amount,
      months,
      monthlyQuota,
      bankAccount,
      bankName,
      otp,
      forceDuplicateDemo,
    } = await req.json();

    if (!loanId || !email || !amount || !borrowerName) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios para procesar el desembolso.' },
        { status: 400 }
      );
    }

    // Si NO es una simulación de idempotencia duplicada, verificar el OTP ingresado
    if (!forceDuplicateDemo) {
      if (!otp) {
        return NextResponse.json(
          { error: 'Debe ingresar el código OTP de 6 dígitos enviado a su teléfono.' },
          { status: 400 }
        );
      }

      const otpResult = verifyOtp(phone, otp);
      if (!otpResult.valid) {
        return NextResponse.json({ error: otpResult.message }, { status: 400 });
      }
    }

    // Llave de Idempotencia estricta por número de desembolso
    const idempotencyKey = `loan-disburse-${loanId}`;

    const emailHtmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">BancoFuturo / PrestaYa - Comprobante de Desembolso</h2>
        <p>Estimado/a <strong>${borrowerName}</strong>,</p>
        <p>Nos complace informarle que su solicitud de crédito ha sido <strong>aprobada y transferida exitosamente</strong> a su cuenta bancaria de destino.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #065f46;">Detalle de la Operación Financiera</h3>
          <p style="margin: 4px 0;"><strong>N° de Préstamo:</strong> ${loanId}</p>
          <p style="margin: 4px 0;"><strong>Monto Transferido:</strong> $${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</p>
          <p style="margin: 4px 0;"><strong>Plazo Acordado:</strong> ${months} meses</p>
          <p style="margin: 4px 0;"><strong>Cuota Mensual Fija:</strong> $${Number(monthlyQuota).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</p>
          <p style="margin: 4px 0;"><strong>Tasa de Interés Nominal:</strong> 9.5% Anual</p>
          <p style="margin: 4px 0;"><strong>Banco Destino:</strong> ${bankName || 'Banco Pichincha'}</p>
          <p style="margin: 4px 0;"><strong>Cuenta Destino:</strong> ${bankAccount}</p>
          <p style="margin: 4px 0;"><strong>Identificación:</strong> ${identification}</p>
          <p style="margin: 4px 0;"><strong>Fecha y Hora:</strong> ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>
        </div>

        <p style="font-size: 13px; color: #64748b;">Este comprobante fue emitido automáticamente y certificado por el motor de notificaciones transaccionales de alta disponibilidad Notify API.</p>
      </div>
    `;

    // Despacho de Email mediante Notify API en AWS EC2 con Template y Llave de Idempotencia
    const notifyResult = await dispatchNotification({
      channel: 'Email',
      recipient: email.trim(),
      templateCode: 'LOAN_DISBURSED',
      templateVariables: {
        nombre: String(borrowerName),
        loanId: String(loanId),
        monto: Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        plazo: String(months),
        cuota: Number(monthlyQuota).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        banco: bankName || 'Banco Pichincha',
        cuenta: String(bankAccount),
      },
      subject: `¡Crédito Desembolsado con Éxito! - Comprobante #${loanId}`,
      body: emailHtmlBody,
      idempotencyKey,
      priority: 'High',
      metadata: {
        loanId: String(loanId),
        amount: String(amount),
        borrowerName: String(borrowerName),
        bankAccount: String(bankAccount),
        system: 'prestamos-app',
      },
    });

    return NextResponse.json({
      success: true,
      loan: {
        loanId,
        borrowerName,
        identification,
        amount,
        months,
        monthlyQuota,
        bankName,
        bankAccount,
        disbursedAt: new Date().toISOString(),
      },
      notification: notifyResult,
      isDuplicateReplay: notifyResult.isIdempotentReplay,
      idempotencyKey,
      message: notifyResult.isIdempotentReplay
        ? '⚠️ Solicitud detectada como DUPLICADA por Notify API. Se retornó el registro original sin re-enviar la notificación (Idempotencia Garantizada).'
        : '✅ Préstamo desembolsado exitosamente y comprobante transaccional encolado en Notify API.',
    });
  } catch (error: any) {
    console.error('Error procesando desembolso:', error);
    return NextResponse.json(
      {
        error: 'Error procesando desembolso con Notify API',
        details: error?.message || 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
