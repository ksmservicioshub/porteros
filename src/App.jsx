import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { VisitorMode } from './components/VisitorMode/VisitorMode';
import { OwnerMode } from './components/OwnerMode/OwnerMode';
import { Login } from './components/Login/Login';
import { Capacitor } from '@capacitor/core';
import { supabase } from './services/supabaseClient';
import { verifyLicense } from './services/license_checker';
import { startIntercomOnboarding, completePendingIntercomRegistration } from './services/intercom_license';

// --- ENVOLTORIO PARA EL VISITANTE ---
const VisitorWrapper = ({ mode = 'portero' }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const homeId = searchParams.get('home_id');

  if (!homeId) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', fontFamily: 'sans-serif', backgroundColor: '#d1d5db', height: '100vh' }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', maxWidth: '400px', margin: '0 auto', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#ef476f' }}>QR Inválido o Faltante</h2>
          <p style={{ color: '#555', marginTop: '1rem' }}>Por favor, escanee el código QR físico pegado en el portero de la casa que desea visitar.</p>
        </div>
      </div>
    );
  }

  return <VisitorMode mode={mode} homeId={homeId} />;
};

// --- RUTA PROTEGIDA PARA EL DUEÑO ---
const ProtectedOwnerRoute = () => {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ backgroundColor: '#263353', height: '100vh' }}></div>; 
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <OwnerMode session={session} />;
};

function App() {
  const isNative = Capacitor.isNativePlatform();

  // INYECCIÓN DE LICENCIA KSM + AUTO-REGISTRO
  useEffect(() => {
    if (!isNative) return;

    const checkSessionAndOnboard = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Ya hay sesión iniciada. Saltar el onboarding de registro y verificar la licencia directamente
        verifyLicense("KSM QR Intercom Pro");
        return;
      }

      // No hay sesión: mostrar formulario de registro e inicializar KSM
      startIntercomOnboarding(verifyLicense);

      const observer = new MutationObserver(() => {
        const ksmOverlay = document.getElementById('ksm-license-overlay');
        if (!ksmOverlay) {
          observer.disconnect();
          completePendingIntercomRegistration();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    checkSessionAndOnboard();
  }, [isNative]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Ruta pública para los que escanean el QR */}
        {/* Si el dueño abre el APK en Android, lo mandamos forzadamente a hacer Login */}
        <Route path="/" element={isNative ? <Navigate to="/owner" replace /> : <VisitorWrapper />} />
        
        {/* Ruta privada para el monitor del dueño */}
        <Route path="/owner" element={<ProtectedOwnerRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
