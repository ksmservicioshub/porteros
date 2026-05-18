import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import styles from './OwnerMode.module.css';

// Background Presets CSS gradients
const presets = {
  preset_1: 'linear-gradient(135deg, #0d1b2e, #1a2a3e)', // Carbono Oscuro
  preset_2: 'linear-gradient(135deg, #0b1528, #1e3a8a)', // Azul Espacial
  preset_3: 'linear-gradient(135deg, #2b1055, #7597de)', // Atardecer Moderno
  preset_4: 'linear-gradient(135deg, #e5e7eb, #f3f4f6)', // Blanco Plástico
};

// Dynamic Web Audio Ringtone Synthesizer
const playRingSound = (type, customAudioRef = null) => {
  try {
    if (type === 'custom') {
      const base64Audio = localStorage.getItem('ksm_intercom_custom_ringtone_data');
      if (base64Audio) {
        if (customAudioRef && customAudioRef.current) {
          customAudioRef.current.pause();
          customAudioRef.current = null;
        }
        const audio = new Audio(base64Audio);
        audio.loop = false;
        audio.play().catch(e => console.warn("Audio play blocked or failed", e));
        if (customAudioRef) {
          customAudioRef.current = audio;
        }
      }
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'comercial') {
      // Ding
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.5, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 1.2);

      // Dong
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(440.00, ctx.currentTime); // A4
        gain2.gain.setValueAtTime(0.5, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 1.5);
      }, 350);
    } else if (type === 'digital') {
      // Double digital chime
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880.00, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        }, i * 150);
      }
    } else {
      // Classic vintage telephone trill
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gain = ctx.createGain();
      
      oscA.frequency.setValueAtTime(440, ctx.currentTime);
      oscB.frequency.setValueAtTime(480, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(ctx.destination);
      
      oscA.start();
      oscB.start();
      oscA.stop(ctx.currentTime + 1.5);
      oscB.stop(ctx.currentTime + 1.5);
    }
  } catch (err) {
    console.error("Error synthesizing audio:", err);
  }
};

const triggerVibration = (type) => {
  if (!navigator.vibrate) return;
  if (type === 'comercial') {
    navigator.vibrate([600, 200, 600]);
  } else if (type === 'digital') {
    navigator.vibrate([150, 100, 150]);
  } else {
    navigator.vibrate([800, 200, 800, 200, 800]);
  }
};

