'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Parent, MonthlyPayment, LineItem, PaymentMethod, ParentStatus, RateType, Team, TEAMS, RATE_CONFIG, CatalogItem } from '@/lib/flight-types';
import { teamConfig } from '@/lib/team-config';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Users, DollarSign, AlertCircle, TrendingUp, Search, ChevronDown, MessageSquare, RefreshCw, FileText, UserPlus, Zap, X, Check, Loader2 } from 'lucide-react';

// ============ HELPERS ============

function getMonthColumns(): { key: string; label: string; shortLabel: string }[] {
  const now = new Date();
  const months: { key: string; label: string; shortLabel: string }[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const shortLabel = d.toLocaleString('default', { month: 'short' });
    months.push({ key, label, shortLabel });
  }
  return months;
}

function getMonthlyRate(parent: Parent): number {
  if (parent.rateType === 'custom' && parent.customRate != null) return parent.customRate;
  return RATE_CONFIG[parent.rateType || 'regular']?.amount || parent.monthlyRate || 95;
}

function getDefaultDueDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  return next.toISOString().split('T')[0];
}

function getDefaultMessage(overdueMonths: string[]): string {
  const monthNames = overdueMonths.map(m => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' });
  });
  const now = new Date();
  const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  const nextDueStr = `${String(nextDue.getDate()).padStart(2, '0')} ${nextDue.toLocaleString('default', { month: 'short' })}`;
  return `- ${monthNames.join(', ')} Monthly club dues\n- Next Club fee is due on ${nextDueStr}\n- If payment arrangement is needed, please do not hesitate to reach out to Jonas at 303.908.6810.`;
}

