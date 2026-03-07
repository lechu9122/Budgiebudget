import React from 'react';
import { BudgetItem } from '../types';

interface BudgetItemCardProps {
  item: BudgetItem;
  onEdit: () => void;
  onDelete: () => void;
}

const BudgetItemCard: React.FC<BudgetItemCardProps> = ({ item, onEdit, onDelete }) => (
  <div
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <div>
      <strong>{item.category}</strong>
      {item.description && (
        <span style={{ marginLeft: 8, color: '#718096' }}>{item.description}</span>
      )}
      <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>{item.date}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontWeight: 'bold', color: '#e53e3e' }}>${item.amount.toFixed(2)}</span>
      <button onClick={onEdit} style={{ padding: '4px 10px' }}>
        Edit
      </button>
      <button
        onClick={onDelete}
        style={{ padding: '4px 10px', background: '#fed7d7', border: 'none', cursor: 'pointer', borderRadius: 4 }}
      >
        Delete
      </button>
    </div>
  </div>
);

export default BudgetItemCard;
