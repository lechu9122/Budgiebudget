import React, { useState } from 'react';
import { getAiAdvice } from '../services/api';

const AiAdvisor: React.FC = () => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdvice = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAiAdvice();
      setAdvice(result.advice);
    } catch {
      setError('Could not fetch AI advice. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 32,
        padding: 20,
        border: '2px solid #4f46e5',
        borderRadius: 10,
        background: '#f5f3ff',
      }}
    >
      <h2 style={{ margin: '0 0 12px', color: '#4f46e5' }}>🤖 AI Budget Advisor</h2>
      <p style={{ color: '#4a5568', marginBottom: 16 }}>
        Get personalized advice on how to optimize your spending.
      </p>
      <button
        onClick={fetchAdvice}
        disabled={loading}
        style={{
          padding: '8px 18px',
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        {loading ? 'Thinking…' : 'Get Advice'}
      </button>
      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
      {advice && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: '#fff',
            borderRadius: 6,
            borderLeft: '4px solid #4f46e5',
          }}
        >
          <p style={{ margin: 0 }}>{advice}</p>
        </div>
      )}
    </div>
  );
};

export default AiAdvisor;
