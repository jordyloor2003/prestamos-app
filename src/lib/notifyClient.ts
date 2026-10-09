// Cliente SDK de Integración con Notify API (AWS EC2 / Microservicio Transaccional)

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

const NOTIFY_API_URL = process.env.NOTIFY_API_URL || 'http://52.15.152.202';
const CLIENT_ID = process.env.NOTIFY_CLIENT_ID || 'app_bancamovil_prod';
const CLIENT_SECRET = process.env.NOTIFY_CLIENT_SECRET || 'sec_99a8b7c6d5e4f3a2b1c0';

/**
 * Obtiene un token Bearer JWT válido utilizando Client Credentials OAuth2 / B2B.
 * Reutiliza el token en memoria si aún no ha expirado.
 */
export async function getAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30000) {
    return cachedToken.accessToken;
  }

  const response = await fetch(`${NOTIFY_API_URL}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de autenticación con Notify API [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const expiresInMs = (data.expiresIn || 3600) * 1000;

  cachedToken = {
    accessToken: data.accessToken,
    expiresAt: now + expiresInMs,
  };

  return cachedToken.accessToken;
}

export interface DispatchNotificationParams {
  channel: 'Email' | 'Sms' | 'Push';
  recipient: string;
  templateCode?: string;
  subject?: string;
  body?: string;
  templateVariables?: Record<string, string>;
  metadata?: Record<string, string>;
  priority?: 'Low' | 'Normal' | 'High';
  idempotencyKey?: string;
  correlationId?: string;
}

export interface NotificationResult {
  id: string;
  status: string;
  channel: string;
  recipient: string;
  createdAt: string;
  trackingUrl: string;
  isIdempotentReplay?: boolean;
}

/**
 * Envía una notificación transaccional a la Notify API respetando idempotencia.
 */
export async function dispatchNotification(
  params: DispatchNotificationParams
): Promise<NotificationResult> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }

  if (params.correlationId) {
    headers['X-Correlation-Id'] = params.correlationId;
  }

  const payload: Record<string, any> = {
    channel: params.channel,
    recipient: params.recipient,
    priority: params.priority || 'Normal',
  };

  if (params.templateCode) {
    payload.templateCode = params.templateCode;
  }
  if (params.subject) {
    payload.subject = params.subject;
  }
  if (params.body) {
    payload.body = params.body;
  }
  if (params.templateVariables) {
    payload.templateVariables = params.templateVariables;
  }
  if (params.metadata) {
    payload.metadata = params.metadata;
  }

  const response = await fetch(`${NOTIFY_API_URL}/api/v1/notifications`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const isDuplicate = response.status === 200;
  const isAccepted = response.status === 202;

  if (!isDuplicate && !isAccepted) {
    const errorBody = await response.text();
    throw new Error(`Error despachando notificación [${response.status}]: ${errorBody}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    status: data.status,
    channel: data.channel,
    recipient: data.recipient,
    createdAt: data.createdAt,
    trackingUrl: data.trackingUrl || `${NOTIFY_API_URL}/api/v1/notifications/${data.id}/status`,
    isIdempotentReplay: isDuplicate,
  };
}

/**
 * Consulta el estado y los intentos de entrega de una notificación por su ID.
 */
export async function getNotificationDetail(id: string) {
  const token = await getAuthToken();
  const response = await fetch(`${NOTIFY_API_URL}/api/v1/notifications/${id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Error consultando detalle [${response.status}]`);
  }

  return await response.json();
}

/**
 * Consulta el listado de notificaciones emitidas con paginación.
 */
export async function listNotifications(page = 1, pageSize = 20) {
  const token = await getAuthToken();
  const response = await fetch(
    `${NOTIFY_API_URL}/api/v1/notifications?page=${page}&pageSize=${pageSize}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`Error listando notificaciones [${response.status}]`);
  }

  return await response.json();
}
