import React, { useEffect, useState } from 'react';
import BudgetItemCard from '../components/BudgetItemCard';
import BudgetForm from '../components/BudgetForm';
import AiAdvisor from '../components/AiAdvisor';
import {
  getBudgetItems,
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
} from '../services/api';
import { BudgetItem, BudgetItemPayload } from '../types';

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    try {
      setItems(await getBudgetItems());
    } catch {
      setError('Failed to load budget items.');
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  const handleCreate = async (payload: BudgetItemPayload) => {
    try {
      const newItem = await createBudgetItem(payload);
      setItems((prev) => [...prev, newItem]);
    } catch {
      setError('Failed to create item.');
    }
  };

  const handleUpdate = async (payload: BudgetItemPayload) => {
    if (!editing) return;
    try {
      const updated = await updateBudgetItem(editing.id, payload);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditing(null);
    } catch {
      setError('Failed to update item.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBudgetItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError('Failed to delete item.');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🦜 BudgieBudget Dashboard</h1>
        <button onClick={onLogout} style={{ padding: '6px 12px' }}>
          Sign Out
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section>
        <h2>
          Total Spending:{' '}
          <span style={{ color: total > 0 ? '#e53e3e' : '#38a169' }}>
            ${total.toFixed(2)}
          </span>
        </h2>
      </section>

      <section>
        <h2>{editing ? 'Edit Budget Item' : 'Add Budget Item'}</h2>
        <BudgetForm
          initialValues={editing ?? undefined}
          onSubmit={editing ? handleUpdate : handleCreate}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </section>

      <section>
        <h2>Your Budget Items</h2>
        {items.length === 0 ? (
          <p>No items yet. Add your first budget entry above!</p>
        ) : (
          items.map((item) => (
            <BudgetItemCard
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))
        )}
      </section>

      <section>
        <AiAdvisor />
      </section>
    </div>
  );
};

export default Dashboard;
