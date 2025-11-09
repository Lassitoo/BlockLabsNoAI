export default function CheckConfig() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'NOT SET';
  
  return (
    <div style={{ padding: '40px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔧 Configuration Check</h1>
      
      <div style={{ background: '#f0f0f0', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h2>Environment Variable:</h2>
        <div style={{ background: '#fff', padding: '15px', borderRadius: '5px', marginTop: '10px' }}>
          <strong>NEXT_PUBLIC_API_URL:</strong>
          <div style={{ fontSize: '18px', color: '#0070f3', marginTop: '10px', wordBreak: 'break-all' }}>
            {apiUrl}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff3cd', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h3>✅ Valeur attendue:</h3>
        <code style={{ background: '#fff', padding: '10px', display: 'block', marginTop: '10px' }}>
          https://skill-sensors-adopt-cork.trycloudflare.com/api
        </code>
        
        <h3 style={{ marginTop: '20px' }}>❌ Si vous voyez autre chose:</h3>
        <p>Le serveur Next.js n'a pas été redémarré après la modification du .env.local</p>
        <ol>
          <li>Arrêtez Next.js (Ctrl+C)</li>
          <li>Supprimez le dossier .next</li>
          <li>Relancez: npm run dev</li>
        </ol>
      </div>

      <div style={{ background: '#d4edda', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h3>🧪 Test rapide:</h3>
        <p>Cliquez sur ce lien pour tester le backend directement:</p>
        <a 
          href="https://skill-sensors-adopt-cork.trycloudflare.com/api/auth/test/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ 
            display: 'inline-block',
            padding: '10px 20px',
            background: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '5px',
            marginTop: '10px'
          }}
        >
          Tester le backend
        </a>
        <p style={{ marginTop: '15px', fontSize: '14px' }}>
          Vous devriez voir un JSON avec "status": "SUCCESS"
        </p>
      </div>
    </div>
  );
}
