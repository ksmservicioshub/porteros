/**
 * KSM Intercom - License + Auto-Registration Flow
 * 
 * Extiende el sistema KSM License para QR Intercom Pro.
 * 
 * Flujo:
 * 1. Muestra formulario propio: Nombre + Email + Pass + Casa
 * 2. Guarda email/pass/casa en localStorage de forma temporal
 * 3. Pasa el control a verifyLicense() del Hub (sin modificarlo)
 * 4. Cuando KSM aprueba y quita su overlay, detectamos el cambio
 *    y ejecutamos el signUp() en Supabase del Intercom automáticamente
 */

import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase del Intercom (el propio proyecto)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PENDING_REG_KEY = 'ksm_intercom_pending_registration';

/**
 * Guarda los datos del usuario temporalmente hasta que KSM apruebe
 */
function savePendingRegistration(data) {
  localStorage.setItem(PENDING_REG_KEY, JSON.stringify(data));
}

/**
 * Recupera y borra los datos pendientes de registro
 */
function consumePendingRegistration() {
  const raw = localStorage.getItem(PENDING_REG_KEY);
  if (!raw) return null;
  localStorage.removeItem(PENDING_REG_KEY);
  return JSON.parse(raw);
}

/**
 * Intenta completar el registro en Supabase si hay datos pendientes.
 * Es llamado automáticamente cuando KSM aprueba y quita su overlay.
 */
export async function completePendingIntercomRegistration() {
  const pending = consumePendingRegistration();
  if (!pending) return; // No hay nada pendiente (ya se registró antes)

  const { email, password, homeName } = pending;

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) {
    console.error("[Intercom] Error al crear cuenta:", authError.message);
    return;
  }

  // 2. Crear el Hogar asociado a ese usuario
  if (authData.user) {
    await supabase.from('homes').insert([{
      owner_id: authData.user.id,
      name: homeName || 'Mi Casa'
    }]);
    console.log("[Intercom] ¡Cuenta y hogar creados exitosamente!");
  }
}

/**
 * Muestra el formulario de registro previo a la verificación de licencia.
 * Recoge los datos, los guarda y luego cede el control al sistema KSM.
 * 
 * @param {function} verifyLicenseFn - La función verifyLicense del módulo KSM 
 */
export function startIntercomOnboarding(verifyLicenseFn) {
  // Si ya existe un registro pendiente, significa que el cliente fue rechazado
  // o está esperando aprobación. En ese caso, lanzamos directamente el checker de KSM.
  const existing = localStorage.getItem(PENDING_REG_KEY);
  if (existing) {
    const data = JSON.parse(existing);
    verifyLicenseFn(data.name);
    return;
  }

  // Creamos el overlay del formulario de registro del Intercom
  const overlay = document.createElement('div');
  overlay.id = 'ksm-intercom-register-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: '#0d1b2e', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    zIndex: '999999', fontFamily: 'system-ui, sans-serif', padding: '20px',
    boxSizing: 'border-box'
  });

  overlay.innerHTML = `
    <div style="
      background: #1a2a3e; padding: 40px; border-radius: 20px; 
      max-width: 420px; width: 100%; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border: 1px solid rgba(58, 134, 255, 0.2);
    ">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">🏠</div>
      <h1 style="color: #3a86ff; margin: 0 0 8px; font-size: 1.3rem; letter-spacing: 1px;">
        QR INTERCOM PRO
      </h1>
      <p style="color: #8899aa; font-size: 0.9rem; margin-bottom: 2rem;">
        Configura tu intercomunicador inteligente
      </p>

      <div style="display: flex; flex-direction: column; gap: 14px; text-align: left;">
        <input id="reg-name" type="text" placeholder="Tu nombre completo" style="${inputStyle()}"/>
        <input id="reg-house" type="text" placeholder="Nombre de tu casa (Ej: Familia Pérez)" style="${inputStyle()}"/>
        <input id="reg-email" type="email" placeholder="Tu correo electrónico" style="${inputStyle()}"/>
        <input id="reg-pass" type="password" placeholder="Contraseña (mín. 6 caracteres)" style="${inputStyle()}"/>
      </div>

      <p id="reg-error" style="color: #ef476f; font-size: 0.85rem; margin-top: 12px; min-height: 20px;"></p>

      <button id="reg-submit" style="
        margin-top: 12px; width: 100%; padding: 14px;
        background: linear-gradient(135deg, #3a86ff, #256ce1);
        color: white; border: none; border-radius: 10px;
        font-size: 1rem; font-weight: bold; cursor: pointer;
        letter-spacing: 1px; transition: opacity 0.2s;
      ">
        SOLICITAR ACCESO
      </button>

      <p style="color: #556677; font-size: 0.75rem; margin-top: 16px;">
        Tu solicitud será revisada por el administrador.<br/>Recibirás acceso una vez aprobada.
      </p>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // Lógica del botón de envío
  document.getElementById('reg-submit').addEventListener('click', () => {
    const name = document.getElementById('reg-name').value.trim();
    const homeName = document.getElementById('reg-house').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-pass').value;
    const errorEl = document.getElementById('reg-error');

    if (!name || !homeName || !email || !password) {
      errorEl.textContent = 'Por favor, completa todos los campos.';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    // Guardamos los datos y quitamos este overlay para que KSM tome el control
    savePendingRegistration({ name, homeName, email, password });
    overlay.remove();

    // Pasamos el nombre al sistema KSM → él avisará a Telegram
    verifyLicenseFn(name);
  });
}

function inputStyle() {
  return `
    padding: 14px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
    color: white; font-size: 0.95rem; outline: none; width: 100%;
    box-sizing: border-box;
  `;
}
