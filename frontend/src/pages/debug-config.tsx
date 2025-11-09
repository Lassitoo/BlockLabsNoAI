// Debug page to check configuration
import { useEffect, useState } from 'react';

export default function DebugConfig() {
  const [apiUrl, setApiUrl] = useState('');
  const [testResult, setTestResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get the API URL from environment
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    setApiUrl(url);
  }, []);

  const testConnection = async () => {
    setLoading(true);
    setTestResult('Testing...');
    
    try {
      const response = await fetch(`${apiUrl}/auth/csrf/`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTestResult(`✅ SUCCESS! Status: ${response.status}\nData: ${JSON.stringify(data, null, 2)}`);
      } else {
        setTestResult(`❌ FAILED! Status: ${response.status}\nError: ${response.statusText}`);
      }
    } catch (error: any) {
      setTestResult(`❌ ERROR: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔍 Configuration Debug</h1>
      
      <div style={{ background: '#f0f0f0', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h2>Environment Variables</h2>
        <p><strong>NEXT_PUBLIC_API_URL:</strong></p>
        <code style={{ background: '#fff', padding: '10px', display: 'block', marginTop: '10px' }}>
          {apiUrl}
        </code>
      </div>

      <div style={{ background: '#f0f0f0', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <h2>Current Location</h2>
        <p><strong>Window Location:</strong></p>
        <code style={{ background: '#fff', padding: '10px', display: 'block', marginTop: '10px' }}>
          {typeof window !== 'undefined' ? window.location.href : 'N/A'}
        </code>
      </div>

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
        {loading ? 'Testing...' : 'Test API Connection'}
      </button>

      {testResult && (
        <div style={{ 
          background: testResult.includes('SUCCESS') ? '#d4edda' : '#f8d7da', 
          padding: '15px', 
          marginTop: '20px',
          borderRadius: '5px',
          whiteSpace: 'pre-wrap'
        }}>
          <h3>Test Result:</h3>
          <pre>{testResult}</pre>
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', background: '#fff3cd', borderRadius: '5px' }}>
        <h3>⚠️ Troubleshooting Checklist:</h3>
        <ul>
          <li>✅ .env.local file exists with NEXT_PUBLIC_API_URL</li>
          <li>✅ Next.js server was restarted after changing .env.local</li>
          <li>✅ Django server is running</li>
          <li>✅ Both Cloudflare tunnels are active</li>
          <li>✅ CORS is configured in Django settings.py</li>
        </ul>
      </div>
    </div>
  );
}
