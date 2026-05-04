'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Parent, MonthlyPayment, LineItem, PaymentMethod, ParentStatus, RateType, Team, TEAMS, RATE_CONFIG, CatalogItem } from '@/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';

// Helper: get month strings for current + previous 2 months
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
  // "Next Club fee" is always the 7th of next month (not the current invoice due date)
  const now = new Date();
  const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  const nextDueStr = `${String(nextDue.getDate()).padStart(2, '0')} ${nextDue.toLocaleString('default', { month: 'short' })}`;

  return `- ${monthNames.join(', ')} Monthly club dues\n- Next Club fee is due on ${nextDueStr}\n- If payment arrangement is needed, please do not hesitate to reach out to Jonas at 303.908.6810.`;
}

const METHOD_BADGES: Record<string, { label: string; color: string }> = {
  square: { label: 'S', color: 'bg-blue-600' },
  zelle: { label: 'Z', color: 'bg-purple-600' },
  cash: { label: 'C', color: 'bg-emerald-600' },
  check: { label: 'Ch', color: 'bg-yellow-600' },
};

const STATUS_COLORS: Record<ParentStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-700', text: 'text-white', label: 'Active' },
  on_break: { bg: 'bg-yellow-700', text: 'text-white', label: 'On Break' },
  exempt: { bg: 'bg-blue-700', text: 'text-white', label: 'Exempt' },
  inactive: { bg: 'bg-gray-600', text: 'text-white', label: 'Inactive' },
};

