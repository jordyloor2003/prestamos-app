'use client';

import React, { useState, useEffect } from 'react';
import {
  Landmark,
  ShieldCheck,
  Smartphone,
  Mail,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Server,
  DollarSign,
  CreditCard,
  User,
  Zap,
  Info,
  Clock,
  Layers,
  Repeat
} from 'lucide-react';

interface BorrowerData {
  loanId: string;
  name: string;
  identification: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  amount: number;
  months: number;
}

interface NotificationDetail {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  subject?: string;
  idempotencyKey?: string;
  createdAt: string;
  sentAt?: string;
  retryCount?: number;
  attempts?: Array<{
    attemptNumber: number;
    provider: string;
    status: string;
    httpStatusCode: number;
    latencyMs: number;
    attemptedAt: string;
  }>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'audit' | 'architecture'>('simulator');

  // Préstamo - Estado del Simulador
  const [amount, setAmount] = useState<number>(5000);
  const [months, setMonths] = useState<number>(24);
  const annualInterestRate = 0.095; // 9.5%

  // Datos del solicitante
  const [borrower, setBorrower] = useState<BorrowerData>({
    loanId: `LOAN-${Math.floor(100000 + Math.random() * 900000)}`,
    name: 'Carlos Mendoza',
    identification: '1723456789',
    email: 'carlos.mendoza@ejemplo.com',
    phone: '+593998765432',
    bankName: 'Banco Pichincha',
    bankAccount: '210045678901',
    amount: 5000,
    months: 24,
  });

