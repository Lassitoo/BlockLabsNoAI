import { useState } from 'react';

export default function FullDiagnostic() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : '🔍';
    setLogs(prev => [...prev, `${emoji} ${message}`]);
  };

  const clearLogs = () => setLogs([]);

  const fullTest = async () => {
    clearLogs();
    setLoading(true);
    
    try {
      // Test 1: Vérifier l'URL de l'API
      addLog(`API URL configurée: ${API_URL}`, 'info');
      addLog(`Window location: ${window.location.href}`, 'info');
      
      // Test 2: Test de connexion basique
      addLog('--- TEST 1: Connexion au backend ---', 'info');
      try {
        const testResponse = await fetch(`${API_URL}/auth/test/`, {
          method: 'GET',
          credentials: 'include',
        });
        
        if (testResponse.ok) {
          const testData = await testResponse.json();
          addLog(`Backend accessible! Status: ${testResponse.status}`, 'success');
          addLog(`Origin détecté par backend: ${testData.origin}`, 'info');
          addLog(`Host détecté: ${testData.host}`, 'info');
        } else {
          addLog(`Backend non accessible! Status: ${testResponse.status}`, 'error');
          return;
        }
      } catch (error: any) {
        addLog(`Erreur de connexion au backend: ${error.message}`, 'error');
        return;
      }

      // Test 3: Vérifier les cookies avant login
      addLog('--- TEST 2: Cookies avant login ---', 'info');
      addLog(`Cookies actuels: ${document.cookie || 'Aucun cookie'}`, 'info');

      // Test 4: Tester l'endpoint de login
      addLog('--- TEST 3: Tentative de login ---', 'info');
      addLog('Entrez vos identifiants ci-dessous et cliquez sur "Login avec identifiants"', 'info');
      
    } catch (error: any) {
      addLog(`Erreur générale: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testLogin = async (username: string, password: string) => {
    if (!username || !password) {
      addLog('Veuillez entrer un nom d\'utilisateur et un mot de passe', 'error');
      return;
    }

    setLoading(true);
    addLog(`Tentative de login avec: ${username}`, 'info');
    
    try {
      const response = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });

      addLog(`Réponse reçue: Status ${response.status}`, 'info');
      
      // Vérifier les headers de réponse
      const setCookieHeader = response.headers.get('Set-Cookie');
      addLog(`Header Set-Cookie: ${setCookieHeader || 'Aucun'}`, 'info');
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        addLog(`Login réussi! User: ${data.user.username}`, 'success');
        addLog(`Role: ${data.user.role}`, 'success');
        
        // Vérifier les cookies après login
        setTimeout(() => {
          addLog(`Cookies après login: ${document.cookie || 'Aucun cookie'}`, 'info');
          
          // Test de vérification de session
          testSession();
        }, 500);
      } else {
        addLog(`Login échoué: ${data.error || 'Erreur inconnue'}`, 'error');
        addLog(`Réponse complète: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error: any) {
      addLog(`Erreur lors du login: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testSession = async () => {
    addLog('--- TEST 4: Vérification de la session ---', 'info');
    
    try {
      const response = await fetch(`${API_URL}/auth/user/`, {
        method: 'GET',
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.authenticated) {
        addLog(`Session valide! User: ${data.user.username}`, 'success');
        addLog(`La connexion fonctionne correctement!`, 'success');
      } else {
        addLog(`Session non authentifiée - Les cookies ne sont pas transmis!`, 'error');
        addLog(`Problème: Les cookies de session ne sont pas envoyés au backend`, 'error');
      }
    } catch (error: any) {
      addLog(`Erreur lors de la vérification de session: ${error.message}`, 'error');
    }
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '900px', margin: '0 auto' }}>
      <h1>🔬 Diagnostic Complet de Connexion</h1>
      
      <div style={{ background: '#f0f0f0', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h3>Configuration:</h3>
        <p><strong>API URL:</strong> <code>{API_URL}</code></p>
        <p><strong>Current URL:</strong> <code>{typeof window !== 'undefined' ? window.location.href : 'N/A'}</code></p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={fullTest} 
          disabled={loading}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '10px',
            width: '100%'
          }}
        >
          {loading ? 'Test en cours...' : '1. Lancer le diagnostic'}
        </button>
      </div>

      <div style={{ background: '#f9f9f9', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h3>2. Tester le login:</h3>
        <input 
          type="text" 
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            fontSize: '16px',
            borderRadius: '5px',
            border: '1px solid #ccc'
          }}
        />
        <input 
          type="password" 
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            fontSize: '16px',
            borderRadius: '5px',
            border: '1px solid #ccc'
          }}
        />
        <button 
          onClick={() => testLogin(username, password)} 
          disabled={loading || !username || !password}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (loading || !username || !password) ? 'not-allowed' : 'pointer',
            width: '100%'
          }}
        >
          Login avec identifiants
        </button>
      </div>

      <div style={{ 
        background: '#1e1e1e', 
        color: '#00ff00',
        padding: '15px', 
        borderRadius: '5px',
        fontFamily: 'Courier New, monospace',
        fontSize: '14px',
        maxHeight: '500px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap'
      }}>
        <h3 style={{ color: '#00ff00', marginTop: 0 }}>📋 Logs:</h3>
        {logs.length === 0 ? (
          <p>Cliquez sur "Lancer le diagnostic" pour commencer...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '5px' }}>{log}</div>
          ))
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '15px', background: '#fff3cd', borderRadius: '5px' }}>
        <h3>📝 Instructions:</h3>
        <ol>
          <li>Cliquez sur <strong>"Lancer le diagnostic"</strong> pour tester la connexion au backend</li>
          <li>Entrez vos <strong>vrais identifiants</strong> dans les champs ci-dessus</li>
          <li>Cliquez sur <strong>"Login avec identifiants"</strong></li>
          <li>Regardez les logs pour voir où ça bloque</li>
        </ol>
        <p><strong>⚠️ Important:</strong> Copiez-moi TOUS les logs affichés après le test!</p>
      </div>
    </div>
  );
}