export default function Dashboard() {
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

  // Existing unpaid invoices from Square (keyed by normalized phone)
  const [existingInvoices, setExistingInvoices] = useState<Map<string, { invoiceId: string; publicUrl: string; amount: number; name: string }>>(new Map());
  const [textingParent, setTextingParent] = useState<string | null>(null);
  const [sendTextModal, setSendTextModal] = useState<{
    parent: Parent;
    phone: string;
    message: string;
    amount: number;
  } | null>(null);

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
          // Only keep first match per phone (avoid duplicates)
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

  // Calculate balance: unpaid months x rate + unpaid line items
  const getBalance = (parent: Parent): number => {
    const rate = getMonthlyRate(parent);
    const payments = parent.payments || {};
    const status = parent.status || 'active';
    if (status === 'exempt' || status === 'inactive') return 0;

    let unpaidMonths = 0;
    for (const col of monthColumns) {
      const p = payments[col.key];
      if (!p || p.status !== 'paid') {
        // For on_break, don't count as owed
        if (status === 'on_break') continue;
        unpaidMonths++;
      }
    }

    const unpaidExtras = (parent.lineItems || [])
      .filter(li => li.status !== 'paid')
      .reduce((sum, li) => sum + li.amount, 0);

    return (unpaidMonths * rate) + unpaidExtras;
  };

  // Get overdue months for a parent
  const getOverdueMonths = (parent: Parent): string[] => {
    const payments = parent.payments || {};
    return monthColumns
      .filter(col => {
        const p = payments[col.key];
        return !p || p.status !== 'paid';
      })
      .map(col => col.key);
  };

  // Batch create all drafts for families that owe
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

  // Filter parents — "owes" and "paid" judged by the CURRENT MONTH only,
  // so the filter matches the top stats ("Paid This Month") instead of a
  // rolling 3-month balance (which double-counts families that joined partway
  // through the season).
  const filteredParents = parents.filter(p => {
    if (statusFilter !== 'all' && (p.status || 'active') !== statusFilter) return false;
    if (statusFilter === 'all' && (p.status === 'inactive')) return false;

    const status = p.status || 'active';
    const paidCurrentMonth = p.payments?.[currentMonth]?.status === 'paid';

    if (filter === 'owes') {
      if (status !== 'active') return false;
      return !paidCurrentMonth;
    }
    if (filter === 'paid') {
      return paidCurrentMonth;
    }

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

  // Current-month invoice buckets (Square has no "viewed" API, so we track via /r/ redirects)
  const currentMonthLabel = monthColumns[2].label;
  type Bucket = 'paid' | 'viewed_unpaid' | 'sent_not_viewed' | 'not_sent';
  const bucketFor = (p: Parent): Bucket | null => {
    const status = p.status || 'active';
    if (status !== 'active') return null;
    const isPaid = p.payments?.[currentMonth]?.status === 'paid';
    if (isPaid) return 'paid';
    const activity = p.invoiceActivity?.[currentMonth];
    if (!activity || !activity.sentAt) return 'not_sent';
    if (activity.viewedAt) return 'viewed_unpaid';
    return 'sent_not_viewed';
  };
  const buckets: Record<Bucket, Parent[]> = {
    paid: [],
    viewed_unpaid: [],
    sent_not_viewed: [],
    not_sent: [],
  };
  for (const p of activeParents) {
    const b = bucketFor(p);
    if (b) buckets[b].push(p);
  }
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null);

  // ─────────────────────────────────────────────────────────────────────
  // STRIPE / TWILIO UNIFIED INVOICING (May 2026 — replaces Square + Phone Link)
  // ─────────────────────────────────────────────────────────────────────
  const [stripeSyncing, setStripeSyncing] = useState(false);
  const [stripeBatchCreating, setStripeBatchCreating] = useState(false);
  const [smsSending, setSmsSending] = useState(false);

  // 1) Sync Stripe Customers — ensures every parent has a stripeCustomerId
  const syncStripeCustomers = async () => {
    if (!confirm('Sync ALL parents into Stripe as Customers? This is idempotent — re-runs are safe.')) return;
    setStripeSyncing(true);
    try {
      const res = await fetch('/api/stripe/customer-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Stripe Customers: ${data.ok} ok, ${data.failed} failed (${data.total} total)`, data.failed === 0 ? 'success' : 'error');
        loadData();
      } else {
        showNotification(`Stripe sync failed: ${data.error ?? 'unknown'}`, 'error');
      }
    } catch (err) {
      showNotification(`Stripe sync error: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setStripeSyncing(false);
    }
  };

  // 2) Create Stripe Invoices for the current month — parallel to Square's "Create All Drafts"
  const createStripeInvoicesForCurrentMonth = async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!confirm(`Create Stripe invoices for ${month}? This finalizes invoices (parents see hosted URL once we send the SMS).`)) return;
    setStripeBatchCreating(true);
    try {
      const res = await fetch('/api/stripe/invoice/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, daysUntilDue: 7, autoSendEmail: false }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Stripe invoices: ${data.ok} created, ${data.failed} failed (${data.total} attempted)`, data.failed === 0 ? 'success' : 'error');
        loadData();
      } else {
        showNotification(`Stripe invoice batch failed: ${data.error ?? 'unknown'}`, 'error');
      }
    } catch (err) {
      showNotification(`Stripe invoice batch error: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setStripeBatchCreating(false);
    }
  };

  // 3) Send SMS via Twilio for the current month — replaces 56 Phone Link clicks
  const sendStripeInvoicesViaSms = async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!confirm(`Send SMS via Twilio to all families with a Stripe invoice for ${month}? Goes out automatically — no Phone Link.`)) return;
    setSmsSending(true);
    try {
      const res = await fetch('/api/sms/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`SMS: ${data.ok} sent, ${data.failed} failed (${data.total} attempted)`, data.failed === 0 ? 'success' : 'error');
        loadData();
      } else {
        showNotification(`SMS batch failed: ${data.error ?? 'unknown'}`, 'error');
      }
    } catch (err) {
      showNotification(`SMS batch error: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setSmsSending(false);
    }
  };

  // Re-text every parent in a bucket sequentially (each click opens the parent's SMS app)
  const [bucketTexting, setBucketTexting] = useState(false);
  const remindBucket = async (bucket: Bucket) => {
    const targets = buckets[bucket];
    if (targets.length === 0) return;
    if (!confirm(`Re-text reminders to ${targets.length} families in "${bucket.replace(/_/g, ' ')}"? Each one will open your SMS app.`)) return;
    setBucketTexting(true);
    for (const p of targets) {
      await sendTextToParent(p);
      // Brief pause so the SMS app has time to handle each click
      await new Promise(r => setTimeout(r, 800));
    }
    setBucketTexting(false);
  };

  // Mark payment for a specific month
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
        // Reload both Firestore data and Square invoice cache
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

  // Assign teams from roster
  const assignTeams = async () => {
    if (!confirm('Assign teams to all families based on roster?')) return;
    setMigrating(true);
    try {
      const response = await fetch('/api/migrate', { method: 'PUT' });
      const data = await response.json();
      if (data.success) {
        showNotification(`Teams assigned: ${data.updated} updated, ${data.unmatched} unmatched`, 'success');
        if (data.unmatchedNames?.length > 0) {
          console.log('Unmatched families:', data.unmatchedNames);
        }
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

  // Re-send texts for already-published invoices
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
        invoiceId: string;
        publicUrl: string;
        phone: string;
        name: string;
        amount: number;
        title: string;
      }> = data.invoices;

      if (publishedInvoices.length === 0) {
        showNotification('No unpaid published invoices found', 'error');
        setResendLoading(false);
        return;
      }

      // Match to families by phone number.
      // IMPORTANT: skip any family already marked paid for the current month in
      // Firestore — Square has stale UNPAID invoices for families who paid in
      // cash/Zelle (those payment methods don't auto-close Square invoices).
      const matched: typeof pendingInvoices = [];
      let skippedPaid = 0;
      for (const inv of publishedInvoices) {
        const normalizedInvPhone = inv.phone.replace(/\D/g, '');
        const parent = parents.find(p => {
          const normalizedParentPhone = (p.phone || '').replace(/\D/g, '');
          return normalizedParentPhone === normalizedInvPhone && normalizedInvPhone.length >= 10;
        });

        // Skip if this parent already paid this month via any method (cash/Zelle/Square)
        if (parent?.payments?.[currentMonth]?.status === 'paid') {
          skippedPaid++;
          continue;
        }

        if (parent) {
          matched.push({
            parentId: parent.id,
            firstName: parent.firstName,
            lastName: parent.lastName,
            phone: parent.phone || '',
            invoiceId: inv.invoiceId,
            total: inv.amount,
            months: [], // already published, months not needed
            publicUrl: inv.publicUrl,
          });
        } else {
          // No match in dashboard — still include with Square data
          const nameParts = inv.name.split(' ');
          matched.push({
            parentId: `square_${inv.invoiceId}`,
            firstName: nameParts[0] || 'Unknown',
            lastName: nameParts.slice(1).join(' ') || '',
            phone: inv.phone,
            invoiceId: inv.invoiceId,
            total: inv.amount,
            months: [],
            publicUrl: inv.publicUrl,
          });
        }
      }
      if (skippedPaid > 0) {
        showNotification(`Skipped ${skippedPaid} already-paid (cash/Zelle) families from the re-send queue`, 'success');
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

  // Send text to a single parent with their existing invoice link
  // If dashboard balance doesn't match Square invoice, cancel old + create new
  const sendTextToParent = async (parent: Parent) => {
    const normalizedPhone = (parent.phone || '').replace(/\D/g, '').replace(/^1/, '');
    const dashboardBalance = getBalance(parent);

    setTextingParent(parent.id);

    // Fetch fresh invoice data from Square
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

    // If amounts don't match, cancel old invoice and create a new one
    if (invoiceId && amount !== dashboardBalance && dashboardBalance > 0) {
      showNotification(`Updating invoice: $${amount} → $${dashboardBalance}...`, 'success');
      try {
        // Cancel old invoice
        await fetch('/api/square/invoice/batch-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds: [invoiceId] }),
        });

        // Build line items from dashboard state
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

        // Create new invoice
        const createRes = await fetch('/api/square/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: parent.phone,
            customerId: parent.squareCustomerId,
            lineItems,
            message: getDefaultMessage(overdueMonths),
            dueDate: getDefaultDueDate(),
            playerName: (parent.playerNames || []).join(', ') || parent.firstName,
            parentFirstName: parent.firstName,
            parentLastName: parent.lastName,
            billingMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          }),
        });
        const createData = await createRes.json();

        if (createData.success && createData.invoiceId) {
          // Publish it
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
            phone: parent.phone,
            customerId: parent.squareCustomerId,
            lineItems,
            message: getDefaultMessage(overdueMonths),
            dueDate: getDefaultDueDate(),
            playerName: (parent.playerNames || []).join(', ') || parent.firstName,
            parentFirstName: parent.firstName,
            parentLastName: parent.lastName,
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
      next.set(normalizedPhone, { invoiceId: invoiceId, publicUrl, amount, name: `${parent.firstName} ${parent.lastName}` });
      return next;
    });

    // Build trackable redirect URL — Square has no "viewed" API, so we route through
    // /r/{parentId}/{month} which logs the click and forwards to the Square invoice page.
    const trackUrl = `${window.location.origin}/r/${parent.id}/${currentMonth}`;
    const smsBody = `Hi ${parent.firstName}, your AZ Flight Basketball payment of $${amount} is ready. Pay here: ${trackUrl} - Coach Jonas`;

    // Stash invoice details on the modal so the user can confirm-sent later
    setSendTextModal({ parent, phone: normalizedPhone, message: smsBody, amount });
    setTextingParent(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <DashboardHeader />
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="text-2xl font-bold text-orange-500">Flight Pay</h1>
              <p className="text-gray-400 text-sm">AZ Flight Basketball — Unified Invoicing (Stripe + Twilio)</p>
            </div>
            <button onClick={() => setAddModal(true)}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition">
              + Add Family
            </button>
          </div>

          {/* Unified Stripe/Twilio invoicing pipeline (current) */}
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-indigo-400 font-semibold mr-2">Invoicing Pipeline</span>
            <button onClick={syncStripeCustomers} disabled={stripeSyncing}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition disabled:opacity-50">
              {stripeSyncing ? 'Syncing…' : '1. Sync Stripe Customers'}
            </button>
            <button onClick={createStripeInvoicesForCurrentMonth} disabled={stripeBatchCreating}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition disabled:opacity-50">
              {stripeBatchCreating ? 'Creating…' : '2. Create Stripe Invoices'}
            </button>
            <button onClick={sendStripeInvoicesViaSms} disabled={smsSending}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-bold transition disabled:opacity-50">
              {smsSending ? 'Sending…' : '3. Send All SMS via Twilio'}
            </button>
            <button onClick={assignTeams} disabled={migrating}
              className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium transition disabled:opacity-50">
              {migrating ? 'Assigning…' : 'Set Teams'}
            </button>
          </div>

          {/* Square fallback (legacy — kept dormant per Taleb hedge) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold mr-2">Square (legacy fallback)</span>
            <button onClick={createAllDrafts} disabled={batchCreating}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition disabled:opacity-50">
              {batchCreating ? 'Creating…' : 'Create Square Drafts'}
            </button>
            <button onClick={resendTexts} disabled={resendLoading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition disabled:opacity-50">
              {resendLoading ? 'Loading…' : 'Re-send via Phone Link'}
            </button>
            {pendingInvoices.length > 0 && (
              <button onClick={() => setShowBatchSend(true)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold transition">
                Send All Texts ({pendingInvoices.length})
              </button>
            )}
            <button onClick={syncWithSquare} disabled={syncing}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition disabled:opacity-50">
              {syncing ? 'Syncing…' : 'Sync Square'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Current Month Invoice Status — Paid / Viewed / Not Viewed / Not Sent */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-200">{currentMonthLabel} — Invoice Status</h2>
            <span className="text-sm text-gray-500">Click a card to see who&apos;s in it</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {([
              { key: 'paid' as const, label: 'Paid', color: 'green', desc: 'Square shows paid' },
              { key: 'viewed_unpaid' as const, label: 'Viewed · Unpaid', color: 'yellow', desc: 'Opened the link but not paid' },
              { key: 'sent_not_viewed' as const, label: 'Sent · Not Viewed', color: 'orange', desc: 'Texted but never opened' },
              { key: 'not_sent' as const, label: 'Not Sent', color: 'red', desc: 'Owes but no invoice texted yet' },
            ]).map(({ key, label, color, desc }) => {
              const list = buckets[key];
              const colorMap: Record<string, string> = {
                green: 'border-green-600/60 bg-green-900/20 text-green-400',
                yellow: 'border-yellow-600/60 bg-yellow-900/20 text-yellow-400',
                orange: 'border-orange-600/60 bg-orange-900/20 text-orange-400',
                red: 'border-red-600/60 bg-red-900/20 text-red-400',
              };
              return (
                <button
                  key={key}
                  onClick={() => setOpenBucket(openBucket === key ? null : key)}
                  className={`rounded-xl p-5 border text-left transition hover:brightness-125 ${colorMap[color]} ${openBucket === key ? 'ring-2 ring-white/30' : ''}`}
                >
                  <p className="text-sm font-medium opacity-90">{label}</p>
                  <p className="text-3xl font-bold mt-1">{list.length}</p>
                  <p className="text-xs opacity-70 mt-1">{desc}</p>
                </button>
              );
            })}
          </div>

          {/* Drilldown list for the open bucket */}
          {openBucket && (
            <div className="mt-4 bg-gray-800 border border-gray-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-200">
                  {openBucket.replace(/_/g, ' ')} — {buckets[openBucket].length} families
                </h3>
                <div className="flex gap-2">
                  {(openBucket === 'viewed_unpaid' || openBucket === 'sent_not_viewed' || openBucket === 'not_sent') && buckets[openBucket].length > 0 && (
                    <button
                      onClick={() => remindBucket(openBucket)}
                      disabled={bucketTexting}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      {bucketTexting ? 'Sending...' : `Re-text all ${buckets[openBucket].length}`}
                    </button>
                  )}
                  <button onClick={() => setOpenBucket(null)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-sm">
                    Close
                  </button>
                </div>
              </div>
              {buckets[openBucket].length === 0 ? (
                <p className="text-gray-500 text-sm">No families in this bucket.</p>
              ) : (
                <div className="divide-y divide-gray-700">
                  {buckets[openBucket]
                    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
                    .map(p => {
                      const activity = p.invoiceActivity?.[currentMonth];
                      const sentAgo = activity?.sentAt ? Math.round((Date.now() - new Date(activity.sentAt).getTime()) / 60000) : null;
                      const viewedAgo = activity?.viewedAt ? Math.round((Date.now() - new Date(activity.viewedAt).getTime()) / 60000) : null;
                      const fmt = (m: number) => m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
                      return (
                        <div key={p.id} className="flex items-center justify-between py-2.5">
                          <div className="flex-1">
                            <p className="font-medium text-white">{p.firstName} {p.lastName}</p>
                            <p className="text-xs text-gray-400">
                              {(p.playerNames || []).join(', ') || '-'} · ${getBalance(p)}
                              {sentAgo !== null && <span className="ml-2">· sent {fmt(sentAgo)}</span>}
                              {viewedAgo !== null && <span className="ml-2 text-yellow-400">· viewed {fmt(viewedAgo)} ({activity?.viewCount ?? 0}x)</span>}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {openBucket !== 'paid' && activity?.sentAt && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Mark ${p.firstName} as NOT texted? (This clears the sent/viewed history for ${currentMonthLabel} only.)`)) return;
                                  try {
                                    const res = await fetch('/api/audit/clear-sent', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ parentIds: [p.id], month: currentMonth }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      setParents(prev => prev.map(x => {
                                        if (x.id !== p.id) return x;
                                        const nextActivity = { ...(x.invoiceActivity || {}) };
                                        delete nextActivity[currentMonth];
                                        return { ...x, invoiceActivity: nextActivity };
                                      }));
                                      showNotification(`Cleared sent history for ${p.firstName}`, 'success');
                                    } else {
                                      showNotification('Failed to clear sent history', 'error');
                                    }
                                  } catch {
                                    showNotification('Failed to clear sent history', 'error');
                                  }
                                }}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-sm font-medium"
                                title="Clear the sent/viewed history for this month only — use when the family was marked sent but wasn't actually texted"
                              >
                                Undo sent
                              </button>
                            )}
                            {openBucket !== 'paid' && p.phone && (
                              <button
                                onClick={() => sendTextToParent(p)}
                                disabled={textingParent === p.id}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-sm font-medium disabled:opacity-50"
                              >
                                {textingParent === p.id ? '...' : (activity?.sentAt ? 'Re-text' : 'Text')}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-base">Total Families</p>
            <p className="text-3xl font-bold">{totalFamilies}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-base">Paid This Month</p>
            <p className="text-3xl font-bold text-green-500">{paidThisMonth}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-base">Outstanding</p>
            <p className="text-3xl font-bold text-orange-500">{outstanding}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-base">Total Owed</p>
            <p className="text-3xl font-bold text-red-500">${totalOwed.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {(['all', 'owes', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-md font-medium transition ${filter === f ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                {f === 'all' ? 'All' : f === 'owes' ? 'Owes' : 'Paid'}
              </button>
            ))}
          </div>
          <div className="flex bg-gray-800 rounded-lg p-1">
            {(['all', 'active', 'on_break', 'exempt', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-md text-base font-medium transition ${statusFilter === s ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {s === 'all' ? 'All Status' : STATUS_COLORS[s].label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-base w-56" />
        </div>

        {/* Table */}
        {parents.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
            <p className="text-gray-400 text-lg mb-4">No data imported yet</p>
            <a href="/import" className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition">
              Import Your Excel Tracker
            </a>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-lg">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left px-4 py-4 text-gray-400 font-semibold text-base">Parent</th>
                  <th className="text-left px-4 py-4 text-gray-400 font-semibold text-base">Players</th>
                  <th className="text-center px-3 py-4 text-gray-400 font-semibold text-base">Rate</th>
                  <th className="text-left px-4 py-4 text-gray-400 font-semibold text-base">Phone</th>
                  {monthColumns.map(col => (
                    <th key={col.key} className="text-center px-3 py-4 text-gray-400 font-semibold text-base">{col.shortLabel}</th>
                  ))}
                  <th className="text-center px-3 py-4 text-gray-400 font-semibold text-base">Extras</th>
                  <th className="text-right px-4 py-4 text-gray-400 font-semibold text-base">Balance</th>
                  <th className="text-center px-3 py-4 text-gray-400 font-semibold text-base">Status</th>
                  <th className="text-right px-4 py-4 text-gray-400 font-semibold text-base">Actions</th>
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
                        <td colSpan={10} className="bg-gray-700/60 px-4 py-3 border-b border-gray-600">
                          <span className="text-lg font-bold text-orange-400">{teamGroup || 'Unassigned'}</span>
                          <span className="text-sm text-gray-400 ml-3">{teamParents.length} {teamParents.length === 1 ? 'family' : 'families'}</span>
                        </td>
                      </tr>
                      {teamParents.map(parent => {
                  const balance = getBalance(parent);
                  const payments = parent.payments || {};
                  const status = parent.status || 'active';
                  const unpaidExtras = (parent.lineItems || []).filter(li => li.status !== 'paid');
                  const extrasTotal = unpaidExtras.reduce((s, li) => s + li.amount, 0);
                  // Only treat this family as needing an invoice if they haven't paid the CURRENT MONTH.
                  // (getBalance sums unpaid cells across all 3 visible months, which inflates the count
                  // for families that joined partway through the season and never had earlier months billed.)
                  const paidCurrentMonth = parent.payments?.[currentMonth]?.status === 'paid';
                  const canInvoice = !paidCurrentMonth && parent.phone && status === 'active';

                  return (
                    <tr key={parent.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                      {/* Parent Name */}
                      <td className="px-4 py-4">
                        <p className="font-medium">{parent.firstName} {parent.lastName}</p>
                        {parent.email && <p className="text-gray-500 text-sm">{parent.email}</p>}
                      </td>

                      {/* Players */}
                      <td className="px-4 py-3">
                        <p className="text-gray-300">{(parent.playerNames || []).join(', ') || '-'}</p>
                      </td>

                      {/* Rate */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-gray-300">${getMonthlyRate(parent)}</span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        {parent.phone || <span className="text-red-400">No phone</span>}
                      </td>

                      {/* Month Checkboxes */}
                      {monthColumns.map(col => {
                        const payment = payments[col.key];
                        const isPaid = payment?.status === 'paid';
                        const isDropdownOpen = paymentDropdown?.parentId === parent.id && paymentDropdown?.month === col.key;

                        return (
                          <td key={col.key} className="px-3 py-3 text-center relative">
                            {isPaid ? (
                              <button onClick={() => undoPayment(parent.id, col.key)}
                                className="w-10 h-10 rounded bg-green-500/30 border-2 border-green-400/60 flex items-center justify-center mx-auto hover:bg-green-500/50 transition"
                                title={`Paid via ${payment.method} — click to undo`}>
                                <span className={`text-sm font-bold text-white ${METHOD_BADGES[payment.method || '']?.color || ''} rounded px-1.5`}>
                                  {METHOD_BADGES[payment.method || '']?.label || '?'}
                                </span>
                              </button>
                            ) : status === 'on_break' || status === 'exempt' || status === 'inactive' ? (
                              <div className="w-10 h-10 rounded bg-gray-700 border border-gray-600 flex items-center justify-center mx-auto">
                                <span className="text-gray-500 text-sm">-</span>
                              </div>
                            ) : (
                              <div className="relative inline-block">
                                <button onClick={() => setPaymentDropdown(isDropdownOpen ? null : { parentId: parent.id, month: col.key })}
                                  className="w-10 h-10 rounded bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center mx-auto hover:bg-red-500/30 transition">
                                </button>
                                {isDropdownOpen && (
                                  <div className="absolute z-20 top-12 left-1/2 -translate-x-1/2 bg-gray-700 rounded-lg shadow-xl border border-gray-600 py-2 min-w-[120px]">
                                    <button onClick={() => markPayment(parent.id, col.key, 'square')}
                                      className="block w-full text-left px-4 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-600 hover:text-white transition">
                                      Square
                                    </button>
                                    <button onClick={() => markPayment(parent.id, col.key, 'zelle')}
                                      className="block w-full text-left px-4 py-2.5 text-sm font-medium text-purple-300 hover:bg-purple-600 hover:text-white transition">
                                      Zelle
                                    </button>
                                    <button onClick={() => markPayment(parent.id, col.key, 'cash')}
                                      className="block w-full text-left px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600 hover:text-white transition">
                                      Cash
                                    </button>
                                    <button onClick={() => setPaymentDropdown(null)}
                                      className="block w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-600 transition border-t border-gray-600 mt-1 pt-2.5">
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
                      <td className="px-3 py-3 text-center">
                        {unpaidExtras.length > 0 ? (
                          <button onClick={() => setAddChargeModal(parent)}
                            className="text-sm text-yellow-400 hover:text-yellow-300">
                            {unpaidExtras.length} item{unpaidExtras.length > 1 ? 's' : ''} - ${extrasTotal}
                          </button>
                        ) : (
                          <button onClick={() => setAddChargeModal(parent)}
                            className="text-sm text-gray-500 hover:text-gray-400">
                            +
                          </button>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${balance === 0 ? 'text-green-500' : balance > getMonthlyRate(parent) ? 'text-red-500' : 'text-orange-500'}`}>
                          ${balance}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        <select value={status}
                          onChange={e => updateStatus(parent.id, e.target.value as ParentStatus)}
                          className={`text-sm font-semibold rounded-full px-3 py-1.5 border-0 cursor-pointer ${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`}>
                          <option value="active">Active</option>
                          <option value="on_break">On Break</option>
                          <option value="exempt">Exempt</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {(() => {
                            // Show a concrete status line per family for the current month —
                            // Paid · Viewed · Sent · Not Sent — similar to Square's invoice list.
                            const activity = parent.invoiceActivity?.[currentMonth];
                            const paid = parent.payments?.[currentMonth];
                            const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });

                            // PAID — highest priority
                            if (paid?.status === 'paid') {
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="px-3 py-1.5 bg-green-600/30 border border-green-600 text-green-300 rounded text-sm font-semibold">
                                    Paid {paid.method ? `(${paid.method})` : ''}
                                  </span>
                                  {paid.paidAt && <span className="text-xs text-gray-500">{fmtDate(paid.paidAt)}</span>}
                                </div>
                              );
                            }

                            // Only show text/re-text controls for active families with a phone
                            if (!canInvoice) return null;

                            // VIEWED · UNPAID
                            if (activity?.viewedAt) {
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="px-3 py-1.5 bg-yellow-600/30 border border-yellow-600 text-yellow-200 rounded text-sm font-semibold">
                                    Viewed ({activity.viewCount ?? 0}×)
                                  </span>
                                  <span className="text-xs text-gray-500">viewed {fmtDate(activity.viewedAt)}</span>
                                  <button onClick={() => sendTextToParent(parent)} disabled={textingParent === parent.id}
                                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 mt-0.5">
                                    {textingParent === parent.id ? 'Updating...' : 'Re-text'}
                                  </button>
                                </div>
                              );
                            }

                            // SENT · NOT VIEWED
                            if (activity?.sentAt) {
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="px-3 py-1.5 bg-orange-600/30 border border-orange-600 text-orange-200 rounded text-sm font-semibold">
                                    Sent · not viewed
                                  </span>
                                  <span className="text-xs text-gray-500">sent {fmtDate(activity.sentAt)}</span>
                                  <button onClick={() => sendTextToParent(parent)} disabled={textingParent === parent.id}
                                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 mt-0.5">
                                    {textingParent === parent.id ? 'Updating...' : 'Re-text'}
                                  </button>
                                </div>
                              );
                            }

                            // NOT SENT — the green call-to-action
                            return (
                              <button onClick={() => sendTextToParent(parent)} disabled={textingParent === parent.id}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md text-base font-medium transition disabled:opacity-50">
                                {textingParent === parent.id ? 'Creating...' : 'Text'}
                              </button>
                            );
                          })()}
                          <button onClick={() => setEditModal(parent)}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-base font-medium transition">
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

      {/* Send Text Modal — shown when user clicks Text/Re-text.
          Big tap targets for the phone + message, then a Mark Sent button
          that stamps invoiceActivity.sentAt. */}
      {sendTextModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 border border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Text {sendTextModal.parent.firstName}</h2>
                <p className="text-gray-400 text-sm">${sendTextModal.amount} · {currentMonthLabel}</p>
              </div>
              <button onClick={() => setSendTextModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* Phone — tap to copy */}
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Phone (tap to copy)</p>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(sendTextModal.phone); showNotification('Phone copied', 'success'); } catch {}
                }}
                className="w-full bg-gray-900 hover:bg-gray-700 rounded-lg px-4 py-4 text-left text-xl font-mono text-white border border-gray-700"
              >
                {sendTextModal.phone}
              </button>
            </div>

            {/* Message — tap to copy */}
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Message (tap to copy)</p>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(sendTextModal.message); showNotification('Message copied', 'success'); } catch {}
                }}
                className="w-full bg-gray-900 hover:bg-gray-700 rounded-lg px-4 py-3 text-left text-sm text-white whitespace-pre-wrap border border-gray-700"
              >
                {sendTextModal.message}
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSendTextModal(null)}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { parent, amount } = sendTextModal;
                  try {
                    const parentRef = doc(db, 'parents', parent.id);
                    const now = new Date().toISOString();
                    const previous = parent.invoiceActivity?.[currentMonth];
                    const existingInv = existingInvoices.get((parent.phone || '').replace(/\D/g, '').replace(/^1/, ''));
                    const newActivity = {
                      squareInvoiceId: existingInv?.invoiceId || previous?.squareInvoiceId || '',
                      publicUrl: existingInv?.publicUrl || previous?.publicUrl || '',
                      amount,
                      sentAt: now,
                      viewedAt: previous?.viewedAt ?? null,
                      viewCount: previous?.viewCount ?? 0,
                      lastReminderAt: previous?.sentAt ? now : null,
                    };
                    await updateDoc(parentRef, {
                      lastTexted: now,
                      [`invoiceActivity.${currentMonth}`]: newActivity,
                    });
                    setParents(prev => prev.map(p => p.id === parent.id ? {
                      ...p,
                      lastTexted: now,
                      invoiceActivity: { ...(p.invoiceActivity || {}), [currentMonth]: newActivity },
                    } : p));
                    showNotification(`Marked ${parent.firstName} as sent`, 'success');
                  } catch (err) {
                    console.error(err);
                    showNotification('Failed to save', 'error');
                  }
                  setSendTextModal(null);
                }}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold"
              >
                ✓ Mark Sent
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Tap each field to copy. Paste into your messaging app, send, then tap Mark Sent.
            </p>
          </div>
        </div>
      )}

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
        />
      )}

      {/* Click outside to close payment dropdown */}
      {paymentDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setPaymentDropdown(null)} />
      )}
    </div>
  );
}

