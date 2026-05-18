import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import styles from './VisitorMode.module.css';

export const VisitorMode = ({ mode = 'portero', homeId }) => {
  const [visitorMode, setVisitorMode] = useState(mode);
  const [isRinging, setIsRinging] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [visitorStatus, setVisitorStatus] = useState('idle'); // 'idle', 'calling', 'ringing_comercio'
  const [ownerMessage, setOwnerMessage] = useState(null);
  const [bgStyle, setBgStyle] = useState({});
  
  const videoRef = useRef(null);
  const audioRef = useRef(null); // NUEVO: Para escuchar al dueño
  const streamRef = useRef(null);
  
  // Referencias para WebRTC
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const iceBufferRef = useRef([]);

  // Efecto 1: Encender cámara
  useEffect(() => {
    if (visitorMode === 'portero') {
      const startCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: true 
          });
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setCameraError(null);
        } catch (err) {
          setCameraError('Permiso denegado o sin cámara');
        }
      };
      startCamera();
      return () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      };
    }
  }, [visitorMode]);

  // Efecto 2: Suscribirse a respuestas del propietario (WebRTC) en su canal específico
  useEffect(() => {
    if (!homeId) return;

    // Conectarse al canal ÚNICO de este cliente basado en el QR escaneado
    channelRef.current = supabase.channel(homeId)
      .on('broadcast', { event: 'webrtc_answer' }, async ({ payload }) => {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          // Process buffered candidates once remoteDescription is set
          for (const candidate of iceBufferRef.current) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn("Error adding buffered candidate on visitor", e);
            }
          }
          iceBufferRef.current = [];
        }
      })
      .on('broadcast', { event: 'webrtc_ice' }, async ({ payload }) => {
        if (payload.target === 'visitor' && pcRef.current) {
          if (pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            iceBufferRef.current.push(payload.candidate);
          }
        }
      })
      .on('broadcast', { event: 'doorbell_status' }, ({ payload }) => {
        if (payload.status === 'notified') {
          setVisitorStatus('ringing_comercio');
          setIsRinging(true);
        }
      })
      .on('broadcast', { event: 'bg_sync' }, ({ payload }) => {
        const presets = {
          preset_1: 'linear-gradient(135deg, #0d1b2e, #1a2a3e)',
          preset_2: 'linear-gradient(135deg, #0b1528, #1e3a8a)',
          preset_3: 'linear-gradient(135deg, #2b1055, #7597de)',
          preset_4: 'linear-gradient(135deg, #e5e7eb, #f3f4f6)',
        };
        if (payload.type === 'custom') {
          setBgStyle({ backgroundImage: `url(${payload.value})`, backgroundSize: 'cover', backgroundPosition: 'center' });
        } else {
          setBgStyle({ background: presets[payload.value] || presets.preset_1 });
        }
        if (payload.appMode) {
          setVisitorMode(payload.appMode);
        }
      })
      .on('broadcast', { event: 'owner_message' }, ({ payload }) => {
        setOwnerMessage(payload.text);
      });

    channelRef.current.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current.send({
          type: 'broadcast',
          event: 'request_bg'
        });
      }
    });

    return () => {
      supabase.removeChannel(channelRef.current);
    };
  }, [homeId]);

  const handleRing = async () => {
    setIsRinging(true);
    setVisitorStatus('calling');
    
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc_ice',
          payload: { candidate: event.candidate, target: 'owner' }
        });
      }
    };

    // NUEVO: Escuchar el audio que viene del celular del dueño
    pcRef.current.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
      }
    };

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        pcRef.current.addTrack(track, streamRef.current);
      });
    }

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    await channelRef.current.send({
      type: 'broadcast',
      event: 'ring_doorbell',
      payload: { offer } // Enviamos la oferta de video junto con el timbre
    });

    setTimeout(() => {
      setIsRinging(false);
      setVisitorStatus(prev => prev === 'calling' ? 'idle' : prev);
    }, 6000);
  };

  return (
    <div className={styles.visitor} style={bgStyle}>
      <div className={styles.visitor__device}>
        <div className={styles.visitor__brand}>INTERCOM</div>

        {visitorMode === 'portero' ? (
          <div className={styles.visitor__screen_area}>
            <div className={styles.visitor__camera}>
              {visitorStatus === 'ringing_comercio' && (
                <div className={styles.visitor__comercio_overlay}>
                  <span className={styles.visitor__comercio_icon}>🔔</span>
                  <h3 className={styles.visitor__comercio_title}>Timbre sonando en comercio</h3>
                  <p className={styles.visitor__comercio_desc}>El propietario ha sido notificado.</p>
                </div>
              )}
              {cameraError ? (
                <div style={{ color: '#ef476f', padding: '2rem 1rem', textAlign: 'center', fontFamily: 'monospace' }}>
                  [ {cameraError} ]
                </div>
              ) : (
                <>
                  <video 
                    ref={videoRef}
                    className={styles.visitor__video} 
                    autoPlay 
                    playsInline 
                    muted
                  />
                  {/* Este audio oculto reproduce la voz del dueño */}
                  <audio ref={audioRef} autoPlay playsInline />
                </>
              )}
            </div>
            
            <div className={styles.visitor__controls}>
              <button className={styles.visitor__icon_btn}>👤</button>
              <button 
                className={`${styles.visitor__icon_btn} ${isRinging ? styles['visitor__icon_btn--active'] : ''}`}
                onClick={handleRing}
                style={isRinging ? { color: 'var(--color-led-ring)' } : {}}
              >
                {isRinging ? '📞' : '◉'}
              </button>
              <button className={styles.visitor__icon_btn}>🗝️</button>
              <button className={styles.visitor__icon_btn}>⊞</button>
            </div>
          </div>
        ) : (
          <div className={styles.visitor__bell_mode}>
            <button 
              className={`${styles.visitor__btn_big} ${isRinging ? styles['visitor__btn_big--ringing'] : ''}`}
              onClick={handleRing}
            >
              <span style={{ fontSize: '3rem' }}>🔔</span>
            </button>
            <p className={`${styles.visitor__status_text} ${visitorStatus === 'ringing_comercio' ? styles['visitor__status_text--active'] : ''}`}>
              {visitorStatus === 'ringing_comercio' ? '🔔 ¡Timbre sonando!' : isRinging ? 'Llamando...' : 'Toque el Timbre'}
            </p>
          </div>
        )}

        {ownerMessage && (
          <div className={styles.visitor__message_bubble}>
            <p className={styles.visitor__message_text}>
              "{ownerMessage}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