const METHOD_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  square: { label: 'Square', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  zelle: { label: 'Zelle', bg: 'bg-purple-500/20', text: 'text-purple-400' },
  cash: { label: 'Cash', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  check: { label: 'Check', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
};

const METHOD_SHORT: Record<string, { label: string; color: string }> = {
  square: { label: 'S', color: 'bg-blue-600' },
  zelle: { label: 'Z', color: 'bg-purple-600' },
  cash: { label: 'C', color: 'bg-emerald-600' },
  check: { label: 'Ch', color: 'bg-yellow-600' },
};

const STATUS_COLORS: Record<ParentStatus, { bg: string; text: string; label: string; dot: string }> = {
  active: { bg: 'bg-success/10', text: 'text-success', label: 'Active', dot: 'bg-success' },
  on_break: { bg: 'bg-warning/10', text: 'text-warning', label: 'On Break', dot: 'bg-warning' },
  exempt: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Exempt', dot: 'bg-blue-500' },
  inactive: { bg: 'bg-text-muted/10', text: 'text-text-muted', label: 'Inactive', dot: 'bg-text-muted' },
};

// ============ MAIN DASHBOARD ============

export default function DashboardPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'owes' | 'paid'>('all');
  const [statusFilter, setStatusFilter] = useState<ParentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Modal states
  const [paymentDropdown, setPaymentDropdown] = useState<{ parentId: string; month: string } | null>(null);
  const [editModal, setEditModal] = useState<Parent | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [addChargeModal, setAddChargeModal] = useState<Parent | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<Parent | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Batch invoice queue
  const [pendingInvoices, setPendingInvoices] = useState<Array<{
    parentId: string;
    firstName: string;
    lastName: string;
    phone: string;
    invoiceId: string;
    total: number;
    months: string[];
    publicUrl?: string;
  }>>([]);
  const [showBatchSend, setShowBatchSend] = useState(false);
  const [sentInvoices, setSentInvoices] = useState<Set<string>>(new Set());
  const [resendLoading, setResendLoading] = useState(false);

  // Existing unpaid invoices from Square
  const [existingInvoices, setExistingInvoices] = useState<Map<string, { invoiceId: string; publicUrl: string; amount: number; name: string }>>(new Map());
  const [textingParent, setTextingParent] = useState<string | null>(null);

  const monthColumns = getMonthColumns();
  const currentMonth = monthColumns[2].key;

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const parentsRef = collection(db, 'parents');
      const snapshot = await getDocs(parentsRef);
      if (snapshot.empty) { setParents([]); return; }
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as Parent[];
      setParents(data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load existing unpaid invoices from Square on mount
  const loadExistingInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/square/invoice/list-published');
      const data = await res.json();
      if (data.success && data.invoices) {
        const map = new Map<string, { invoiceId: string; publicUrl: string; amount: number; name: string }>();
        for (const inv of data.invoices) {
          const phone = inv.phone.replace(/\D/g, '').replace(/^1/, '');
          if (!map.has(phone)) {
            map.set(phone, { invoiceId: inv.invoiceId, publicUrl: inv.publicUrl, amount: inv.amount, name: inv.name });
          }
        }
        setExistingInvoices(map);
      }
    } catch (err) {
      console.error('Failed to load existing invoices:', err);
    }
  }, []);

  useEffect(() => { loadExistingInvoices(); }, [loadExistingInvoices]);

  // Calculate balance
  const getBalance = (parent: Parent): number => {
    const rate = getMonthlyRate(parent);
    const payments = parent.payments || {};
    const status = parent.status || 'active';
    if (status === 'exempt' || status === 'inactive') return 0;

    let unpaidMonths = 0;
    for (const col of monthColumns) {
      const p = payments[col.key];
      if (!p || p.status !== 'paid') {
        if (status === 'on_break') continue;
        unpaidMonths++;
      }
    }

    const unpaidExtras = (parent.lineItems || [])
      .filter(li => li.status !== 'paid')
      .reduce((sum, li) => sum + li.amount, 0);

    return (unpaidMonths * rate) + unpaidExtras;
  };

  // Get overdue months
  const getOverdueMonths = (parent: Parent): string[] => {
    const payments = parent.payments || {};
    return monthColumns
      .filter(col => {
        const p = payments[col.key];
        return !p || p.status !== 'paid';
      })
      .map(col => col.key);
  };

  // Batch create all drafts
  const [batchCreating, setBatchCreating] = useState(false);
  const createAllDrafts = async () => {
    const eligible = parents.filter(p => {
      const status = p.status || 'active';
      if (status !== 'active') return false;
      if (!p.phone) return false;
      if (getBalance(p) <= 0) return false;
      if (pendingInvoices.some(pi => pi.parentId === p.id)) return false;
      return true;
    });

    if (eligible.length === 0) {
      showNotification('No families need invoices', 'error');
      return;
    }

    if (!confirm(`Create ${eligible.length} draft invoices? (Parents won't see these until you Send All Texts)`)) return;

    setBatchCreating(true);
    let created = 0;
    let failed = 0;
    const dueDateInput = prompt('Due date for invoices (YYYY-MM-DD):', getDefaultDueDate());
    if (!dueDateInput) { setBatchCreating(false); return; }
    const dueDate = dueDateInput;

    for (const parent of eligible) {
      try {
        const rate = getMonthlyRate(parent);
        const overdueMonths = getOverdueMonths(parent);
        const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
        const message = getDefaultMessage(overdueMonths);

        const lineItems: Array<{ description: string; amount: number; quantity: number }> = [];
        for (const month of overdueMonths) {
          const [y, mo] = month.split('-');
          const monthLabel = new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
          lineItems.push({ description: `Monthly Fee - ${monthLabel}`, amount: rate, quantity: 1 });
        }
        for (const extra of unpaidExtras) {
          lineItems.push({ description: extra.description, amount: extra.amount, quantity: 1 });
        }

        const total = (overdueMonths.length * rate) + unpaidExtras.reduce((s, li) => s + li.amount, 0);

        const res = await fetch('/api/square/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: parent.phone,
            customerId: parent.squareCustomerId,
            lineItems,
            message,
            dueDate,
            playerName: (parent.playerNames || []).join(', ') || parent.firstName,
            parentFirstName: parent.firstName,
            parentLastName: parent.lastName,
            billingMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          }),
        });

        const data = await res.json();
        if (data.success && data.invoiceId) {
          setPendingInvoices(prev => [...prev, {
            parentId: parent.id,
            firstName: parent.firstName,
            lastName: parent.lastName,
            phone: parent.phone || '',
            invoiceId: data.invoiceId,
            total,
            months: overdueMonths,
          }]);
          created++;
        } else {
          console.error(`Failed for ${parent.firstName}:`, data.error);
          failed++;
        }
      } catch (err) {
        console.error(`Error for ${parent.firstName}:`, err);
        failed++;
      }
    }

    setBatchCreating(false);
    showNotification(`Created ${created} drafts${failed > 0 ? `, ${failed} failed` : ''}`, failed > 0 ? 'error' : 'success');
  };

  // Filter parents
  const filteredParents = parents.filter(p => {
    if (statusFilter !== 'all' && (p.status || 'active') !== statusFilter) return false;
    if (statusFilter === 'all' && (p.status === 'inactive')) return false;
    if (filter === 'owes') return getBalance(p) > 0;
    if (filter === 'paid') return getBalance(p) === 0;
    if (search) {
      const q = search.toLowerCase();
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const players = (p.playerNames || []).join(' ').toLowerCase();
      return name.includes(q) || players.includes(q);
    }
    return true;
  });

  // Stats
  const activeParents = parents.filter(p => (p.status || 'active') === 'active');
  const totalFamilies = activeParents.length;
  const paidThisMonth = activeParents.filter(p => p.payments?.[currentMonth]?.status === 'paid').length;
  const outstanding = totalFamilies - paidThisMonth;
  const totalOwed = activeParents.reduce((sum, p) => sum + getBalance(p), 0);

  // Mark payment
  const markPayment = async (parentId: string, month: string, method: PaymentMethod) => {
    try {
      const parentRef = doc(db, 'parents', parentId);
      await updateDoc(parentRef, {
        [`payments.${month}`]: {
          status: 'paid',
          method,
          paidAt: new Date().toISOString(),
        },
      });
      setParents(prev => prev.map(p =>
        p.id === parentId
          ? { ...p, payments: { ...p.payments, [month]: { status: 'paid', method, paidAt: new Date().toISOString() } } }
          : p
      ));
      setPaymentDropdown(null);
      showNotification(`Marked as paid (${method})`, 'success');
    } catch (error) {
      console.error('Error marking payment:', error);
      showNotification('Failed to mark payment', 'error');
    }
  };

  // Undo payment
  const undoPayment = async (parentId: string, month: string) => {
    if (!confirm('Mark this month as unpaid?')) return;
    try {
      const parentRef = doc(db, 'parents', parentId);
      await updateDoc(parentRef, {
        [`payments.${month}`]: { status: 'unpaid', method: null, paidAt: null },
      });
      setParents(prev => prev.map(p =>
        p.id === parentId
          ? { ...p, payments: { ...p.payments, [month]: { status: 'unpaid', method: null, paidAt: null } } }
          : p
      ));
      showNotification('Payment undone', 'success');
    } catch (error) {
      console.error('Error undoing payment:', error);
    }
  };

  // Update parent status
  const updateStatus = async (parentId: string, status: ParentStatus) => {
    try {
      const parentRef = doc(db, 'parents', parentId);
      await updateDoc(parentRef, { status });
      setParents(prev => prev.map(p => p.id === parentId ? { ...p, status } : p));
      showNotification(`Status changed to ${STATUS_COLORS[status].label}`, 'success');
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Sync with Square
  const syncWithSquare = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/square/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        const s = data.summary;
        showNotification(
          `Synced! ${s.paidCount} paid ($${s.paidTotal}) · ${s.unpaidCount} unpaid ($${s.unpaidTotal}) · ${s.monthsMarked} months marked`,
          'success'
        );
        loadData();
        loadExistingInvoices();
      } else {
        showNotification(`Sync failed: ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Assign teams
  const assignTeams = async () => {
    if (!confirm('Assign teams to all families based on roster?')) return;
    setMigrating(true);
    try {
      const response = await fetch('/api/migrate', { method: 'PUT' });
      const data = await response.json();
      if (data.success) {
        showNotification(`Teams assigned: ${data.updated} updated, ${data.unmatched} unmatched`, 'success');
        loadData();
      } else {
        showNotification('Team assignment failed', 'error');
      }
    } catch {
      showNotification('Team assignment failed', 'error');
    } finally {
      setMigrating(false);
    }
  };

  // Re-send texts
  const resendTexts = async () => {
    setResendLoading(true);
    try {
      const res = await fetch('/api/square/invoice/list-published');
      const data = await res.json();
      if (!data.success) {
        showNotification(data.error || 'Failed to fetch invoices', 'error');
        setResendLoading(false);
        return;
      }

      const publishedInvoices: Array<{
        invoiceId: string; publicUrl: string; phone: string; name: string; amount: number; title: string;
      }> = data.invoices;

      if (publishedInvoices.length === 0) {
        showNotification('No unpaid published invoices found', 'error');
        setResendLoading(false);
        return;
      }

      const matched: typeof pendingInvoices = [];
      for (const inv of publishedInvoices) {
        const normalizedInvPhone = inv.phone.replace(/\D/g, '');
        const parent = parents.find(p => {
          const normalizedParentPhone = (p.phone || '').replace(/\D/g, '');
          return normalizedParentPhone === normalizedInvPhone && normalizedInvPhone.length >= 10;
        });

        if (parent) {
          matched.push({
            parentId: parent.id, firstName: parent.firstName, lastName: parent.lastName,
            phone: parent.phone || '', invoiceId: inv.invoiceId, total: inv.amount,
            months: [], publicUrl: inv.publicUrl,
          });
        } else {
          const nameParts = inv.name.split(' ');
          matched.push({
            parentId: `square_${inv.invoiceId}`, firstName: nameParts[0] || 'Unknown',
            lastName: nameParts.slice(1).join(' ') || '', phone: inv.phone,
            invoiceId: inv.invoiceId, total: inv.amount, months: [], publicUrl: inv.publicUrl,
          });
        }
      }

      setPendingInvoices(matched);
      setSentInvoices(new Set());
      setShowBatchSend(true);
      showNotification(`Loaded ${matched.length} published invoices for re-sending`, 'success');
    } catch (err) {
      showNotification('Failed to fetch published invoices', 'error');
    } finally {
      setResendLoading(false);
    }
  };

  // Send text to single parent
  const sendTextToParent = async (parent: Parent) => {
    const normalizedPhone = (parent.phone || '').replace(/\D/g, '').replace(/^1/, '');
    const dashboardBalance = getBalance(parent);
    setTextingParent(parent.id);

    let publicUrl = '';
    let amount = 0;
    let invoiceId = '';
    try {
      const res = await fetch('/api/square/invoice/list-published');
      const data = await res.json();
      if (data.success && data.invoices) {
        const match = data.invoices.find((inv: { phone: string }) =>
          inv.phone.replace(/\D/g, '').replace(/^1/, '') === normalizedPhone
        );
        if (match) {
          publicUrl = match.publicUrl;
          amount = match.amount;
          invoiceId = match.invoiceId;
        }
      }
    } catch (err) {
      console.error('Failed to fetch fresh invoice:', err);
    }

    // If amounts don't match, cancel old and create new
    if (invoiceId && amount !== dashboardBalance && dashboardBalance > 0) {
      showNotification(`Updating invoice: $${amount} → $${dashboardBalance}...`, 'success');
      try {
        await fetch('/api/square/invoice/batch-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds: [invoiceId] }),
        });

        const rate = getMonthlyRate(parent);
        const overdueMonths = getOverdueMonths(parent);
        const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
        const lineItems: Array<{ description: string; amount: number; quantity: number }> = [];
        for (const month of overdueMonths) {
          const [y, mo] = month.split('-');
          const monthLabel = new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
          lineItems.push({ description: `Monthly Fee - ${monthLabel}`, amount: rate, quantity: 1 });
        }
        for (const extra of unpaidExtras) {
          lineItems.push({ description: extra.description, amount: extra.amount, quantity: 1 });
        }

        const createRes = await fetch('/api/square/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: parent.phone, customerId: parent.squareCustomerId, lineItems,
            message: getDefaultMessage(overdueMonths), dueDate: getDefaultDueDate(),
            playerName: (parent.playerNames || []).join(', ') || parent.firstName,
            parentFirstName: parent.firstName, parentLastName: parent.lastName,
            billingMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          }),
        });
        const createData = await createRes.json();

        if (createData.success && createData.invoiceId) {
          const pubRes = await fetch('/api/square/invoice/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: createData.invoiceId }),
          });
          const pubData = await pubRes.json();
          if (pubData.success && pubData.publicUrl) {
            publicUrl = pubData.publicUrl;
            amount = dashboardBalance;
          }
        }
      } catch (err) {
        console.error('Failed to recreate invoice:', err);
        showNotification('Failed to update invoice — using existing link', 'error');
      }
    }

    // If no invoice exists but parent owes, create one
    if (!publicUrl && dashboardBalance > 0) {
      try {
        const rate = getMonthlyRate(parent);
        const overdueMonths = getOverdueMonths(parent);
        const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
        const lineItems: Array<{ description: string; amount: number; quantity: number }> = [];
        for (const month of overdueMonths) {
          const [y, mo] = month.split('-');
          const monthLabel = new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
          lineItems.push({ description: `Monthly Fee - ${monthLabel}`, amount: rate, quantity: 1 });
        }
        for (const extra of unpaidExtras) {
          lineItems.push({ description: extra.description, amount: extra.amount, quantity: 1 });
        }

        const createRes = await fetch('/api/square/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: parent.phone, customerId: parent.squareCustomerId, lineItems,
            message: getDefaultMessage(overdueMonths), dueDate: getDefaultDueDate(),
            playerName: (parent.playerNames || []).join(', ') || parent.firstName,
            parentFirstName: parent.firstName, parentLastName: parent.lastName,
            billingMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          }),
        });
        const createData = await createRes.json();
        if (createData.success && createData.invoiceId) {
          const pubRes = await fetch('/api/square/invoice/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: createData.invoiceId }),
          });
          const pubData = await pubRes.json();
          if (pubData.success && pubData.publicUrl) {
            publicUrl = pubData.publicUrl;
            amount = dashboardBalance;
          }
        }
      } catch (err) {
        console.error('Failed to create invoice:', err);
        showNotification('Failed to create invoice', 'error');
        setTextingParent(null);
        return;
      }
    }

    if (!publicUrl) {
      showNotification('No invoice could be created for this family', 'error');
      setTextingParent(null);
      return;
    }

    // Update cache
    setExistingInvoices(prev => {
      const next = new Map(prev);
      next.set(normalizedPhone, { invoiceId, publicUrl, amount, name: `${parent.firstName} ${parent.lastName}` });
      return next;
    });

    const smsBody = `Hi ${parent.firstName}, your AZ Flight Basketball payment of $${amount} is ready. Pay here: ${publicUrl} - Coach Jonas`;

    try {
      await navigator.clipboard.writeText(smsBody);
    } catch { /* clipboard may fail */ }

    const smsLink = document.createElement('a');
    smsLink.href = `sms:${normalizedPhone}`;
    smsLink.click();

    // Save lastTexted
    try {
      const parentRef = doc(db, 'parents', parent.id);
      const now = new Date().toISOString();
      await updateDoc(parentRef, { lastTexted: now });
      setParents(prev => prev.map(p => p.id === parent.id ? { ...p, lastTexted: now } : p));
    } catch (err) {
      console.error('Failed to save lastTexted:', err);
    }

    showNotification(`Message copied ($${amount})! Paste in Phone Link and send to ${parent.firstName}`, 'success');
    setTextingParent(null);
  };

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: teamConfig.accentColor }} />
          <span className="text-text-secondary font-display text-lg">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-sm border transition-all duration-300 ${
          notification.type === 'success'
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-error/10 border-error/30 text-error'
        }`}>
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      <DashboardHeader />

      <main className="max-w-[1600px] mx-auto px-4 md:px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-2xl p-5 border border-border hover:border-border-hover transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Users className="w-5 h-5" style={{ color: teamConfig.accentColor }} />
              </div>
              <span className="text-text-muted text-sm">Total Families</span>
            </div>
            <p className="text-3xl font-display font-bold">{totalFamilies}</p>
          </div>
          <div className="bg-surface rounded-2xl p-5 border border-border hover:border-border-hover transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-success" />
              </div>
              <span className="text-text-muted text-sm">Paid This Month</span>
            </div>
            <p className="text-3xl font-display font-bold text-success">{paidThisMonth}</p>
          </div>
          <div className="bg-surface rounded-2xl p-5 border border-border hover:border-border-hover transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-warning" />
              </div>
              <span className="text-text-muted text-sm">Outstanding</span>
            </div>
            <p className="text-3xl font-display font-bold" style={{ color: teamConfig.accentColor }}>{outstanding}</p>
          </div>
          <div className="bg-surface rounded-2xl p-5 border border-border hover:border-border-hover transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-error" />
              </div>
              <span className="text-text-muted text-sm">Total Owed</span>
            </div>
            <p className="text-3xl font-display font-bold text-error">${totalOwed.toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={createAllDrafts} disabled={batchCreating}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 disabled:opacity-50">
            {batchCreating ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Creating...</> : <><FileText className="w-4 h-4 inline mr-2" />Create All Drafts</>}
          </button>
          <button onClick={resendTexts} disabled={resendLoading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border disabled:opacity-50 hover:brightness-110"
            style={{ background: `${teamConfig.accentColor}15`, color: teamConfig.accentColor, borderColor: `${teamConfig.accentColor}30` }}>
            {resendLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading...</> : <><MessageSquare className="w-4 h-4 inline mr-2" />Re-send Texts</>}
          </button>
          {pendingInvoices.length > 0 && (
            <button onClick={() => setShowBatchSend(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 bg-success/10 text-success hover:bg-success/20 border border-success/20 animate-pulse">
              <Zap className="w-4 h-4 inline mr-2" />Send All Texts ({pendingInvoices.length})
            </button>
          )}
          <button onClick={assignTeams} disabled={migrating}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20 disabled:opacity-50">
            {migrating ? 'Assigning...' : 'Set Teams'}
          </button>
          <button onClick={syncWithSquare} disabled={syncing}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 disabled:opacity-50">
            {syncing ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Syncing...</> : <><RefreshCw className="w-4 h-4 inline mr-2" />Sync Square</>}
          </button>
          <button onClick={() => setAddModal(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-white hover:brightness-110 border-0"
            style={{ background: teamConfig.accentColor }}>
            <UserPlus className="w-4 h-4 inline mr-2" />Add Family
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex bg-surface rounded-xl p-1 border border-border">
            {(['all', 'owes', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  filter === f ? 'text-white shadow-lg' : 'text-text-muted hover:text-foreground'
                }`}
                style={filter === f ? { background: teamConfig.accentColor } : {}}>
                {f === 'all' ? 'All' : f === 'owes' ? 'Owes' : 'Paid'}
              </button>
            ))}
          </div>
          <div className="flex bg-surface rounded-xl p-1 border border-border">
            {(['all', 'active', 'on_break', 'exempt', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  statusFilter === s ? 'bg-surface-elevated text-foreground shadow-sm' : 'text-text-muted hover:text-foreground'
                }`}>
                {s === 'all' ? 'All Status' : STATUS_COLORS[s].label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-foreground text-sm w-56 focus:border-accent focus:outline-none transition-colors placeholder:text-text-muted" />
          </div>
        </div>

        {/* Table */}
        {parents.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center border border-border">
            <p className="text-text-muted text-lg mb-4">No data imported yet</p>
            <a href="/import" className="inline-block px-6 py-3 rounded-xl font-medium transition text-white hover:brightness-110"
              style={{ background: teamConfig.accentColor }}>
              Import Your Excel Tracker
            </a>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Parent</th>
                  <th className="text-left px-4 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Players</th>
                  <th className="text-center px-3 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Rate</th>
                  <th className="text-left px-4 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Phone</th>
                  {monthColumns.map(col => (
                    <th key={col.key} className="text-center px-3 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">{col.shortLabel}</th>
                  ))}
                  <th className="text-center px-3 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Extras</th>
                  <th className="text-right px-4 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Balance</th>
                  <th className="text-center px-3 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-4 text-text-muted font-medium text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...TEAMS, null].map(teamGroup => {
                  const teamParents = filteredParents
                    .filter(p => (teamGroup === null ? !p.team : p.team === teamGroup))
                    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
                  if (teamParents.length === 0) return null;
                  return (
                    <React.Fragment key={teamGroup || 'unassigned'}>
                      <tr>
                        <td colSpan={10} className="px-4 py-3 border-b border-border bg-surface-elevated">
                          <span className="text-sm font-display font-bold" style={{ color: teamConfig.accentColor }}>
                            {teamGroup || 'Unassigned'}
                          </span>
                          <span className="text-xs text-text-muted ml-3">
                            {teamParents.length} {teamParents.length === 1 ? 'family' : 'families'}
                          </span>
                        </td>
                      </tr>
                      {teamParents.map(parent => {
                        const balance = getBalance(parent);
                        const payments = parent.payments || {};
                        const status = parent.status || 'active';
                        const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
                        const extrasTotal = unpaidExtras.reduce((s, li) => s + li.amount, 0);
                        const canInvoice = balance > 0 && parent.phone && status === 'active';

                        return (
                          <tr key={parent.id} className="border-b border-border hover:bg-surface-elevated/50 transition-colors">
                            {/* Parent Name */}
                            <td className="px-4 py-3.5">
                              <p className="font-medium text-foreground">{parent.firstName} {parent.lastName}</p>
                              {parent.email && <p className="text-text-muted text-xs mt-0.5">{parent.email}</p>}
                            </td>

                            {/* Players */}
                            <td className="px-4 py-3.5">
                              <p className="text-text-secondary text-sm">{(parent.playerNames || []).join(', ') || '-'}</p>
                            </td>

                            {/* Rate */}
                            <td className="px-3 py-3.5 text-center">
                              <span className="text-text-secondary text-sm">${getMonthlyRate(parent)}</span>
                            </td>

                            {/* Phone */}
                            <td className="px-4 py-3.5 text-text-secondary text-sm">
                              {parent.phone || <span className="text-error text-xs">No phone</span>}
                            </td>

                            {/* Month Checkboxes */}
                            {monthColumns.map(col => {
                              const payment = payments[col.key];
                              const isPaid = payment?.status === 'paid';
                              const isDropdownOpen = paymentDropdown?.parentId === parent.id && paymentDropdown?.month === col.key;

                              return (
                                <td key={col.key} className="px-3 py-3.5 text-center relative">
                                  {isPaid ? (
                                    <button onClick={() => undoPayment(parent.id, col.key)}
                                      className="w-9 h-9 rounded-lg bg-success/10 border border-success/30 flex items-center justify-center mx-auto hover:bg-success/20 transition-all"
                                      title={`Paid via ${payment.method} — click to undo`}>
                                      <span className={`text-xs font-bold text-white ${METHOD_SHORT[payment.method || '']?.color || ''} rounded px-1.5 py-0.5`}>
                                        {METHOD_SHORT[payment.method || '']?.label || '?'}
                                      </span>
                                    </button>
                                  ) : status === 'on_break' || status === 'exempt' || status === 'inactive' ? (
                                    <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-border flex items-center justify-center mx-auto">
                                      <span className="text-text-muted text-xs">-</span>
                                    </div>
                                  ) : (
                                    <div className="relative inline-block">
                                      <button onClick={() => setPaymentDropdown(isDropdownOpen ? null : { parentId: parent.id, month: col.key })}
                                        className="w-9 h-9 rounded-lg bg-error/10 border border-error/30 flex items-center justify-center mx-auto hover:bg-error/20 transition-all">
                                      </button>
                                      {isDropdownOpen && (
                                        <div className="absolute z-20 top-11 left-1/2 -translate-x-1/2 bg-surface-elevated rounded-xl shadow-2xl border border-border py-1.5 min-w-[130px]">
                                          {(['square', 'zelle', 'cash', 'check'] as PaymentMethod[]).map(m => (
                                            <button key={m} onClick={() => markPayment(parent.id, col.key, m)}
                                              className={`block w-full text-left px-4 py-2 text-sm font-medium ${METHOD_BADGES[m].text} hover:bg-surface transition-colors capitalize`}>
                                              {m}
                                            </button>
                                          ))}
                                          <button onClick={() => setPaymentDropdown(null)}
                                            className="block w-full text-left px-4 py-2 text-sm text-text-muted hover:bg-surface transition-colors border-t border-border mt-1">
                                            Cancel
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Extras */}
                            <td className="px-3 py-3.5 text-center">
                              {unpaidExtras.length > 0 ? (
                                <button onClick={() => setAddChargeModal(parent)}
                                  className="text-xs font-medium text-warning hover:text-yellow-300 transition-colors px-2 py-1 rounded-lg bg-warning/10 border border-warning/20 hover:bg-warning/20">
                                  {unpaidExtras.length} item{unpaidExtras.length > 1 ? 's' : ''} — ${extrasTotal}
                                </button>
                              ) : (
                                <button onClick={() => setAddChargeModal(parent)}
                                  className="text-xs font-medium text-text-secondary hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-surface-elevated border border-border hover:bg-border">
                                  + Add
                                </button>
                              )}
                            </td>

                            {/* Balance */}
                            <td className="px-4 py-3.5 text-right">
                              <span className={`font-display font-bold text-sm ${
                                balance === 0 ? 'text-success' : balance > getMonthlyRate(parent) ? 'text-error' : ''
                              }`} style={balance > 0 && balance <= getMonthlyRate(parent) ? { color: teamConfig.accentColor } : {}}>
                                ${balance}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-3.5 text-center">
                              <select value={status}
                                onChange={e => updateStatus(parent.id, e.target.value as ParentStatus)}
                                className={`text-xs font-semibold rounded-full px-3 py-1.5 border-0 cursor-pointer appearance-none ${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`}>
                                <option value="active">Active</option>
                                <option value="on_break">On Break</option>
                                <option value="exempt">Exempt</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                {canInvoice && (() => {
                                  if (parent.lastTexted) {
                                    const textedDate = new Date(parent.lastTexted);
                                    const timeAgo = Math.round((Date.now() - textedDate.getTime()) / 60000);
                                    const label = timeAgo < 60 ? `${timeAgo}m ago` : timeAgo < 1440 ? `${Math.round(timeAgo / 60)}h ago` : `${Math.round(timeAgo / 1440)}d ago`;
                                    return (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span className="px-3 py-1.5 bg-success/10 border border-success/30 text-success rounded-lg text-xs font-medium">
                                          Texted ✓
                                        </span>
                                        <span className="text-[10px] text-text-muted">{label}</span>
                                        <button onClick={() => sendTextToParent(parent)}
                                          disabled={textingParent === parent.id}
                                          className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors">
                                          {textingParent === parent.id ? 'Updating...' : 'Re-text'}
                                        </button>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <button onClick={() => sendTextToParent(parent)}
                                        disabled={textingParent === parent.id}
                                        className="px-3 py-1.5 bg-success/10 hover:bg-success/20 text-success border border-success/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50">
                                        {textingParent === parent.id ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />...</> : 'Text'}
                                      </button>
                                    );
                                  }
                                })()}
                                <button onClick={() => setEditModal(parent)}
                                  className="px-3 py-1.5 bg-surface-elevated hover:bg-border text-text-secondary rounded-lg text-xs font-medium transition-all border border-border">
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ============ MODALS ============ */}

      {/* Edit Family Modal */}
      {editModal && (
        <EditFamilyModal
          parent={editModal}
          onClose={() => setEditModal(null)}
          onSave={async (updates) => {
            const parentRef = doc(db, 'parents', editModal.id);
            await updateDoc(parentRef, updates);
            setParents(prev => prev.map(p => p.id === editModal.id ? { ...p, ...updates } as Parent : p));
            setEditModal(null);
            showNotification('Family updated', 'success');
          }}
          onDelete={async () => {
            if (!confirm(`Delete ${editModal.firstName} ${editModal.lastName}? This cannot be undone.`)) return;
            await deleteDoc(doc(db, 'parents', editModal.id));
            setParents(prev => prev.filter(p => p.id !== editModal.id));
            setEditModal(null);
            showNotification('Family deleted', 'success');
          }}
        />
      )}

      {/* Add Family Modal */}
      {addModal && (
        <AddFamilyModal
          onClose={() => setAddModal(false)}
          onSave={async (newParent) => {
            const docRef = await addDoc(collection(db, 'parents'), {
              ...newParent,
              payments: {},
              lineItems: [],
              squareCustomerId: null,
              doNotInvoice: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            setParents(prev => [...prev, { ...newParent, id: docRef.id, payments: {}, lineItems: [], squareCustomerId: null, doNotInvoice: false, createdAt: new Date(), updatedAt: new Date() } as Parent]);
            setAddModal(false);
            showNotification('Family added', 'success');
          }}
        />
      )}

      {/* Add Charge Modal */}
      {addChargeModal && (
        <AddChargeModal
          parent={addChargeModal}
          catalogItems={catalogItems}
          onLoadCatalog={async () => {
            if (catalogItems.length > 0) return;
            try {
              const res = await fetch('/api/square/catalog');
              const data = await res.json();
              if (data.success) setCatalogItems(data.items);
            } catch { /* ignore */ }
          }}
          onClose={() => setAddChargeModal(null)}
          onSave={async (item: LineItem) => {
            const parentRef = doc(db, 'parents', addChargeModal.id);
            const updatedItems = [...(addChargeModal.lineItems || []), item];
            await updateDoc(parentRef, { lineItems: updatedItems });
            setParents(prev => prev.map(p =>
              p.id === addChargeModal.id ? { ...p, lineItems: updatedItems } : p
            ));
            setAddChargeModal(null);
            showNotification(`Charge added: ${item.description} $${item.amount}`, 'success');
          }}
          onMarkPaid={async (itemId: string, method: PaymentMethod) => {
            const items = (addChargeModal.lineItems || []).map(li =>
              li.id === itemId ? { ...li, status: 'paid' as const, method, paidAt: new Date().toISOString() } : li
            );
            const parentRef = doc(db, 'parents', addChargeModal.id);
            await updateDoc(parentRef, { lineItems: items });
            setParents(prev => prev.map(p =>
              p.id === addChargeModal.id ? { ...p, lineItems: items } : p
            ));
            setAddChargeModal(prev => prev ? { ...prev, lineItems: items } : null);
            showNotification('Line item marked as paid', 'success');
          }}
        />
      )}

      {/* Send Invoice Modal */}
      {invoiceModal && (
        <SendInvoiceModal
          parent={invoiceModal}
          monthColumns={monthColumns}
          onClose={() => setInvoiceModal(null)}
          onQueue={(entry) => {
            setPendingInvoices(prev => [...prev, entry]);
            showNotification(`Draft queued for ${invoiceModal.firstName} (${pendingInvoices.length + 1} in queue)`, 'success');
            setInvoiceModal(null);
          }}
        />
      )}

      {/* Batch Send Modal */}
      {showBatchSend && (
        <BatchSendModal
          invoices={pendingInvoices}
          onClose={() => setShowBatchSend(false)}
          onClear={() => { setPendingInvoices([]); setShowBatchSend(false); }}
          onSent={(parentId) => setSentInvoices(prev => new Set(prev).add(parentId))}
          showNotification={showNotification}
        />
      )}

      {/* Click outside to close payment dropdown */}
      {paymentDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setPaymentDropdown(null)} />
      )}
    </div>
  );
}

// ============ MODAL: EDIT FAMILY ============

function EditFamilyModal({ parent, onClose, onSave, onDelete }: {
  parent: Parent;
  onClose: () => void;
  onSave: (updates: Partial<Parent>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(parent.firstName || '');
  const [lastName, setLastName] = useState(parent.lastName || '');
  const [phone, setPhone] = useState(parent.phone || '');
  const [email, setEmail] = useState(parent.email || '');
  const [playerNames, setPlayerNames] = useState((parent.playerNames || []).join(', '));
  const [team, setTeam] = useState<Team | ''>(parent.team || '');
  const [rateType, setRateType] = useState<RateType>(parent.rateType || 'regular');
  const [customRate, setCustomRate] = useState(parent.customRate || 0);
  const [notes, setNotes] = useState(parent.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const names = playerNames.split(',').map(n => n.trim()).filter(Boolean);
    const rate = rateType === 'custom' ? customRate : (RATE_CONFIG[rateType].amount || 95);
    await onSave({
      firstName, lastName, phone, email: email || null,
      playerNames: names, team: team || null, rateType, customRate: rateType === 'custom' ? customRate : null,
      monthlyRate: rate, notes,
    });
    setSaving(false);
  };

  const inputClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors placeholder:text-text-muted w-full";
  const selectClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold">Edit Family</h2>
          <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" className={inputClass} />
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" className={inputClass} />
          </div>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" className={inputClass} />
          <input value={playerNames} onChange={e => setPlayerNames(e.target.value)} placeholder="Player names (comma separated)" className={inputClass} />
          <div className="grid grid-cols-3 gap-3">
            <select value={team} onChange={e => setTeam(e.target.value as Team)} className={selectClass}>
              <option value="">No Team</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rateType} onChange={e => setRateType(e.target.value as RateType)} className={selectClass}>
              {Object.entries(RATE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            {rateType === 'custom' && (
              <input type="number" value={customRate} onChange={e => setCustomRate(Number(e.target.value))} placeholder="Amount" className={inputClass} />
            )}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className={`${inputClass} resize-none`} rows={2} />
        </div>
        <div className="flex justify-between mt-6">
          <button onClick={onDelete} className="px-4 py-2.5 bg-error/10 hover:bg-error/20 text-error rounded-xl text-sm font-medium transition-all border border-error/20">Delete</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 bg-surface-elevated hover:bg-border text-text-secondary rounded-xl text-sm transition-all border border-border">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-white disabled:opacity-50 hover:brightness-110"
              style={{ background: teamConfig.accentColor }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL: ADD FAMILY ============

function AddFamilyModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (parent: Partial<Parent>) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [playerNames, setPlayerNames] = useState('');
  const [team, setTeam] = useState<Team | ''>('');
  const [rateType, setRateType] = useState<RateType>('regular');
  const [customRate, setCustomRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!firstName) return;
    setSaving(true);
    const names = playerNames.split(',').map(n => n.trim()).filter(Boolean);
    const rate = rateType === 'custom' ? customRate : (RATE_CONFIG[rateType].amount || 95);
    await onSave({
      firstName, lastName, phone, email: email || null,
      playerNames: names, players: [],
      team: team || null, rateType, customRate: rateType === 'custom' ? customRate : null,
      monthlyRate: rate, notes, status: 'active',
      currentBalance: 0,
    });
    setSaving(false);
  };

  const inputClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors placeholder:text-text-muted w-full";
  const selectClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold">Add Family</h2>
          <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" className={inputClass} />
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" className={inputClass} />
          </div>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" className={inputClass} />
          <input value={playerNames} onChange={e => setPlayerNames(e.target.value)} placeholder="Player names (comma separated)" className={inputClass} />
          <div className="grid grid-cols-3 gap-3">
            <select value={team} onChange={e => setTeam(e.target.value as Team)} className={selectClass}>
              <option value="">No Team</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rateType} onChange={e => setRateType(e.target.value as RateType)} className={selectClass}>
              {Object.entries(RATE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            {rateType === 'custom' && (
              <input type="number" value={customRate} onChange={e => setCustomRate(Number(e.target.value))} placeholder="Amount" className={inputClass} />
            )}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className={`${inputClass} resize-none`} rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2.5 bg-surface-elevated hover:bg-border text-text-secondary rounded-xl text-sm transition-all border border-border">Cancel</button>
          <button onClick={handleSave} disabled={saving || !firstName}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-white disabled:opacity-50 hover:brightness-110"
            style={{ background: teamConfig.accentColor }}>
            {saving ? 'Adding...' : 'Add Family'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL: ADD CHARGE ============

function AddChargeModal({ parent, catalogItems, onLoadCatalog, onClose, onSave, onMarkPaid }: {
  parent: Parent;
  catalogItems: CatalogItem[];
  onLoadCatalog: () => Promise<void>;
  onClose: () => void;
  onSave: (item: LineItem) => Promise<void>;
  onMarkPaid: (itemId: string, method: PaymentMethod) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [catalogItemId, setCatalogItemId] = useState('');
  const [catalogVariationId, setCatalogVariationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { onLoadCatalog(); }, []);

  const handleSave = async () => {
    if (!description || amount <= 0) return;
    setSaving(true);
    await onSave({
      id: `li_${Date.now()}`,
      description,
      amount,
      squareCatalogItemId: catalogItemId || null,
      squareCatalogVariationId: catalogVariationId || null,
      status: 'unpaid',
      method: null,
      paidAt: null,
      addedAt: new Date().toISOString(),
    });
    setSaving(false);
  };

  const existingItems = parent.lineItems || [];
  const inputClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors placeholder:text-text-muted w-full";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold">Line Items — {parent.firstName} {parent.lastName}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Existing Items */}
        {existingItems.length > 0 && (
          <div className="mb-4 space-y-2">
            {existingItems.map(item => (
              <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${
                item.status === 'paid' ? 'bg-success/5 border-success/20' : 'bg-surface-elevated border-border'
              }`}>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.description}</p>
                  <p className="text-xs text-text-muted">${item.amount} {item.status === 'paid' ? `- Paid (${item.method})` : '- Unpaid'}</p>
                </div>
                {item.status !== 'paid' && (
                  <div className="flex gap-1">
                    {(['square', 'zelle', 'cash'] as PaymentMethod[]).map(m => (
                      <button key={m} onClick={() => onMarkPaid(item.id, m)}
                        className={`px-2 py-1 rounded-lg text-xs capitalize transition-colors ${METHOD_BADGES[m].bg} ${METHOD_BADGES[m].text} hover:brightness-125`}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add New */}
        {showAdd ? (
          <div className="space-y-3 border-t border-border pt-4">
            <select value={catalogItemId}
              onChange={e => {
                const itemId = e.target.value;
                setCatalogItemId(itemId);
                const item = catalogItems.find(ci => ci.id === itemId);
                if (item) {
                  setDescription(item.name);
                  if (item.variations.length === 1) {
                    setCatalogVariationId(item.variations[0].id);
                    setAmount(item.variations[0].priceMoney.amount);
                  }
                }
              }}
              className={inputClass}>
              <option value="">Select from Square catalog (optional)</option>
              {catalogItems.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {catalogItemId && catalogItems.find(ci => ci.id === catalogItemId)?.variations && (
              <select value={catalogVariationId}
                onChange={e => {
                  const varId = e.target.value;
                  setCatalogVariationId(varId);
                  const item = catalogItems.find(ci => ci.id === catalogItemId);
                  const variation = item?.variations.find(v => v.id === varId);
                  if (variation) setAmount(variation.priceMoney.amount);
                }}
                className={inputClass}>
                <option value="">Select variation</option>
                {catalogItems.find(ci => ci.id === catalogItemId)?.variations.map(v => (
                  <option key={v.id} value={v.id}>{v.name} — ${v.priceMoney.amount}</option>
                ))}
              </select>
            )}
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (e.g., Uniform)" className={inputClass} />
            <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="Amount" className={inputClass} />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-surface-elevated hover:bg-border text-text-secondary rounded-xl text-sm transition-all border border-border">Cancel</button>
              <button onClick={handleSave} disabled={saving || !description || amount <= 0}
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-white disabled:opacity-50 hover:brightness-110"
                style={{ background: teamConfig.accentColor }}>
                {saving ? 'Adding...' : 'Add Charge'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full py-3 border border-dashed border-border rounded-xl text-text-muted hover:text-foreground hover:border-text-muted text-sm transition-all">
            + Add New Charge
          </button>
        )}
      </div>
    </div>
  );
}

// ============ MODAL: SEND INVOICE ============

function SendInvoiceModal({ parent, monthColumns, onClose, onQueue }: {
  parent: Parent;
  monthColumns: { key: string; label: string; shortLabel: string }[];
  onClose: () => void;
  onQueue: (entry: { parentId: string; firstName: string; lastName: string; phone: string; invoiceId: string; total: number; months: string[]; publicUrl?: string }) => void;
}) {
  const payments = parent.payments || {};
  const overdueMonths = monthColumns
    .filter(col => !payments[col.key] || payments[col.key].status !== 'paid')
    .map(col => col.key);
  const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
  const rate = getMonthlyRate(parent);

  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [message, setMessage] = useState(getDefaultMessage(overdueMonths));
  const [includeMonths, setIncludeMonths] = useState<string[]>(overdueMonths);
  const [includeExtras, setIncludeExtras] = useState<string[]>(unpaidExtras.map(li => li.id));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentResult, setSentResult] = useState<{ invoiceId: string; publicUrl: string | null } | null>(null);

  const totalMonthly = includeMonths.length * rate;
  const totalExtras = unpaidExtras.filter(li => includeExtras.includes(li.id)).reduce((s, li) => s + li.amount, 0);
  const total = totalMonthly + totalExtras;

  const handleDueDateChange = (newDate: string) => {
    setDueDate(newDate);
    setMessage(getDefaultMessage(includeMonths));
  };

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const lineItems: Array<{ description: string; amount: number; quantity: number }> = [];
      for (const month of includeMonths) {
        const [y, mo] = month.split('-');
        const monthLabel = new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
        lineItems.push({ description: `Monthly Fee - ${monthLabel}`, amount: rate, quantity: 1 });
      }
      for (const extra of unpaidExtras.filter(li => includeExtras.includes(li.id))) {
        lineItems.push({ description: extra.description, amount: extra.amount, quantity: 1 });
      }

      const response = await fetch('/api/square/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: parent.phone, customerId: parent.squareCustomerId, lineItems, message, dueDate,
          playerName: (parent.playerNames || []).join(', ') || parent.firstName,
          parentFirstName: parent.firstName, parentLastName: parent.lastName,
          billingMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSentResult({ invoiceId: data.invoiceId, publicUrl: null });
        if (data.invoiceId && parent.phone) {
          setTimeout(() => {
            onQueue({
              parentId: parent.id, firstName: parent.firstName, lastName: parent.lastName,
              phone: parent.phone || '', invoiceId: data.invoiceId, total, months: includeMonths,
            });
          }, 1500);
        }
      } else {
        setError(data.error || 'Failed to send invoice');
      }
    } catch (err) {
      setError('Failed to send invoice');
    } finally {
      setSending(false);
    }
  };

  const inputClass = "bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none transition-colors w-full";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-display font-bold">Send Invoice</h2>
          <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-text-muted text-sm mb-5">{parent.firstName} {parent.lastName} — {parent.phone}</p>

        {/* Months */}
        <div className="mb-4">
          <p className="text-sm font-medium text-text-secondary mb-2">Monthly Fees (${rate}/mo)</p>
          <div className="space-y-1.5">
            {monthColumns.map(col => {
              const isPaid = payments[col.key]?.status === 'paid';
              if (isPaid) return null;
              const included = includeMonths.includes(col.key);
              return (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
                  <input type="checkbox" checked={included}
                    onChange={e => setIncludeMonths(prev =>
                      e.target.checked ? [...prev, col.key] : prev.filter(m => m !== col.key)
                    )}
                    className="rounded accent-accent" />
                  <span>{col.label}</span>
                  <span className="text-text-muted">${rate}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Extras */}
        {unpaidExtras.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-text-secondary mb-2">Extra Charges</p>
            <div className="space-y-1.5">
              {unpaidExtras.map(item => {
                const included = includeExtras.includes(item.id);
                return (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
                    <input type="checkbox" checked={included}
                      onChange={e => setIncludeExtras(prev =>
                        e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                      )}
                      className="rounded accent-accent" />
                    <span>{item.description}</span>
                    <span className="text-text-muted">${item.amount}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="bg-surface-elevated rounded-xl p-4 mb-4 border border-border">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Monthly ({includeMonths.length} month{includeMonths.length !== 1 ? 's' : ''})</span>
            <span>${totalMonthly}</span>
          </div>
          {totalExtras > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Extras</span>
              <span>${totalExtras}</span>
            </div>
          )}
          <div className="flex justify-between font-display font-bold mt-2 pt-2 border-t border-border">
            <span>Total</span>
            <span>${total}</span>
          </div>
        </div>

        {/* Due Date */}
        <div className="mb-4">
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Due Date</label>
          <input type="date" value={dueDate} onChange={e => handleDueDateChange(e.target.value)} className={inputClass} />
        </div>

        {/* Message */}
        <div className="mb-4">
          <label className="text-sm font-medium text-text-secondary block mb-1.5">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} className={`${inputClass} resize-none`} rows={4} />
        </div>

        {error && <p className="text-error text-sm mb-4">{error}</p>}

        {sentResult ? (
          <div className="bg-success/10 border border-success/30 rounded-xl p-5 text-center">
            <p className="text-success font-display font-bold text-lg mb-1">Draft Created!</p>
            <p className="text-success/70 text-sm">Queued for batch send — parents can&apos;t see this yet</p>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2.5 bg-surface-elevated hover:bg-border text-text-secondary rounded-xl text-sm transition-all border border-border">Cancel</button>
            <button onClick={handleSend} disabled={sending || total === 0}
              className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
              {sending ? 'Creating...' : `Create Invoice ($${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ MODAL: BATCH SEND ============

function BatchSendModal({ invoices, onClose, onClear, onSent, showNotification }: {
  invoices: Array<{ parentId: string; firstName: string; lastName: string; phone: string; invoiceId: string; total: number; months: string[]; publicUrl?: string }>;
  onClose: () => void;
  onClear: () => void;
  onSent: (parentId: string) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState('');

  const current = invoices[currentIndex];
  const isComplete = sentCount === invoices.length;
  const isResendMode = invoices.some(inv => inv.publicUrl);

  const buildSmsBody = (inv: typeof current, publicUrl: string) => {
    return `Hi ${inv.firstName}, your AZ Flight Basketball payment of $${inv.total} for ${
      inv.months.length > 0
        ? inv.months.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long' }); }).join(', ')
        : 'this month'
    } is ready. Pay here: ${publicUrl} - Coach Jonas`;
  };

  const advanceToNext = () => {
    onSent(current.parentId);
    const newSentCount = sentCount + 1;
    setSentCount(newSentCount);
    setAwaitingNext(false);
    setCopiedMessage('');
    if (newSentCount < invoices.length && currentIndex < invoices.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleSendAndNext = async () => {
    let publicUrl = current.publicUrl;

    if (!publicUrl) {
      setPublishing(true);
      setPublishError('');
      try {
        const res = await fetch('/api/square/invoice/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: current.invoiceId }),
        });
        const data = await res.json();
        if (!data.success || !data.publicUrl) {
          setPublishError(data.error || 'Failed to publish invoice');
          setPublishing(false);
          return;
        }
        publicUrl = data.publicUrl;
      } catch {
        setPublishError('Failed to publish invoice');
        setPublishing(false);
        return;
      } finally {
        setPublishing(false);
      }
    }

    const smsBody = buildSmsBody(current, publicUrl!);
    try {
      await navigator.clipboard.writeText(smsBody);
      setCopiedMessage(smsBody);
    } catch {
      setCopiedMessage(smsBody);
    }

    const normalizedPhone = current.phone.replace(/\D/g, '');
    const smsLink = document.createElement('a');
    smsLink.href = `sms:${normalizedPhone}`;
    smsLink.click();

    setAwaitingNext(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-display font-bold">{isResendMode ? 'Re-send Texts' : 'Send All Texts'}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-text-muted text-sm mb-5">
          {isResendMode
            ? `${invoices.length} published invoices — tap Send to open SMS, then tap Next after sending`
            : `${invoices.length} draft invoices — tap Send to publish & text each family`
          }
        </p>

        {/* Progress */}
        <div className="w-full bg-surface-elevated rounded-full h-2.5 mb-3 border border-border">
          <div className="h-2.5 rounded-full transition-all duration-300 bg-success"
            style={{ width: `${(sentCount / invoices.length) * 100}%` }} />
        </div>
        <p className="text-xs text-text-muted mb-5">{sentCount} / {invoices.length} sent</p>

        {isComplete ? (
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/30 rounded-xl p-6 text-center">
              <p className="text-success font-display font-bold text-2xl mb-1">All Done!</p>
              <p className="text-success/70">All {invoices.length} invoices texted</p>
            </div>
            <button onClick={onClear}
              className="w-full px-4 py-3 bg-surface-elevated hover:bg-border text-foreground rounded-xl font-medium transition-all border border-border">
              Clear Queue & Close
            </button>
          </div>
        ) : current ? (
          <div className="space-y-4">
            <div className="bg-surface-elevated rounded-xl p-4 border border-border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-display font-bold text-lg">{current.firstName} {current.lastName}</p>
                  <p className="text-text-muted text-sm">{current.phone}</p>
                </div>
                <p className="text-xl font-display font-bold text-success">${current.total}</p>
              </div>
              {current.months.length > 0 && (
                <p className="text-xs text-text-muted mt-1">
                  {current.months.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' }); }).join(', ')}
                </p>
              )}
              {current.publicUrl && <p className="text-xs text-blue-400 mt-1 truncate">Already published</p>}
            </div>

            {publishError && <p className="text-error text-sm">{publishError}</p>}

            {awaitingNext ? (
              <div className="space-y-3">
                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                  <p className="text-warning font-bold text-lg mb-2">Message copied! Paste in Phone Link</p>
                  <p className="text-warning/70 text-sm mb-3">1. Phone Link should be open to {current.firstName}&apos;s conversation<br/>2. Tap the message box and <strong>Ctrl+V</strong> to paste<br/>3. Hit Send<br/>4. Come back here and click Next</p>
                  {copiedMessage && (
                    <div className="bg-surface rounded-lg p-2 text-xs text-text-secondary max-h-20 overflow-y-auto border border-border">
                      {copiedMessage}
                    </div>
                  )}
                  <button onClick={async () => {
                    if (copiedMessage) {
                      await navigator.clipboard.writeText(copiedMessage);
                      showNotification('Message re-copied!', 'success');
                    }
                  }}
                    className="mt-2 px-3 py-1.5 bg-surface-elevated hover:bg-border rounded-lg text-xs text-text-muted transition-colors border border-border">
                    Re-copy message
                  </button>
                </div>
                <button onClick={advanceToNext}
                  className="w-full px-4 py-5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl text-xl font-display font-bold transition-all text-blue-400">
                  Next &rarr;
                </button>
              </div>
            ) : (
              <button onClick={handleSendAndNext} disabled={publishing}
                className="w-full px-4 py-5 bg-success/10 hover:bg-success/20 border border-success/30 rounded-xl text-xl font-display font-bold transition-all text-success disabled:opacity-50">
                {publishing ? 'Publishing...' : `Send Text to ${current.firstName} →`}
              </button>
            )}

            {!awaitingNext && (
              <button onClick={() => {
                if (currentIndex < invoices.length - 1) setCurrentIndex(prev => prev + 1);
              }}
                className="w-full px-4 py-2 bg-surface-elevated hover:bg-border rounded-xl text-sm text-text-muted transition-all border border-border">
                Skip
              </button>
            )}

            <div className="border-t border-border pt-3 mt-2">
              <p className="text-xs text-text-muted mb-2">Queue ({invoices.length - currentIndex} remaining)</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {invoices.slice(currentIndex).map((inv, i) => (
                  <div key={inv.parentId} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${i === 0 ? 'bg-surface-elevated' : ''}`}>
                    <span className={i === 0 ? 'text-foreground font-medium' : 'text-text-muted'}>{inv.firstName} {inv.lastName}</span>
                    <span className="text-text-muted">${inv.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-between mt-4">
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-foreground text-sm transition-colors">Minimize</button>
          <button onClick={onClear} className="px-4 py-2 text-error hover:text-red-300 text-sm transition-colors">Clear Queue</button>
        </div>
      </div>
    </div>
  );
}
