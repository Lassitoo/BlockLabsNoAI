import { useState } from 'react';

export default function TestBackend() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

  const testConnection = async () => {
    setLoading(true);
    setResult('Testing connection...');
    
    try {
      const response = await fetch(`${API_URL}/auth/test/`, {
        method: 'GET',
        credentials: 'include',
      });
      
      const data = await response.json();
      setResult(`✅ SUCCESS!\n\n${JSON.stringify(data, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ ERROR: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testLogin = async () => {
    setLoading(true);
    setResult('Testing login endpoint...');
    
    try {
      const response = await fetch(`${API_URL}/auth/test-login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test',
          password: 'test123'
        })
      });
      
      const data = await response.json();
      setResult(`✅ LOGIN TEST SUCCESS!\n\n${JSON.stringify(data, null, 2)}`);
    } catch (error: any) {
      setResult(`❌ LOGIN TEST ERROR: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testRealLogin = async () => {
    setLoading(true);
    setResult('Testing REAL login endpoint...');
    
    try {
      const response = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test',
          password: 'test123'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResult(`✅ REAL LOGIN SUCCESS!\n\n${JSON.stringify(data, null, 2)}`);
      } else {
        setResult(`❌ REAL LOGIN FAILED (${response.status}):\n\n${JSON.stringify(data, null, 2)}`);
      }
    } catch (error: any) {
      setResult(`❌ REAL LOGIN ERROR: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🧪 Backend Connection Test</h1>
      
      <div style={{ background: '#f0f0f0', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h3>API URL:</h3>
        <code style={{ background: '#fff', padding: '10px', display: 'block' }}>
          {API_URL}
        </code>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={testConnection} 
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          1. Test Connection
        </button>

        <button 
          onClick={testLogin} 
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          2. Test Login Endpoint
        </button>

        <button 
          onClick={testRealLogin} 
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          3. Test Real Login
        </button>
      </div>

      {result && (
        <div style={{ 
          background: result.includes('SUCCESS') ? '#d4edda' : '#f8d7da', 
          padding: '15px', 
          borderRadius: '5px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: '14px'
        }}>
          {result}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', background: '#fff3cd', borderRadius: '5px' }}>
        <h3>📝 Instructions:</h3>
        <ol>
          <li><strong>Test Connection</strong> - Vérifie si le backend est accessible</li>
          <li><strong>Test Login Endpoint</strong> - Teste si l'endpoint login reçoit les données</li>
          <li><strong>Test Real Login</strong> - Teste le vrai login (utilisez vos vrais identifiants)</li>
        </ol>
        <p><strong>⚠️ Important:</strong> Faites ces tests dans l'ordre !</p>
      </div>
    </div>
  );
}