export const OwnerMode = ({ session }) => {
  const [callStatus, setCallStatus] = useState('idle');
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [homeId, setHomeId] = useState(null);
  
  // Settings (Persisted in localStorage)
  const [appMode, setAppMode] = useState(() => localStorage.getItem('ksm_intercom_app_mode') || 'portero');
  const [ringtoneType, setRingtoneType] = useState(() => localStorage.getItem('ksm_intercom_ringtone') || 'comercial');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('ksm_intercom_sound') !== 'false');
  const [vibrationEnabled, setVibrationEnabled] = useState(() => localStorage.getItem('ksm_intercom_vibration') !== 'false');

  // Background Customizer States
  const [bgType, setBgType] = useState(() => localStorage.getItem('ksm_intercom_bg_type') || 'preset');
  const [bgValue, setBgValue] = useState(() => localStorage.getItem('ksm_intercom_bg_value') || 'preset_1');
  const [customMessage, setCustomMessage] = useState('');
  
  // Call States
  const [isMuted, setIsMuted] = useState(false);

  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const customAudioRef = useRef(null);
  const iceCandidatesBufferRef = useRef([]);

  // Sync settings with localStorage
  useEffect(() => {
    localStorage.setItem('ksm_intercom_app_mode', appMode);
  }, [appMode]);

  useEffect(() => {
    localStorage.setItem('ksm_intercom_ringtone', ringtoneType);
  }, [ringtoneType]);

  useEffect(() => {
    localStorage.setItem('ksm_intercom_sound', soundEnabled.toString());
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('ksm_intercom_vibration', vibrationEnabled.toString());
  }, [vibrationEnabled]);

  useEffect(() => {
    localStorage.setItem('ksm_intercom_bg_type', bgType);
    localStorage.setItem('ksm_intercom_bg_value', bgValue);
  }, [bgType, bgValue]);

  // Sync background image and mode with active visitors in real-time when it changes
  useEffect(() => {
    if (channelRef.current && homeId) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'bg_sync',
        payload: { type: bgType, value: bgValue, appMode }
      });
    }
  }, [bgType, bgValue, appMode, homeId]);

  // 1. Al abrir la app, buscar a qué "Hogar" pertenece este usuario
  useEffect(() => {
    const fetchHomeId = async () => {
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase
        .from('homes')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();
        
      if (data) {
        setHomeId(data.id);
      } else {
        console.warn("Este usuario no tiene un hogar configurado en la base de datos.");
      }
    };
    fetchHomeId();
  }, [session]);

  // 2. Suscribirse EXCLUSIVAMENTE al canal de su hogar
  useEffect(() => {
    if (!homeId) return;

    channelRef.current = supabase.channel(homeId)
      .on('broadcast', { event: 'ring_doorbell' }, ({ payload }) => {
        if (appMode === 'comercio') {
          // Comercio Mode: simple ring and notify
          if (soundEnabled) playRingSound(ringtoneType, customAudioRef);
          if (vibrationEnabled) triggerVibration(ringtoneType);
          
          channelRef.current.send({
            type: 'broadcast',
            event: 'doorbell_status',
            payload: { status: 'notified' }
          });
          
          setCallStatus('ringing_comercio');
        } else {
          // Portero Mode: full WebRTC
          setIncomingOffer(payload.offer);
          setCallStatus('ringing');
        }
      })
      .on('broadcast', { event: 'webrtc_ice' }, async ({ payload }) => {
        if (payload.target === 'owner') {
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            iceCandidatesBufferRef.current.push(payload.candidate);
          }
        }
      })
      .on('broadcast', { event: 'request_bg' }, () => {
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'bg_sync',
            payload: { type: bgType, value: bgValue, appMode }
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelRef.current);
    };
  }, [homeId, appMode, soundEnabled, vibrationEnabled, ringtoneType, bgType, bgValue]);

  // 3. Ringtone and Vibration loop during incoming portero call
  useEffect(() => {
    if (callStatus !== 'ringing' && callStatus !== 'ringing_comercio') return;

    const ringLoop = () => {
      if (soundEnabled) playRingSound(ringtoneType, customAudioRef);
      if (vibrationEnabled) triggerVibration(ringtoneType);
    };

    ringLoop();
    const interval = setInterval(ringLoop, 3000);

    return () => {
      clearInterval(interval);
      if (customAudioRef.current) {
        customAudioRef.current.pause();
        customAudioRef.current = null;
      }
    };
  }, [callStatus, soundEnabled, vibrationEnabled, ringtoneType]);

  const handleAccept = async () => {
    setCallStatus('connected');
    setIsMuted(false);

    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current = null;
    }

    // 1. Crear conexión
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // 2. Enviar ICE
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc_ice',
          payload: { candidate: event.candidate, target: 'visitor' }
        });
      }
    };

    // 3. Recibir video del visitante
    pcRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // 4. Encender micrófono
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
    } catch (err) {
      console.warn("No se pudo obtener el micrófono del dueño", err);
    }

    // 5. Responder oferta
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(incomingOffer));

    // Process buffered candidates once remoteDescription is set
    for (const candidate of iceCandidatesBufferRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Error adding buffered candidate on owner", e);
      }
    }
    iceCandidatesBufferRef.current = [];

    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    await channelRef.current.send({
      type: 'broadcast',
      event: 'webrtc_answer',
      payload: { answer }
    });
  };

  const handleReject = () => {
    setCallStatus('idle');
    setIncomingOffer(null);
    setIsMuted(false);

    if (customAudioRef.current) {
      customAudioRef.current.pause();
      customAudioRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  // Mute / Unmute Track logic
  const handleToggleMute = () => {
    if (pcRef.current) {
      const localSender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (localSender && localSender.track) {
        localSender.track.enabled = isMuted; // Enable if it was muted
        setIsMuted(!isMuted);
      }
    }
  };

  // Quick Message Broadcaster
  const handleSendMessage = (messageText) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'owner_message',
      payload: { text: messageText }
    });
    alert(`Mensaje enviado al visitante: "${messageText}"`);
  };

  // Compressed Image Uploader
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas to scale and highly compress the custom image
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Highly compressed Base64 JPEG data (~15KB)
        const base64 = canvas.toDataURL('image/jpeg', 0.5);
        setBgType('custom');
        setBgValue(base64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      try {
        localStorage.setItem('ksm_intercom_custom_ringtone_data', base64);
        localStorage.setItem('ksm_intercom_custom_ringtone_name', file.name);
        setRingtoneType('custom');
        alert(`Ringtone "${file.name}" cargado con éxito.`);
      } catch (err) {
        alert("El archivo de audio es demasiado grande. Por favor, selecciona un archivo más corto (menor a 2MB).");
      }
    };
    reader.readAsDataURL(file);
  };

  // Standalone QR and URL Utilities
  const getVisitorUrl = () => {
    const baseUrl = import.meta.env.VITE_VISITOR_BASE_URL || window.location.origin;
    return `${baseUrl}/?home_id=${homeId}`;
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(getVisitorUrl());
    alert("¡Enlace del visitante copiado al portapapeles! Listo para enviar por WhatsApp.");
  };

  const handleShareUrl = () => {
    const text = `¡Hola! Puedes tocar el timbre virtual ingresando a este enlace: ${getVisitorUrl()}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleViewQr = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getVisitorUrl())}`;
    window.open(qrUrl, '_blank');
  };

  const handleTestSound = () => {
    playRingSound(ringtoneType, customAudioRef);
    triggerVibration(ringtoneType);
  };

  const getBgStyle = () => {
    if (bgType === 'custom') {
      return { backgroundImage: `url(${bgValue})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    return { background: presets[bgValue] || presets.preset_1 };
  };

  // Render Screens
  if (callStatus === 'idle') {
    const visitorUrl = homeId ? getVisitorUrl() : '';
    const qrCodeUrl = homeId ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(visitorUrl)}` : '';

    return (
      <div className={styles.owner} style={getBgStyle()}>
        <div className={styles.owner__screen_area}>
          <div className={styles.owner__dashboard}>
            
            <div className={styles.owner__title_area}>
              <h1 className={styles.owner__main_title}>KSM Intercom Pro</h1>
              <p className={styles.owner__subtitle}>Panel de Control & Configuración</p>
            </div>

            {/* Card 1: Mode Selector */}
            <div className={styles.owner__card}>
              <span className={styles.owner__card_title}>Modo de Operación</span>
              <div className={styles.owner__pill_group}>
                <button 
                  className={`${styles.owner__pill_btn} ${appMode === 'portero' ? styles['owner__pill_btn--active'] : ''}`}
                  onClick={() => setAppMode('portero')}
                >
                  🚪 Portero (Videollamada)
                </button>
                <button 
                  className={`${styles.owner__pill_btn} ${appMode === 'comercio' ? styles['owner__pill_btn--active'] : ''}`}
                  onClick={() => setAppMode('comercio')}
                >
                  🏪 Comercio (Solo Timbre)
                </button>
              </div>
            </div>

            {/* Card 2: Custom Background Picker */}
            <div className={styles.owner__card}>
              <span className={styles.owner__card_title}>Fondo de Pantalla</span>
              <div className={styles.owner__row}>
                <span className={styles.owner__label}>Fondo Integrado</span>
                <select 
                  className={styles.owner__select}
                  value={bgType === 'preset' ? bgValue : 'custom'} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      if (fileInputRef.current) fileInputRef.current.click();
                    } else {
                      setBgType('preset');
                      setBgValue(val);
                    }
                  }}
                >
                  <option value="preset_1">🌌 Carbono Oscuro</option>
                  <option value="preset_2">🔵 Azul Espacial</option>
                  <option value="preset_3">🌆 Atardecer Moderno</option>
                  <option value="preset_4">⚪ Blanco Plástico</option>
                  <option value="custom">📁 [ Subir Foto Personalizada ]</option>
                </select>
              </div>

              {/* Hidden Native File Input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                className={styles.owner__file_input} 
                onChange={handleImageUpload}
              />

              {bgType === 'custom' && (
                <div className={styles.owner__row}>
                  <span className={styles.owner__label} style={{ color: '#06d6a0' }}>✓ Foto Personalizada activa</span>
                  <button 
                    className={styles.owner__btn_action} 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => {
                      setBgType('preset');
                      setBgValue('preset_1');
                    }}
                  >
                    Restaurar
                  </button>
                </div>
              )}
            </div>

            {/* Card 3: Alerts Config */}
            <div className={styles.owner__card}>
              <span className={styles.owner__card_title}>Configuración de Alertas</span>
              
              <div className={styles.owner__row}>
                <span className={styles.owner__label}>Tono de Timbre</span>
                <select 
                  className={styles.owner__select}
                  value={ringtoneType} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      if (audioInputRef.current) audioInputRef.current.click();
                    } else {
                      setRingtoneType(val);
                    }
                  }}
                >
                  <option value="clasico">📞 Clásico</option>
                  <option value="digital">📟 Digital</option>
                  <option value="comercial">🔔 Comercial</option>
                  <option value="custom">📁 [ Subir Ringtone Propio ]</option>
                </select>
              </div>

              {/* Hidden Native Audio Input */}
              <input 
                type="file" 
                ref={audioInputRef} 
                accept="audio/*" 
                className={styles.owner__file_input} 
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
              />

              {ringtoneType === 'custom' && (
                <div className={styles.owner__row}>
                  <span className={styles.owner__label} style={{ color: '#06d6a0', fontSize: '0.75rem', maxWidth: '60%', wordBreak: 'break-all' }}>
                    ✓ Ringtone: {localStorage.getItem('ksm_intercom_custom_ringtone_name') || 'Cargado'}
                  </span>
                  <button 
                    className={styles.owner__btn_action} 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => {
                      setRingtoneType('comercial');
                    }}
                  >
                    Restaurar
                  </button>
                </div>
              )}

              <div className={styles.owner__row}>
                <span className={styles.owner__label}>Activar Sonido</span>
                <label className={styles.owner__toggle}>
                  <input 
                    type="checkbox" 
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                  />
                  <span className={styles.owner__slider}></span>
                </label>
              </div>

              <div className={styles.owner__row}>
                <span className={styles.owner__label}>Activar Vibración</span>
                <label className={styles.owner__toggle}>
                  <input 
                    type="checkbox" 
                    checked={vibrationEnabled}
                    onChange={(e) => setVibrationEnabled(e.target.checked)}
                  />
                  <span className={styles.owner__slider}></span>
                </label>
              </div>

              <button className={styles.owner__btn_action} onClick={handleTestSound}>
                🔊 Probar Alerta
              </button>
            </div>

            {/* Card 4: Sharing */}
            {homeId && (
              <div className={styles.owner__card}>
                <span className={styles.owner__card_title}>Acceso Visitantes</span>
                <div className={styles.owner__qr_container}>
                  <img className={styles.owner__qr_image} src={qrCodeUrl} alt="QR de la Casa" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button className={styles.owner__btn_action} onClick={handleCopyUrl}>
                    🔗 Copiar Link
                  </button>
                  <button className={styles.owner__btn_action} onClick={handleShareUrl}>
                    💬 WhatsApp
                  </button>
                </div>
                <button className={`${styles.owner__btn_action} ${styles['owner__btn_action--primary']}`} onClick={handleViewQr}>
                  🖨️ Ver / Imprimir QR
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  // Ringing Comercio Screen
  if (callStatus === 'ringing_comercio') {
    return (
      <div className={styles.owner} style={getBgStyle()}>
        <div className={styles.owner__screen_area}>
          <div className={styles.owner__alert_comercio}>
            <span className={styles.owner__alert_icon}>🔔</span>
            <h2 className={styles.owner__status}>¡CLIENTE EN LA PUERTA!</h2>
            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>El timbre comercial está sonando.</p>
            
            {/* Quick replies for Commerce Mode */}
            <div className={styles.owner__quick_replies}>
              <span className={styles.owner__quick_title}>Responder al Visitante:</span>
              <div className={styles.owner__preset_grid}>
                <button className={styles.owner__btn_preset} onClick={() => handleSendMessage("Ya bajo, aguarde por favor.")}>
                  🚶‍♂️ «Ya bajo, un momento»
                </button>
                <button className={styles.owner__btn_preset} onClick={() => handleSendMessage("Aguarde, estoy en el baño.")}>
                  🚽 «Aguarde, estoy en el baño»
                </button>
                <button className={styles.owner__btn_preset} onClick={() => handleSendMessage("Deje el paquete en la puerta.")}>
                  📦 «Deje el paquete en la puerta»
                </button>
              </div>

              {/* Custom input */}
              <div className={styles.owner__custom_reply_row}>
                <input 
                  type="text" 
                  className={styles.owner__input_reply} 
                  placeholder="Escribir mensaje propio..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
                <button 
                  className={`${styles.owner__btn_action} ${styles['owner__btn_action--primary']}`}
                  onClick={() => {
                    if (customMessage.trim().length > 0) {
                      handleSendMessage(customMessage);
                      setCustomMessage('');
                    }
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>

            <button className={`${styles.owner__btn} ${styles['owner__btn--reject']}`} onClick={handleReject} style={{ marginTop: '2rem' }}>
              ❌
            </button>
          </div>
        </div>
      </div>
    );
  }

  // WebRTC Videocall Screens
  return (
    <div className={styles.owner} style={getBgStyle()}>
      <div className={styles.owner__screen_area}>
        
        <h2 className={styles.owner__status}>
          {callStatus === 'ringing' ? 'Llamada Entrante...' : 'CONECTADO'}
        </h2>

        <div className={styles.owner__camera}>
          {callStatus === 'connected' ? (
            <video 
              ref={remoteVideoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              autoPlay 
              playsInline 
            />
          ) : (
            <div style={{ color: '#555', textAlign: 'center', marginTop: '30%' }}>
              [ Recibiendo señal... ]
            </div>
          )}
        </div>

        {/* Quick replies for Portero Ringing Screen */}
        {callStatus === 'ringing' && (
          <div className={styles.owner__quick_replies} style={{ padding: '0 1rem' }}>
            <span className={styles.owner__quick_title}>Responder sin contestar:</span>
            <div className={styles.owner__preset_grid}>
              <button className={styles.owner__btn_preset} onClick={() => handleSendMessage("Ya bajo, aguarde por favor.")}>
                🚶‍♂️ «Ya bajo, un momento»
              </button>
              <button className={styles.owner__btn_preset} onClick={() => handleSendMessage("Aguarde, estoy en el baño.")}>
                🚽 «Aguarde, estoy en el baño»
              </button>
            </div>
            <div className={styles.owner__custom_reply_row}>
              <input 
                type="text" 
                className={styles.owner__input_reply} 
                placeholder="Mensaje rápido..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
              />
              <button 
                className={`${styles.owner__btn_action} ${styles['owner__btn_action--primary']}`}
                onClick={() => {
                  if (customMessage.trim().length > 0) {
                    handleSendMessage(customMessage);
                    setCustomMessage('');
                  }
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        <div className={styles.owner__controls}>
          {callStatus === 'ringing' && (
            <button className={`${styles.owner__btn} ${styles['owner__btn--accept']}`} onClick={handleAccept}>
              📞
            </button>
          )}
          
          {/* Microphone mute button visible when connected */}
          {callStatus === 'connected' && (
            <button 
              className={`${styles.owner__btn} ${isMuted ? styles['owner__btn--muted'] : styles['owner__btn--mute']}`} 
              onClick={handleToggleMute}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
          )}

          <button className={`${styles.owner__btn} ${styles['owner__btn--reject']}`} onClick={handleReject}>
            ❌
          </button>
        </div>

      </div>
    </div>
  );
};