// ============ EDIT FAMILY MODAL ============
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

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Edit Family</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name"
              className="bg-gray-700 rounded px-3 py-2 text-sm" />
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name"
              className="bg-gray-700 rounded px-3 py-2 text-sm" />
          </div>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <input value={playerNames} onChange={e => setPlayerNames(e.target.value)} placeholder="Player names (comma separated)"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <div className="grid grid-cols-3 gap-3">
            <select value={team} onChange={e => setTeam(e.target.value as Team)}
              className="bg-gray-700 rounded px-3 py-2 text-sm">
              <option value="">No Team</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rateType} onChange={e => setRateType(e.target.value as RateType)}
              className="bg-gray-700 rounded px-3 py-2 text-sm">
              {Object.entries(RATE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            {rateType === 'custom' && (
              <input type="number" value={customRate} onChange={e => setCustomRate(Number(e.target.value))} placeholder="Amount"
                className="bg-gray-700 rounded px-3 py-2 text-sm" />
            )}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" rows={2} />
        </div>
        <div className="flex justify-between mt-6">
          <button onClick={onDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition">Delete</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded text-sm font-medium transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ADD FAMILY MODAL ============
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

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Add Family</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name"
              className="bg-gray-700 rounded px-3 py-2 text-sm" />
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name"
              className="bg-gray-700 rounded px-3 py-2 text-sm" />
          </div>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <input value={playerNames} onChange={e => setPlayerNames(e.target.value)} placeholder="Player names (comma separated)"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
          <div className="grid grid-cols-3 gap-3">
            <select value={team} onChange={e => setTeam(e.target.value as Team)}
              className="bg-gray-700 rounded px-3 py-2 text-sm">
              <option value="">No Team</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rateType} onChange={e => setRateType(e.target.value as RateType)}
              className="bg-gray-700 rounded px-3 py-2 text-sm">
              {Object.entries(RATE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            {rateType === 'custom' && (
              <input type="number" value={customRate} onChange={e => setCustomRate(Number(e.target.value))} placeholder="Amount"
                className="bg-gray-700 rounded px-3 py-2 text-sm" />
            )}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes"
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || !firstName}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded text-sm font-medium transition disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Family'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ ADD CHARGE MODAL ============
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

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Line Items — {parent.firstName} {parent.lastName}</h2>

        {/* Existing Items */}
        {existingItems.length > 0 && (
          <div className="mb-4 space-y-2">
            {existingItems.map(item => (
              <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${item.status === 'paid' ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-700'}`}>
                <div>
                  <p className="text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-gray-400">${item.amount} {item.status === 'paid' ? `- Paid (${item.method})` : '- Unpaid'}</p>
                </div>
                {item.status !== 'paid' && (
                  <div className="flex gap-1">
                    {(['square', 'zelle', 'cash'] as PaymentMethod[]).map(m => (
                      <button key={m} onClick={() => onMarkPaid(item.id, m)}
                        className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs capitalize transition">
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add New Item */}
        {showAdd ? (
          <div className="space-y-3 border-t border-gray-700 pt-4">
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
              className="bg-gray-700 rounded px-3 py-2 text-sm w-full">
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
                className="bg-gray-700 rounded px-3 py-2 text-sm w-full">
                <option value="">Select variation</option>
                {catalogItems.find(ci => ci.id === catalogItemId)?.variations.map(v => (
                  <option key={v.id} value={v.id}>{v.name} — ${v.priceMoney.amount}</option>
                ))}
              </select>
            )}
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (e.g., Uniform)"
              className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
            <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="Amount"
              className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition">Cancel</button>
              <button onClick={handleSave} disabled={saving || !description || amount <= 0}
                className="px-3 py-2 bg-orange-500 hover:bg-orange-600 rounded text-sm font-medium transition disabled:opacity-50">
                {saving ? 'Adding...' : 'Add Charge'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 text-sm transition">
            + Add New Charge
          </button>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition">Close</button>
        </div>
      </div>
    </div>
  );
}

// ============ SEND INVOICE MODAL ============
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
  const [copied, setCopied] = useState(false);

  const totalMonthly = includeMonths.length * rate;
  const totalExtras = unpaidExtras.filter(li => includeExtras.includes(li.id)).reduce((s, li) => s + li.amount, 0);
  const total = totalMonthly + totalExtras;

  // Update message when due date changes
  const handleDueDateChange = (newDate: string) => {
    setDueDate(newDate);
    setMessage(getDefaultMessage(includeMonths));
  };

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      // Build line items for the API
      const lineItems: Array<{ catalogItemVariationId?: string; description?: string; amount?: number; quantity?: number }> = [];

      // Add monthly fee line items
      for (const month of includeMonths) {
        const [y, mo] = month.split('-');
        const monthLabel = new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
        lineItems.push({ description: `Monthly Fee - ${monthLabel}`, amount: rate, quantity: 1 });
      }

      // Add extra line items
      for (const extra of unpaidExtras.filter(li => includeExtras.includes(li.id))) {
        lineItems.push({ description: extra.description, amount: extra.amount, quantity: 1 });
      }

      const response = await fetch('/api/square/invoice', {
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

      const data = await response.json();
      if (data.success) {
        setSentResult({ invoiceId: data.invoiceId, publicUrl: null });
        // Auto-queue for batch send (draft — not published yet)
        if (data.invoiceId && parent.phone) {
          setTimeout(() => {
            onQueue({
              parentId: parent.id,
              firstName: parent.firstName,
              lastName: parent.lastName,
              phone: parent.phone || '',
              invoiceId: data.invoiceId,
              total,
              months: includeMonths,
            });
          }, 1500); // Brief delay so user sees success message
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

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Send Invoice</h2>
        <p className="text-gray-400 text-sm mb-4">{parent.firstName} {parent.lastName} — {parent.phone}</p>

        {/* Months to include */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-300 mb-2">Monthly Fees (${rate}/mo)</p>
          <div className="space-y-1">
            {monthColumns.map(col => {
              const isPaid = payments[col.key]?.status === 'paid';
              if (isPaid) return null;
              const included = includeMonths.includes(col.key);
              return (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={included}
                    onChange={e => setIncludeMonths(prev =>
                      e.target.checked ? [...prev, col.key] : prev.filter(m => m !== col.key)
                    )}
                    className="rounded" />
                  <span>{col.label}</span>
                  <span className="text-gray-500">${rate}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Extras to include */}
        {unpaidExtras.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-300 mb-2">Extra Charges</p>
            <div className="space-y-1">
              {unpaidExtras.map(item => {
                const included = includeExtras.includes(item.id);
                return (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={included}
                      onChange={e => setIncludeExtras(prev =>
                        e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                      )}
                      className="rounded" />
                    <span>{item.description}</span>
                    <span className="text-gray-500">${item.amount}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="bg-gray-700 rounded-lg p-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Monthly ({includeMonths.length} month{includeMonths.length !== 1 ? 's' : ''})</span>
            <span>${totalMonthly}</span>
          </div>
          {totalExtras > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Extras</span>
              <span>${totalExtras}</span>
            </div>
          )}
          <div className="flex justify-between font-bold mt-1 pt-1 border-t border-gray-600">
            <span>Total</span>
            <span>${total}</span>
          </div>
        </div>

        {/* Due Date */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-300 block mb-1">Due Date</label>
          <input type="date" value={dueDate} onChange={e => handleDueDateChange(e.target.value)}
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" />
        </div>

        {/* Message */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-300 block mb-1">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            className="bg-gray-700 rounded px-3 py-2 text-sm w-full" rows={4} />
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {sentResult ? (
          <div className="space-y-3">
            <div className="bg-green-600/20 border border-green-600 rounded-lg p-4 text-center">
              <p className="text-green-400 font-bold text-lg mb-1">Draft Created!</p>
              <p className="text-green-300 text-sm">Queued for batch send — parents can&apos;t see this yet</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition">Cancel</button>
            <button onClick={handleSend} disabled={sending || total === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition disabled:opacity-50">
              {sending ? 'Creating...' : `Create Invoice ($${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ BATCH SEND MODAL ============
function BatchSendModal({ invoices, onClose, onClear, onSent }: {
  invoices: Array<{ parentId: string; firstName: string; lastName: string; phone: string; invoiceId: string; total: number; months: string[]; publicUrl?: string }>;
  onClose: () => void;
  onClear: () => void;
  onSent: (parentId: string) => void;
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
    if (newSentCount === invoices.length) {
      // All done
    } else if (currentIndex < invoices.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleSendAndNext = async () => {
    let publicUrl = current.publicUrl;

    // Normal mode: publish draft first
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

    // Copy message to clipboard and show "awaiting next" state
    const smsBody = buildSmsBody(current, publicUrl!);
    try {
      await navigator.clipboard.writeText(smsBody);
      setCopiedMessage(smsBody);
    } catch {
      setCopiedMessage(smsBody);
    }

    // Open Phone Link via sms: using a hidden link click (doesn't navigate away)
    const normalizedPhone = current.phone.replace(/\D/g, '');
    const smsLink = document.createElement('a');
    smsLink.href = `sms:${normalizedPhone}`;
    smsLink.click();

    setAwaitingNext(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">{isResendMode ? 'Re-send Texts' : 'Send All Texts'}</h2>
        <p className="text-gray-400 text-sm mb-4">
          {isResendMode
            ? `${invoices.length} published invoices — tap Send to open SMS, then tap Next after sending`
            : `${invoices.length} draft invoices — tap Send to publish & text each family`
          }
        </p>

        {/* Progress bar */}
        <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
          <div
            className="bg-green-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${(sentCount / invoices.length) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-400 mb-4">{sentCount} / {invoices.length} sent</p>

        {isComplete ? (
          <div className="space-y-4">
            <div className="bg-green-600/20 border border-green-600 rounded-lg p-6 text-center">
              <p className="text-green-400 font-bold text-2xl mb-1">All Done!</p>
              <p className="text-green-300">All {invoices.length} invoices texted</p>
            </div>
            <button onClick={onClear}
              className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium transition">
              Clear Queue & Close
            </button>
          </div>
        ) : current ? (
          <div className="space-y-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-lg">{current.firstName} {current.lastName}</p>
                  <p className="text-gray-400 text-sm">{current.phone}</p>
                </div>
                <p className="text-xl font-bold text-green-400">${current.total}</p>
              </div>
              {current.months.length > 0 && (
                <p className="text-sm text-gray-400 mt-1">
                  {current.months.map(m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short' }); }).join(', ')}
                </p>
              )}
              {current.publicUrl && (
                <p className="text-xs text-blue-400 mt-1 truncate">Already published</p>
              )}
            </div>

            {publishError && <p className="text-red-400 text-sm">{publishError}</p>}

            {awaitingNext ? (
              <div className="space-y-3">
                <div className="bg-yellow-600/20 border border-yellow-600 rounded-lg p-4">
                  <p className="text-yellow-300 font-bold text-lg mb-2">Message copied! Paste in Phone Link</p>
                  <p className="text-yellow-200 text-sm mb-3">1. Phone Link should be open to {current.firstName}&apos;s conversation<br/>2. Tap the message box and <strong>Ctrl+V</strong> to paste<br/>3. Hit Send<br/>4. Come back here and click Next</p>
                  {copiedMessage && (
                    <div className="bg-gray-800 rounded p-2 text-xs text-gray-300 max-h-20 overflow-y-auto border border-gray-600">
                      {copiedMessage}
                    </div>
                  )}
                  <button onClick={async () => {
                    if (copiedMessage) {
                      await navigator.clipboard.writeText(copiedMessage);
                    }
                  }}
                    className="mt-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-xs text-gray-300 transition">
                    Re-copy message
                  </button>
                </div>
                <button onClick={advanceToNext}
                  className="w-full px-4 py-5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-bold transition text-white">
                  Next &rarr;
                </button>
              </div>
            ) : (
              <button onClick={handleSendAndNext} disabled={publishing}
                className="w-full px-4 py-5 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold transition text-white disabled:opacity-50">
                {publishing ? 'Publishing...' : `Send Text to ${current.firstName} →`}
              </button>
            )}

            {!awaitingNext && (
              <button onClick={() => {
                if (currentIndex < invoices.length - 1) {
                  setCurrentIndex(prev => prev + 1);
                }
              }}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm text-gray-300 transition">
                Skip
              </button>
            )}

            <div className="border-t border-gray-700 pt-3 mt-2">
              <p className="text-xs text-gray-500 mb-2">Queue ({invoices.length - currentIndex} remaining)</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {invoices.slice(currentIndex).map((inv, i) => (
                  <div key={inv.parentId} className={`flex justify-between text-sm px-2 py-1 rounded ${i === 0 ? 'bg-gray-600' : ''}`}>
                    <span className={i === 0 ? 'text-white font-medium' : 'text-gray-400'}>{inv.firstName} {inv.lastName}</span>
                    <span className="text-gray-500">${inv.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex justify-between mt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">
            Minimize
          </button>
          <button onClick={onClear} className="px-4 py-2 text-red-400 hover:text-red-300 text-sm transition">
            Clear Queue
          </button>
        </div>
      </div>
    </div>
  );
}
