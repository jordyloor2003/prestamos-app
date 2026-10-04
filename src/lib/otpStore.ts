// Almacén temporal de OTPs en memoria para el flujo 2FA del desembolso

interface OtpRecord {
  code: string;
  phone: string;
  expiresAt: number;
}

// Global para preservar estado en entornos hot-reload en Next.js local
const globalForOtp = globalThis as unknown as {
  otpStore?: Map<string, OtpRecord>;
};

export const otpStore = globalForOtp.otpStore || new Map<string, OtpRecord>();
if (process.env.NODE_ENV !== 'production') {
  globalForOtp.otpStore = otpStore;
}

export function saveOtp(phone: string, code: string, ttlSeconds = 300): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  otpStore.set(phone, { code, phone, expiresAt });
}

export function verifyOtp(phone: string, enteredCode: string): { valid: boolean; message: string } {
  const record = otpStore.get(phone);
  if (!record) {
    return { valid: false, message: 'No se encontró un código OTP activo para este número. Solicita uno nuevo.' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return { valid: false, message: 'El código OTP ha expirado. Por favor solicita un nuevo código.' };
  }

  if (record.code !== enteredCode.trim()) {
    return { valid: false, message: 'Código de seguridad incorrecto. Intenta nuevamente.' };
  }

  // Código verificado con éxito, eliminamos para prevenir reuso
  otpStore.delete(phone);
  return { valid: true, message: 'Código verificado con éxito.' };
}