  // Estado del flujo
  const [step, setStep] = useState<'form' | 'otp_modal' | 'success'>('form');
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isDisbursing, setIsDisbursing] = useState<boolean>(false);
  const [isTestingIdempotency, setIsTestingIdempotency] = useState<boolean>(false);
  const [idempotencyAlert, setIdempotencyAlert] = useState<string | null>(null);

  // OTP y Notificaciones
  const [otpValue, setOtpValue] = useState<string>('');
  const [demoOtpHint, setDemoOtpHint] = useState<string | null>(null);
  const [otpNotificationId, setOtpNotificationId] = useState<string | null>(null);
  const [disburseResult, setDisburseResult] = useState<any>(null);
  const [disburseNotificationDetail, setDisburseNotificationDetail] = useState<NotificationDetail | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Auditoría en Vivo (Tab 2)
  const [auditNotifications, setAuditNotifications] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [selectedAuditItem, setSelectedAuditItem] = useState<NotificationDetail | null>(null);

  // Cálculo de cuota fija mensual (Sistema Francés)
  const monthlyRate = annualInterestRate / 12;
  const monthlyQuota =
    (amount * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
    (Math.pow(1 + monthlyRate, months) - 1);
  const totalRepayment = monthlyQuota * months;

  // Actualizar datos del préstamo cuando cambien sliders
  useEffect(() => {
    setBorrower((prev) => ({
      ...prev,
      amount,
      months,
    }));
  }, [amount, months]);

  // Cargar auditoría al abrir la pestaña
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditList();
    }
  }, [activeTab]);

  const fetchAuditList = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/notifications?pageSize=15');
      if (res.ok) {
        const data = await res.json();
        setAuditNotifications(data.items || []);
      }
    } catch (err) {
      console.error('Error cargando auditoría:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Paso 1: Enviar OTP por SMS vía Notify API
  const handleRequestLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingOtp(true);
    setIdempotencyAlert(null);

    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: borrower.phone,
          borrowerName: borrower.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al enviar código SMS');
      }

      setDemoOtpHint(data.demoOtpCode);
      setOtpNotificationId(data.notification?.id || null);
      setStep('otp_modal');
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Paso 2: Verificar OTP y Desembolsar con Idempotencia
  const handleConfirmDisbursement = async () => {
    if (!otpValue || otpValue.trim().length !== 6) {
      alert('Por favor ingrese el código de 6 dígitos.');
      return;
    }

    setIsDisbursing(true);
    try {
      const res = await fetch('/api/loans/disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: borrower.loanId,
          borrowerName: borrower.name,
          identification: borrower.identification,
          email: borrower.email,
          phone: borrower.phone,
          amount,
          months,
          monthlyQuota,
          bankAccount: borrower.bankAccount,
          bankName: borrower.bankName,
          otp: otpValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error en el desembolso');
      }

      setDisburseResult(data);
      setStep('success');

      // Consultar detalle inicial y comenzar sondeo de estado
      if (data.notification?.id) {
        pollNotificationDetail(data.notification.id);
      }
    } catch (error: any) {
      alert(`Error de desembolso: ${error.message}`);
    } finally {
      setIsDisbursing(false);
    }
  };

  // Sondeo del estado de entrega en Notify API
  const pollNotificationDetail = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`);
      if (res.ok) {
        const detail = await res.json();
        setDisburseNotificationDetail(detail);

        // Si aún está en PENDING o PROCESSING, volver a consultar tras 1.5 segundos
        if (detail.status === 'PENDING' || detail.status === 'PROCESSING' || detail.status === 'Pending' || detail.status === 'Processing') {
          setTimeout(() => pollNotificationDetail(notificationId), 1500);
        }
      }
    } catch (e) {
      console.error('Error polling notification status:', e);
    }
  };

  // Demostración en vivo de Idempotencia: reenviar misma llave
  const handleTriggerIdempotencyDemo = async () => {
    if (!disburseResult) return;
    setIsTestingIdempotency(true);
    setIdempotencyAlert(null);

    try {
      const res = await fetch('/api/loans/disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: borrower.loanId,
          borrowerName: borrower.name,
          identification: borrower.identification,
          email: borrower.email,
          phone: borrower.phone,
          amount,
          months,
          monthlyQuota,
          bankAccount: borrower.bankAccount,
          bankName: borrower.bankName,
          otp: '000000', // Bypass OTP para la prueba duplicada
          forceDuplicateDemo: true,
        }),
      });

      const data = await res.json();
      if (data.isDuplicateReplay) {
        setIdempotencyAlert(
          `🛡️ IDEMPOTENCIA DETECTADA: Notify API interceptó la solicitud con llave 'loan-disburse-${borrower.loanId}'. Retornó el estado previo 200 OK sin generar duplicados en base de datos ni duplicar envíos de correo.`
        );
      } else {
        setIdempotencyAlert(`Respuesta: ${data.message}`);
      }
    } catch (error: any) {
      alert(`Error en prueba de idempotencia: ${error.message}`);
    } finally {
      setIsTestingIdempotency(false);
    }
  };

  const handleResetFlow = () => {
    setBorrower((prev) => ({
      ...prev,
      loanId: `LOAN-${Math.floor(100000 + Math.random() * 900000)}`,
    }));
    setOtpValue('');
    setDemoOtpHint(null);
    setOtpNotificationId(null);
    setDisburseResult(null);
    setDisburseNotificationDetail(null);
    setIdempotencyAlert(null);
    setStep('form');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Landmark className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent">
                  PrestaYa FinTech
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  Banca Digital
                </span>
              </div>
              <p className="text-xs text-slate-400">Sistema de Desembolso Inmediato & 2FA</p>
            </div>
          </div>

          {/* Engine Status Badge */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-full shadow-inner">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-mono">Notify API: 52.15.152.202</span>
              <span className="text-emerald-400 font-semibold uppercase text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                AWS EC2
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Secondary Nav / Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 py-2">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>Simulador y Desembolso</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Auditoría en Tiempo Real (Feed Notify API)</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'architecture'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Arquitectura y Patrones</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {activeTab === 'simulator' && (
          <div>
            {step === 'form' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Columna Izquierda: Simulador de Préstamo */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

                    <h2 className="text-xl font-bold text-white flex items-center space-x-2 mb-6">
                      <DollarSign className="h-5 w-5 text-blue-400" />
                      <span>Configura tu Préstamo</span>
                    </h2>

                    {/* Slider de Monto */}
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-300">Monto Solicitado</label>
                        <span className="text-2xl font-black text-blue-400 font-mono">
                          ${amount.toLocaleString('en-US')} USD
                        </span>
                      </div>
                      <input
                        type="range"
                        min="500"
                        max="20000"
                        step="500"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>$500</span>
                        <span>$10,000</span>
                        <span>$20,000</span>
                      </div>
                      {/* Botones de selección rápida */}
                      <div className="flex space-x-2 pt-1">
                        {[1000, 3000, 5000, 10000].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setAmount(val)}
                            className={`text-xs px-2.5 py-1 rounded-md border transition ${
                              amount === val
                                ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-semibold'
                                : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            ${val.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Selector de Plazo */}
                    <div className="space-y-3 mb-8">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-slate-300">Plazo de Devolución</label>
                        <span className="text-lg font-bold text-indigo-300 font-mono">{months} meses</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[6, 12, 24, 36].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMonths(m)}
                            className={`py-2 text-center rounded-xl border text-sm font-medium transition ${
                              months === m
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold shadow-inner'
                                : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            {m}m
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Resumen Financiero Calculado */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Tasa de Interés Fija (TEA):</span>
                        <span className="text-slate-200 font-medium">9.50% Anual</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Total de Intereses Estimados:</span>
                        <span className="text-slate-200 font-medium">
                          ${(totalRepayment - amount).toFixed(2)} USD
                        </span>
                      </div>
                      <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
                        <div>
                          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
                            Cuota Mensual Fija
                          </span>
                          <span className="text-[11px] text-slate-500">Incluye capital e intereses</span>
                        </div>
                        <span className="text-2xl font-black text-emerald-400 font-mono">
                          ${monthlyQuota.toFixed(2)} <span className="text-xs font-normal text-slate-400">/mes</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Beneficios de Seguridad */}
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 space-y-3 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>Desembolso Protegido con Notify API</span>
                    </div>
                    <p>
                      Cada transacción cuenta con verificación de identidad en 2 pasos mediante <strong>SMS 2FA</strong> y emisión de certificado digital vía <strong>Email</strong> con claves de idempotencia contra doble cargo.
                    </p>
                  </div>
                </div>

                {/* Columna Derecha: Formulario de Solicitante y Destino */}
                <div className="lg:col-span-7">
                  <form
                    onSubmit={handleRequestLoan}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
                  >
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                        <User className="h-5 w-5 text-indigo-400" />
                        <span>Datos del Titular y Cuenta de Abono</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Ingrese sus datos bancarios para transferir los fondos una vez validado su SMS de seguridad.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Nombres y Apellidos
                        </label>
                        <input
                          type="text"
                          required
                          value={borrower.name}
                          onChange={(e) => setBorrower({ ...borrower, name: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition"
                          placeholder="Ej: Carlos Mendoza"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Cédula / Identificación
                        </label>
                        <input
                          type="text"
                          required
                          value={borrower.identification}
                          onChange={(e) => setBorrower({ ...borrower, identification: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition"
                          placeholder="Ej: 1723456789"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Correo Electrónico (Comprobante)</span>
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                        </label>
                        <input
                          type="email"
                          required
                          value={borrower.email}
                          onChange={(e) => setBorrower({ ...borrower, email: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition"
                          placeholder="tu@correo.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Teléfono Móvil (SMS 2FA)</span>
                          <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                        </label>
                        <input
                          type="tel"
                          required
                          value={borrower.phone}
                          onChange={(e) => setBorrower({ ...borrower, phone: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition"
                          placeholder="+593998765432"
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-5 space-y-4">
                      <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
                        <CreditCard className="h-4 w-4 text-emerald-400" />
                        <span>Destino de Transferencia Inmediata</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Entidad Financiera
                          </label>
                          <select
                            value={borrower.bankName}
                            onChange={(e) => setBorrower({ ...borrower, bankName: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="Banco Pichincha">Banco Pichincha</option>
                            <option value="Banco Guayaquil">Banco Guayaquil</option>
                            <option value="Banco del Pacífico">Banco del Pacífico</option>
                            <option value="Produbanco">Produbanco</option>
                            <option value="Banco Bolivariano">Banco Bolivariano</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Número de Cuenta Bancaria
                          </label>
                          <input
                            type="text"
                            required
                            value={borrower.bankAccount}
                            onChange={(e) => setBorrower({ ...borrower, bankAccount: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500 transition"
                            placeholder="Ej: 210045678901"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSendingOtp}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-base shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-50"
                      >
                        {isSendingOtp ? (
                          <>
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            <span>Conectando con Notify API en AWS (SMS 2FA)...</span>
                          </>
                        ) : (
                          <>
                            <span>Solicitar y Desembolsar Crédito</span>
                            <ArrowRight className="h-5 w-5" />
                          </>
                        )}
                      </button>
                      <p className="text-[11px] text-center text-slate-500 mt-2.5">
                        Al presionar el botón se enviará un código de verificación único (SMS OTP) certificado por el motor transaccional.
                      </p>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal de Verificación 2FA */}
            {step === 'otp_modal' && (
              <div
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="otp-title"
              >
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 relative">
                  <div className="text-center space-y-2">
                    <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <h3 id="otp-title" className="text-xl font-bold text-white">
                      Verificación de Seguridad 2FA
                    </h3>
                    <p className="text-xs text-slate-400">
                      Hemos emitido un SMS a través de <strong>Notify API</strong> hacia el número:
                    </p>
                    <p className="font-mono text-sm text-blue-400 font-semibold">{borrower.phone}</p>
                  </div>

                  {/* Banner de Ayuda para Pruebas / Demostraciones */}
                  {demoOtpHint && (
                    <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 text-xs text-emerald-300 flex items-start space-x-2">
                      <Zap className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Código OTP Detectado en Notify API:</span>
                        <div className="mt-1 font-mono text-base font-black text-emerald-400 tracking-widest">
                          {demoOtpHint}
                        </div>
                        <span className="text-[10px] text-emerald-400/80">
                          (Generado por la plantilla `2FA_CODE` en Notify API para evaluación en tiempo real).
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Input OTP */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300 text-center">
                      Ingrese el código de 6 dígitos:
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 text-center text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-blue-500"
                      placeholder="••••••"
                    />
                  </div>

                  {/* Metadata de rastreo Notify API */}
                  {otpNotificationId && (
                    <div className="text-[10px] text-slate-500 font-mono text-center">
                      ID de Transacción Notify API: <br />
                      <span className="text-slate-400">{otpNotificationId}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isDisbursing || otpValue.length !== 6}
                      onClick={handleConfirmDisbursement}
                      className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 transition disabled:opacity-50"
                    >
                      {isDisbursing ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Desembolsando y Enviando Comprobante...</span>
                        </>
                      ) : (
                        <>
                          <span>Confirmar y Transferir Fondos</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      className="w-full py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium transition"
                    >
                      Cancelar solicitud
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pantalla de Éxito / Comprobante Bancario */}
            {step === 'success' && disburseResult && (
              <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
                {/* Header de Éxito */}
                <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-800/80 rounded-2xl p-6 sm:p-8 text-center space-y-3 shadow-xl">
                  <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    ¡Desembolso Procesado con Éxito!
                  </h2>
                  <p className="text-sm text-slate-300 max-w-lg mx-auto">
                    Los fondos han sido transferidos satisfactoriamente a la cuenta del titular. El comprobante transaccional oficial fue despachado por <strong>Notify API</strong>.
                  </p>
                </div>

                {/* Comprobante Digital */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl relative">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                    <div className="flex items-center space-x-2">
                      <Landmark className="h-5 w-5 text-blue-400" />
                      <span className="font-bold text-slate-200">Comprobante Oficial de Desembolso</span>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase">
                      Liquidado
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">N° de Préstamo</span>
                      <span className="font-mono font-bold text-slate-200 text-sm">{borrower.loanId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Monto Transferido</span>
                      <span className="font-mono font-black text-emerald-400 text-sm">
                        ${amount.toLocaleString('en-US')}.00 USD
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Plazo</span>
                      <span className="font-mono font-semibold text-slate-200 text-sm">{months} meses</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Cuota Mensual</span>
                      <span className="font-mono font-semibold text-blue-400 text-sm">
                        ${monthlyQuota.toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Titular de Cuenta:</span>
                      <span className="text-slate-200 font-medium">{borrower.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Identificación:</span>
                      <span className="font-mono text-slate-200">{borrower.identification}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Banco de Abono:</span>
                      <span className="text-slate-200 font-medium">{borrower.bankName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cuenta de Destino:</span>
                      <span className="font-mono text-slate-200">{borrower.bankAccount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Correo Electrónico de Destino:</span>
                      <span className="font-mono text-blue-400">{borrower.email}</span>
                    </div>
                  </div>

                  {/* Panel de Seguimiento en Vivo con Notify API */}
                  <div className="border border-blue-500/20 bg-blue-950/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-bold text-blue-300">
                          Notificación Transaccional (Notify API)
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            disburseNotificationDetail?.status === 'DELIVERED' ||
                            disburseNotificationDetail?.status === 'SENT' ||
                            disburseNotificationDetail?.status === 'Sent'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {disburseNotificationDetail?.status || disburseResult.notification?.status}
                        </span>
                        <button
                          onClick={() => pollNotificationDetail(disburseResult.notification.id)}
                          className="text-slate-400 hover:text-slate-200 p-1"
                          title="Actualizar estado de entrega"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block">ID Notificación:</span>
                        <span className="text-slate-300 truncate block">
                          {disburseResult.notification?.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Llave de Idempotencia:</span>
                        <span className="text-indigo-300 flex items-center space-x-1">
                          <span>{disburseResult.idempotencyKey}</span>
                          <button
                            onClick={() => copyToClipboard(disburseResult.idempotencyKey)}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            {copiedKey ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </span>
                      </div>
                    </div>

                    {/* Intentos y Latencia si está disponible */}
                    {disburseNotificationDetail?.attempts && disburseNotificationDetail.attempts.length > 0 && (
                      <div className="border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Proveedor Despachador:</span>
                          <span className="text-slate-200">
                            {disburseNotificationDetail.attempts[0].provider}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Latencia de Entrega:</span>
                          <span className="text-emerald-400 font-mono">
                            {disburseNotificationDetail.attempts[0].latencyMs} ms
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alerta de Prueba de Idempotencia */}
                  {idempotencyAlert && (
                    <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 text-xs text-amber-200 flex items-start space-x-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>{idempotencyAlert}</div>
                    </div>
                  )}

                  {/* Acciones de Demostración y Reinicio */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      disabled={isTestingIdempotency}
                      onClick={handleTriggerIdempotencyDemo}
                      className="flex-1 py-3 px-4 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center space-x-2 transition"
                    >
                      {isTestingIdempotency ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Comprobando Idempotencia en AWS EC2...</span>
                        </>
                      ) : (
                        <>
                          <Repeat className="h-4 w-4" />
                          <span>Simular Doble Clic Accidental (Probar Idempotencia)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetFlow}
                      className="py-3 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                    >
                      Solicitar Nuevo Préstamo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Auditoría en Tiempo Real (Notify API Feed) */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-blue-400" />
                  <span>Auditoría en Tiempo Real de Notify API</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Transacciones y notificaciones registradas en MongoDB Atlas a través de la instancia AWS EC2.
                </p>
              </div>
              <button
                onClick={fetchAuditList}
                disabled={isLoadingAudit}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center space-x-2 border border-slate-700 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                <span>Actualizar Feed</span>
              </button>
            </div>

            {/* Tabla de Notificaciones */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Canal</th>
                      <th className="py-3.5 px-4">Destinatario</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-4">Llave Idempotencia</th>
                      <th className="py-3.5 px-4">Intentos</th>
                      <th className="py-3.5 px-4">Fecha Creación</th>
                      <th className="py-3.5 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {auditNotifications.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          {isLoadingAudit
                            ? 'Cargando registros desde AWS Notify API...'
                            : 'No hay notificaciones registradas aún. ¡Solicita un préstamo en la pestaña Simulador!'}
                        </td>
                      </tr>
                    ) : (
                      auditNotifications.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.channel === 'Sms'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              {item.channel}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-200">
                            {item.recipient}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.status === 'DELIVERED' || item.status === 'SENT' || item.status === 'Sent'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : item.status === 'FAILED' || item.status === 'Failed'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px] truncate max-w-[150px]">
                            {item.idempotencyKey || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono">{item.retryCount ?? 1}</td>
                          <td className="py-3 px-4 text-slate-400">
                            {new Date(item.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setSelectedAuditItem(item)}
                              className="text-blue-400 hover:text-blue-300 font-medium"
                            >
                              Detalles
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal de Detalle de Notificación */}
            {selectedAuditItem && (
              <div
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
              >
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <Info className="h-4 w-4 text-blue-400" />
                      <span>Detalle de Notificación</span>
                    </h3>
                    <button
                      onClick={() => setSelectedAuditItem(null)}
                      className="text-slate-400 hover:text-slate-200 text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-500">ID:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Canal:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.channel}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Destinatario:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.recipient}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Asunto:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.subject || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Llave Idempotencia:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.idempotencyKey || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Creado:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.createdAt}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Entregado:</span>{' '}
                      <span className="text-slate-200">{selectedAuditItem.sentAt || 'Pendiente'}</span>
                    </div>
                  </div>

                  {selectedAuditItem.attempts && selectedAuditItem.attempts.length > 0 && (
                    <div className="border-t border-slate-800 pt-3">
                      <h4 className="text-xs font-semibold text-slate-300 mb-2">Historial de Intentos de Envío:</h4>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {selectedAuditItem.attempts.map((att, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950 p-2 rounded-lg text-[11px] font-mono flex justify-between"
                          >
                            <span>Intento #{att.attemptNumber} ({att.provider})</span>
                            <span className="text-emerald-400">{att.status} ({att.latencyMs}ms)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedAuditItem(null)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Arquitectura y Patrones de Integración */}
        {activeTab === 'architecture' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center space-x-2">
                <Layers className="h-6 w-6 text-blue-400" />
                <span>Arquitectura de Integración B2B</span>
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Cómo interactúa esta aplicación FinTech en Vercel con el microservicio Notify API en AWS EC2.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Autenticación OAuth2 B2B</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Utiliza <strong>Client Credentials Flow</strong> con <code className="text-blue-300">ClientId</code> y <code className="text-blue-300">ClientSecret</code> para emitir tokens JWT con caducidad y caché en memoria.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Repeat className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Idempotencia Garantizada</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  La cabecera <code className="text-indigo-300">Idempotency-Key</code> almacena hashes de solicitudes en índices TTL de MongoDB Atlas por 24 horas, evitando dobles desembolsos o spam.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Server className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white text-base">Desacoplamiento Asíncrono</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Retorno inmediato <code className="text-emerald-300">202 Accepted</code> con URL de rastreo <code className="text-emerald-300">/status</code> mientras el Worker en segundo plano ejecuta reintentos con Backoff Exponencial.
                </p>
              </div>
            </div>

            {/* Diagrama de Secuencia ASCII / Estructurado */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Flujo de Ejecución Paso a Paso
              </h3>
              <div className="bg-slate-950 p-4 rounded-xl font-mono text-xs text-slate-300 space-y-2 border border-slate-800 overflow-x-auto">
                <p className="text-blue-400">1. [Usuario] Solicita Crédito ($5,000) en interfaz Web (Next.js)</p>
                <p className="text-slate-400">2. [Next.js API] Solicita Token JWT a Notify API: POST /api/v1/auth/token</p>
                <p className="text-purple-400">3. [Notify API @ AWS] Valida Credenciales de Banca Móvil -&gt; Retorna Bearer Token</p>
                <p className="text-slate-400">4. [Next.js API] Emite SMS 2FA: POST /api/v1/notifications con Template `2FA_CODE`</p>
                <p className="text-amber-400">5. [Usuario] Ingresa código de seguridad de 6 dígitos en el modal</p>
                <p className="text-slate-400">6. [Next.js API] Valida OTP y despacha Email con Idempotency-Key: `loan-disburse-LOAN-XXX`</p>
                <p className="text-emerald-400">7. [Notify API @ AWS] Encola notificación y persiste en MongoDB Atlas (Status: DELIVERED)</p>
                <p className="text-slate-400">8. [Next.js API] Retorna comprobante digital bancario al usuario</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/80 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-2">
            <Landmark className="h-4 w-4 text-blue-500" />
            <span>PrestaYa FinTech &copy; 2026 - Proyecto de Demostración API-First</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Notify API v1.0.0</span>
            <span>•</span>
            <span>AWS EC2 Elastic IP: 52.15.152.202</span>
            <span>•</span>
            <span>Next.js 14 + Tailwind CSS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
