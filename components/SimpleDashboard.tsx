export default function SimpleDashboard() {
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
      minHeight: '100vh',
      color: 'white'
    }}>
      <h1>🎯 Simple Dashboard</h1>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '20px',
        borderRadius: '10px',
        margin: '20px 0'
      }}>
        <h2>✅ Dashboard Component Working!</h2>
        <p>This is a simplified Dashboard component.</p>
        <p>If you can see this, the Dashboard import is working correctly!</p>
      </div>
      
      <h3>Dashboard Features:</h3>
      <ul>
        <li>✅ Component import works</li>
        <li>✅ Styling works</li>
        <li>✅ Content rendering works</li>
        <li>🔄 Ready to add complex features</li>
      </ul>
      
      <p><strong>Current Time:</strong> {new Date().toLocaleString()}</p>
    </div>
  );
}
