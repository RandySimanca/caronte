import { useEffect, useState } from 'react';
import { format } from 'date-fns';

/**
 * Clientes en espera: recordatorio local para el cobrador.
 *
 * Cuando el cobrador llega y el cliente no está o no tiene el dinero, lo pone en espera por
 * unos minutos u horas y la app le recuerda que debe volver.
 *
 * - Es solo una capa visual: NO cambia el estado del cliente ni del préstamo, así que no afecta
 *   contadores, liquidación ni sincronización.
 * - Se guarda en localStorage (y no en la tabla `settings` de Dexie) porque la sincronización
 *   reemplaza `settings` completa y borraría el recordatorio.
 * - Las esperas son del día: al cambiar de fecha se descartan solas.
 */

export type MotivoEspera = 'AUSENTE' | 'SIN_DINERO';

export interface ClienteEnEspera {
  clienteId: string;
  nombreCliente: string;
  /** Fecha (yyyy-MM-dd) en que se creó la espera */
  fecha: string;
  /** Momento (ms desde epoch) en que el cobrador debe volver */
  hasta: number;
  creadoEn: number;
  motivo: MotivoEspera;
}

const CLAVE_ALMACENAMIENTO = 'clientes_en_espera';
const EVENTO_CAMBIO = 'clientes_en_espera:cambio';
const MINUTOS_MAXIMOS = 720; // 12 horas

export const ETIQUETA_MOTIVO: Record<MotivoEspera, string> = {
  AUSENTE: 'No estaba',
  SIN_DINERO: 'No tenía el dinero',
};

function fechaDeHoy(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Lee las esperas de hoy (las de otros días se ignoran). */
export function leerClientesEnEspera(): ClienteEnEspera[] {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    const lista = crudo ? JSON.parse(crudo) : [];
    if (!Array.isArray(lista)) return [];
    const hoy = fechaDeHoy();
    return lista.filter(
      (e: any) => e && typeof e.clienteId === 'string' && e.fecha === hoy && typeof e.hasta === 'number'
    );
  } catch {
    return [];
  }
}

function guardarClientesEnEspera(lista: ClienteEnEspera[]): void {
  try {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

export function ponerClienteEnEspera(datos: {
  clienteId: string;
  nombreCliente: string;
  minutos: number;
  motivo: MotivoEspera;
}): void {
  const minutos = Math.min(Math.max(Math.round(datos.minutos), 1), MINUTOS_MAXIMOS);
  const ahora = Date.now();
  const nueva: ClienteEnEspera = {
    clienteId: datos.clienteId,
    nombreCliente: datos.nombreCliente,
    fecha: fechaDeHoy(),
    hasta: ahora + minutos * 60_000,
    creadoEn: ahora,
    motivo: datos.motivo,
  };
  const otras = leerClientesEnEspera().filter(e => e.clienteId !== datos.clienteId);
  guardarClientesEnEspera([...otras, nueva]);
}

export function quitarClienteDeEspera(clienteId: string): void {
  const actuales = leerClientesEnEspera();
  if (!actuales.some(e => e.clienteId === clienteId)) return;
  guardarClientesEnEspera(actuales.filter(e => e.clienteId !== clienteId));
}

/** Lista reactiva de clientes en espera (se actualiza al poner/quitar y entre pestañas). */
export function useClientesEnEspera(): ClienteEnEspera[] {
  const [lista, setLista] = useState<ClienteEnEspera[]>(() => leerClientesEnEspera());

  useEffect(() => {
    const refrescar = () => setLista(leerClientesEnEspera());
    refrescar();
    window.addEventListener(EVENTO_CAMBIO, refrescar);
    window.addEventListener('storage', refrescar);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO, refrescar);
      window.removeEventListener('storage', refrescar);
    };
  }, []);

  return lista;
}

/** Reloj reactivo: devuelve la hora actual (ms) y se actualiza cada `intervaloMs` mientras `activo`. */
export function useAhora(activo = true, intervaloMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!activo) return;
    const actualizar = () => setAhora(Date.now());
    actualizar();
    const temporizador = window.setInterval(actualizar, intervaloMs);
    // Al volver a la app desde segundo plano, refresca al instante
    const alVolver = () => { if (document.visibilityState === 'visible') actualizar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(temporizador);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [activo, intervaloMs]);

  return ahora;
}

/** 05:09 o 1:05:09 */
export function formatearCuentaRegresiva(milisegundos: number): string {
  const totalSegundos = Math.max(0, Math.ceil(milisegundos / 1000));
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${dos(minutos)}:${dos(segundos)}`;
}

export function formatearHoraRegreso(hasta: number): string {
  return format(new Date(hasta), 'h:mm a');
}

/** Vibración y pitido corto cuando se cumple el tiempo (solo funciona con la app abierta). */
export function avisarEsperaVencida(): void {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    /* ignorar */
  }
  try {
    const ConstructorAudio = window.AudioContext || (window as any).webkitAudioContext;
    if (!ConstructorAudio) return;
    const contexto = new ConstructorAudio();
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();
    oscilador.connect(volumen);
    volumen.connect(contexto.destination);
    oscilador.frequency.value = 880;
    volumen.gain.value = 0.15;
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.5);
    oscilador.onended = () => { contexto.close().catch(() => { }); };
  } catch {
    /* el navegador puede bloquear el audio hasta que el usuario toque la pantalla */
  }
}
