import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

export const Login = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [homeName, setHomeName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isRegistering) {
      // 1. Registro de Usuario
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (authData.user) {
        // 2. Creación automática de su "Hogar"
        const { error: dbError } = await supabase.from('homes').insert([{ 
          owner_id: authData.user.id, 
          name: homeName || 'Mi Casa'
        }]);

        if (dbError) {
          setError("Error creando la casa: " + dbError.message);
        } else {
          setSuccess("¡Cuenta creada! Ya puedes ingresar.");
          setIsRegistering(false); // Pasamos a modo Login
          setPassword('');
        }
      }
    } else {
      // Login Normal
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        navigate('/owner');
      }
    }
    
    setLoading(false);
  };

  return (
    <div className={styles.login}>
      <form className={styles.login__box} onSubmit={handleAuth}>
        <h2 className={styles.login__title}>
          {isRegistering ? 'CREAR NUEVA CUENTA' : 'ACCESO PROPIETARIOS'}
        </h2>
        
        {error && <p className={styles.login__error}>{error}</p>}
        {success && <p style={{ color: '#06d6a0', textAlign: 'center', fontSize: '0.9rem' }}>{success}</p>}
        
        {isRegistering && (
          <input 
            type="text" 
            placeholder="Nombre de la Casa (Ej: Familia Pérez)" 
            className={styles.login__input}
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            required
          />
        )}

        <input 
          type="email" 
          placeholder="Correo Electrónico" 
          className={styles.login__input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <input 
          type="password" 
          placeholder="Contraseña" 
          className={styles.login__input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        
        <button type="submit" className={styles.login__btn} disabled={loading}>
          {loading ? 'PROCESANDO...' : (isRegistering ? 'REGISTRAR MI CASA' : 'ENTRAR AL INTERCOM')}
        </button>

        <button 
          type="button" 
          onClick={() => { setIsRegistering(!isRegistering); setError(null); setSuccess(null); }}
          style={{ background: 'none', border: 'none', color: '#3a86ff', cursor: 'pointer', marginTop: '1rem' }}
        >
          {isRegistering ? '¿Ya tienes cuenta? Inicia sesión aquí' : '¿Cliente nuevo? Registra tu casa aquí'}
        </button>
      </form>
    </div>
  );
};
