
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Wallet, ArrowUpRight, ArrowDownLeft, Bell, History, User, 
  PieChart, Trash2, X, Loader2, ChevronLeft, RotateCcw, Sparkles, 
  BellRing, AlarmClockPlus, UserPlus, Users, Lock, Unlock, ShieldCheck, 
  Eye, EyeOff, AlertCircle, AlertTriangle, ReceiptText, Activity, 
  CheckCircle2, ChevronRight, Tags, Briefcase,
  Contact, Settings, Shield, MapPin, Mail, Phone, RefreshCcw,
  Layers, Calculator, Save, SlidersHorizontal, ToggleLeft, ToggleRight,
  Check, Sun, Moon, Calendar, ChevronUp, ChevronDown
} from 'lucide-react';
import { 
  Transaction, TransactionType, UserSettings, AutoPayRule 
} from './types.ts';
import { 
  INITIAL_SETTINGS 
} from './constants.ts';
import { enhanceTransactionDetails } from './services/gemini.ts';

// --- Helpers ---
const formatINR = (amount: number, forceSign: string = "") => {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(absAmount).replace('₹', '₹ ');
  
  if (forceSign) return `${forceSign}${formatted}`;
  return amount < 0 ? `- ${formatted}` : formatted;
};

const getMaskedINR = (val: string | number) => {
  if (!val && val !== 0) return "";
  const strVal = val.toString();
  const parts = strVal.split('.');
  let integerPart = parts[0].replace(/[^0-9-]/g, ''); 
  const decimalPart = parts.length > 1 ? '.' + parts[1].substring(0, 2) : '';
  if (integerPart === "" || integerPart === "-") return integerPart + decimalPart;
  const isNegative = integerPart.startsWith('-');
  const absInteger = isNegative ? integerPart.substring(1) : integerPart;
  let lastThree = absInteger.substring(absInteger.length - 3);
  let otherNumbers = absInteger.substring(0, absInteger.length - 3);
  if (otherNumbers !== '') lastThree = ',' + lastThree;
  let res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return (isNegative ? "-" : "") + res + decimalPart;
};

const App: React.FC = () => {
  // --- States ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profileView, setProfileView] = useState<'menu' | 'security' | 'accounts' | 'categories' | 'identity' | 'event-config' | 'adjustment'>('menu');

  // UI Feedback States
  const [recordSuccess, setRecordSuccess] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);
  
  // Form States
  const [formData, setFormData] = useState<Partial<Transaction>>({
    type: 'expense', amount: 0, account: INITIAL_SETTINGS.accounts[0], category: 'General',
    date: new Date().toISOString().split('T')[0], note: '', person: '', eventId: '',
    paidBy: 'Self', paymentMethod: 'UPI'
  });
  const [expenseAsCredit, setExpenseAsCredit] = useState(false);
  
  // Filtering States
  const [typeFilter, setTypeFilter] = useState('All');
  const [accountFilter, setAccountFilter] = useState('All');
  
  const [selectedPersonDetail, setSelectedPersonDetail] = useState<string | null>(null);

  // Security Logic
  const [showTotalBalance, setShowTotalBalance] = useState(false);
  const [revealedAccounts, setRevealedAccounts] = useState<Record<string, boolean>>({});
  const [pinEntryMode, setPinEntryMode] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinSuccessAction, setPinSuccessAction] = useState<{ type: string; payload?: any } | null>(null);

  // Manual Adjustment Local States
  const [adjAccountValues, setAdjAccountValues] = useState<Record<string, string>>({});
  const [adjLedgerValues, setAdjLedgerValues] = useState<Record<string, string>>({});

  // Advanced Security States
  const [oldPinVerify, setOldPinVerify] = useState("");
  const [newPinRequest, setNewPinRequest] = useState("");
  const [confirmPinRequest, setConfirmPinRequest] = useState("");
  const [securityTab, setSecurityTab] = useState<'status' | 'change' | 'reset'>('status');

  // Overlays
  const [showAutoPayManager, setShowAutoPayManager] = useState(false);
  const [showAddAutoPay, setShowAddAutoPay] = useState(false);
  const [newAutoPay, setNewAutoPay] = useState<Partial<AutoPayRule>>({
    day: '1', amount: 0, purpose: '', account: INITIAL_SETTINGS.accounts[0], type: 'expense'
  });

  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  const [newItemName, setNewItemName] = useState("");

  const STORAGE_KEY = 'fintrack_pro_v22_master';

  // --- Initialization ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTransactions(parsed.transactions || []);
        // Deep merge with INITIAL_SETTINGS to ensure new keys exist
        const mergedSettings = { 
          ...INITIAL_SETTINGS, 
          ...parsed.settings,
          profile: { ...INITIAL_SETTINGS.profile, ...(parsed.settings?.profile || {}) },
          accountLockSettings: { ...INITIAL_SETTINGS.accountLockSettings, ...(parsed.settings?.accountLockSettings || {}) }
        };
        setSettings(mergedSettings);
      } catch (e) { console.error("Restore failed", e); }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, settings }));
    }
  }, [transactions, settings, loading]);

  // Apply Theme
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  const todayStr = new Date().toISOString().split('T')[0];

  // --- Computed Balances ---
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    settings.accounts.forEach(acc => balances[acc] = 0);
    transactions.forEach(t => {
      if (t.type === 'reminder' || t.type === 'external') return;
      const amt = t.amount || 0;
      if (t.type === 'income' || t.type === 'repayment') balances[t.account] += Math.abs(amt);
      else if (t.type === 'expense' || t.type === 'credit') balances[t.account] -= Math.abs(amt);
      else if (t.type === 'adjustment') {
        if (!t.personAdjustment) balances[t.account] += amt; 
      }
      else if (t.type === 'transfer') {
        balances[t.account] -= Math.abs(amt);
        if (t.toAccount) balances[t.toAccount] += Math.abs(amt);
      }
    });
    return balances;
  }, [transactions, settings.accounts]);

  const personCredits = useMemo(() => {
    const credits: Record<string, number> = {};
    settings.peopleList.forEach(p => credits[p] = 0);
    transactions.forEach(t => {
      if (!t.person || t.type === 'external' || t.type === 'reminder') return;
      const amt = t.amount || 0;
      if (t.type === 'credit') credits[t.person] += Math.abs(amt);
      else if (t.type === 'repayment') credits[t.person] -= Math.abs(amt);
      else if (t.type === 'adjustment' && t.personAdjustment) {
        credits[t.person] += amt;
      }
    });
    return credits;
  }, [transactions, settings.peopleList]);

  const totalBalance = useMemo(() => Object.values(accountBalances).reduce((a: number, b: number) => a + b, 0), [accountBalances]);
  const totalNetCredit = useMemo(() => Object.values(personCredits).reduce((a: number, b: number) => a + b, 0), [personCredits]);

  const dueReminders = useMemo(() => {
    return transactions.filter(t => t.type === 'reminder')
      .sort((a,b) => b.timestamp - a.timestamp);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchType = typeFilter === 'All' || t.type === typeFilter;
      const matchAccount = accountFilter === 'All' || t.account === accountFilter || t.toAccount === accountFilter;
      return matchType && matchAccount;
    }).sort((a,b) => b.timestamp - a.timestamp);
  }, [transactions, typeFilter, accountFilter]);

  // --- Handlers ---
  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = formData.type === 'adjustment' ? (formData.amount || 0) : Math.abs(formData.amount || 0);
    if (cleanAmount === 0 && formData.type !== 'reminder' && formData.type !== 'external') return;
    
    let effectiveType: TransactionType = formData.type as TransactionType;
    if (formData.type === 'expense' && expenseAsCredit) {
      effectiveType = 'credit';
    }

    const newTrans: Transaction = {
      id: crypto.randomUUID(),
      type: effectiveType,
      amount: cleanAmount,
      account: formData.account || settings.accounts[0],
      person: formData.person || '',
      category: formData.category || 'General',
      date: formData.date || todayStr,
      note: formData.note || '',
      timestamp: Date.now(),
      eventId: formData.eventId,
      paidBy: formData.paidBy || 'Self',
      paymentMethod: formData.paymentMethod || 'UPI'
    };

    setTransactions(prev => [newTrans, ...prev]);
    setRecordSuccess(true);
    setTimeout(() => {
      setRecordSuccess(false);
      setActiveTab('dashboard');
      setFormData({ type: 'expense', amount: 0, account: settings.accounts[0], category: 'General', date: todayStr, paidBy: 'Self', paymentMethod: 'UPI' });
      setExpenseAsCredit(false);
    }, 1200);
  };

  const handleManualReset = (account: string, newTarget: number) => {
    const current = accountBalances[account] || 0;
    const delta = newTarget - current;
    if (delta === 0) return;

    const resetTrans: Transaction = {
      id: crypto.randomUUID(),
      type: 'adjustment',
      amount: delta,
      account: account,
      category: 'System Reset',
      date: todayStr,
      note: 'Manual Account Calibration',
      timestamp: Date.now()
    };
    setTransactions(prev => [resetTrans, ...prev]);
    setAdjAccountValues(v => ({ ...v, [account]: "" }));
    alert(`${account} calibrated.`);
  };

  const handlePersonReset = (person: string, newTarget: number) => {
    const current = personCredits[person] || 0;
    const delta = newTarget - current;
    if (delta === 0) return;

    const resetTrans: Transaction = {
      id: crypto.randomUUID(),
      type: 'adjustment',
      amount: delta,
      account: settings.accounts[0], 
      person: person,
      personAdjustment: true,
      category: 'Ledger Reset',
      date: todayStr,
      note: 'Manual Ledger Calibration',
      timestamp: Date.now()
    };
    setTransactions(prev => [resetTrans, ...prev]);
    setAdjLedgerValues(v => ({ ...v, [person]: "" }));
    alert(`${person}'s ledger calibrated.`);
  };

  const moveAsset = (index: number, direction: 'up' | 'down') => {
    const newAccounts = [...settings.accounts];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newAccounts.length) return;
    [newAccounts[index], newAccounts[targetIndex]] = [newAccounts[targetIndex], newAccounts[index]];
    setSettings(s => ({ ...s, accounts: newAccounts }));
  };

  const handleCreateAutoPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAutoPay.purpose || !newAutoPay.amount) return;
    const rule: AutoPayRule = {
      id: crypto.randomUUID(),
      amount: newAutoPay.amount || 0,
      day: newAutoPay.day || '1',
      purpose: newAutoPay.purpose || 'Unknown',
      account: newAutoPay.account || settings.accounts[0],
      type: newAutoPay.type || 'expense'
    };
    setSettings(s => ({ ...s, autoPays: [...s.autoPays, rule] }));
    setShowAddAutoPay(false);
    setNewAutoPay({ day: '1', amount: 0, purpose: '', account: settings.accounts[0], type: 'expense' });
  };

  const handleUpdateSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.balancePin && oldPinVerify !== settings.balancePin) {
      alert("Verification Failed: Old PIN is incorrect.");
      return;
    }
    if (newPinRequest !== confirmPinRequest) {
      alert("Validation Failed: New PINs do not match.");
      return;
    }
    if (newPinRequest.length > 0 && newPinRequest.length !== 4) {
      alert("Formatting Error: PIN must be 4 digits.");
      return;
    }
    
    setSettings(s => ({ ...s, balancePin: newPinRequest || null }));
    alert(newPinRequest ? "Security Protocol Encrypted." : "Security Protocol Decrypted.");
    setSecurityTab('status');
    setOldPinVerify("");
    setNewPinRequest("");
    setConfirmPinRequest("");
  };

  const requestPin = (type: string, payload?: any) => {
    if (!settings.balancePin) {
      executePinAction(type, payload);
      return;
    }
    setPinSuccessAction({ type, payload });
    setPinEntryMode(true);
  };

  const executePinAction = (type: string, payload?: any) => {
    if (type === 'balance') setShowTotalBalance(true);
    if (type === 'reveal') setRevealedAccounts(prev => ({...prev, [payload]: true}));
    if (type === 'delete-person') {
       if (window.confirm(`Authorize permanent deletion of ${payload} from ledger?`)) {
         setSettings(prevSettings => {
           const newList = prevSettings.peopleList.filter(p => p !== payload);
           return { ...prevSettings, peopleList: newList };
         });
         setSelectedPersonDetail(null);
       }
    }
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin === settings.balancePin) {
      if (pinSuccessAction) {
        executePinAction(pinSuccessAction.type, pinSuccessAction.payload);
      }
      setPinEntryMode(false);
      setPinError(false);
      setEnteredPin("");
      setPinSuccessAction(null);
    } else {
      setPinError(true);
      setEnteredPin("");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-indigo-400"><Loader2 className="animate-spin" size={48}/></div>;

  return (
    <div className="min-h-screen pb-32 max-w-2xl mx-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative">
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 rounded-b-[60px] shadow-2xl z-0"></div>

      <header className="relative z-10 px-6 pt-10 pb-8 text-white animate-fade-in">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setActiveTab('dashboard'); setProfileView('menu'); }}>
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-xl border border-white/20 shadow-xl active:scale-95 transition-transform">
              <Wallet size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">FinTrack <span className="text-indigo-300">Pro</span></h1>
          </div>
          <button onClick={() => setShowNotificationModal(true)} className="relative p-3 bg-white/10 rounded-2xl border border-white/10 active:scale-95 transition-transform">
            <BellRing size={20} />
            {dueReminders.length > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-indigo-700"></span>}
          </button>
        </div>

        <div className="bg-white/10 backdrop-blur-3xl rounded-[40px] p-8 border border-white/20 shadow-2xl ring-1 ring-white/10 animate-tab-entry">
          <div className="grid grid-cols-2 gap-6 divide-x divide-white/10">
            <div className="space-y-1">
              <div className="flex items-center gap-2 opacity-60 uppercase tracking-[0.2em] text-[10px] font-black">
                <span>Total Assets</span>
                <button onClick={() => showTotalBalance ? setShowTotalBalance(false) : requestPin('balance')}><Eye size={14} /></button>
              </div>
              <p className="text-3xl font-black font-mono tracking-tighter">{showTotalBalance ? formatINR(totalBalance) : "₹ ••••••••"}</p>
            </div>
            <div className="pl-8 space-y-1">
              <p className="opacity-60 uppercase tracking-[0.2em] text-[10px] font-black">Ledger Vol</p>
              <p className="text-3xl font-black font-mono tracking-tighter">{formatINR(totalNetCredit)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6 space-y-8 mt-2">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-tab-entry">
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setFormData({...formData, type: 'reminder'}); setActiveTab('add'); }} className="bg-white dark:bg-slate-900 p-6 rounded-[36px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center gap-3 active:scale-95 transition-all">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                  <AlarmClockPlus size={24} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reminders</span>
              </button>
              <button onClick={() => setShowAutoPayManager(true)} className="bg-white dark:bg-slate-900 p-6 rounded-[36px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center gap-3 active:scale-95 transition-all">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400">
                  <Activity size={24} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto-Pay</span>
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 flex items-center gap-2"><Layers size={14}/> Asset Portfolio</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {settings.accounts.map((acc) => {
                  const isLocked = settings.accountLockSettings[acc];
                  const isRevealed = revealedAccounts[acc];
                  return (
                    <div key={acc} className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm flex justify-between items-center group animate-card-pop">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                          {acc} {isLocked && <Lock size={8} className="text-rose-400" />}
                        </p>
                        <p className={`text-xl font-black font-mono tracking-tight ${accountBalances[acc] >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600'}`}>
                          {isRevealed ? formatINR(accountBalances[acc]) : "₹ ••••"}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          if (isRevealed) {
                            setRevealedAccounts(prev => ({...prev, [acc]: false}));
                          } else {
                            if (isLocked) requestPin('reveal', acc);
                            else setRevealedAccounts(prev => ({...prev, [acc]: true}));
                          }
                        }}
                        className={`p-3 rounded-xl transition-all active:scale-90 ${isRevealed ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}
                      >
                        {isRevealed ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <form onSubmit={handleAddTransaction} className="space-y-6 animate-card-pop pb-20">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[48px] shadow-2xl border border-indigo-50 dark:border-slate-800 space-y-8">
              <div className="flex flex-wrap p-1.5 bg-slate-50 dark:bg-slate-800 rounded-2xl gap-1 shadow-inner overflow-x-auto no-scrollbar">
                {['expense', 'income', 'external', 'reminder', 'credit', 'repayment', 'transfer'].map(t => (
                  <button 
                    key={t} type="button" 
                    onClick={() => { setFormData(p => ({ ...p, type: t as TransactionType })); setExpenseAsCredit(false); }}
                    className={`flex-1 min-w-[28%] py-3 text-[10px] font-black uppercase rounded-xl transition-all ${formData.type === t ? 'bg-indigo-600 shadow-xl text-white' : 'text-slate-400 dark:text-slate-500'}`}
                  >
                    {t === 'external' ? 'Event' : t}
                  </button>
                ))}
              </div>

              <div className="space-y-2 text-center">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Transaction Volume</label>
                <div className="flex flex-col items-center">
                   <input required type="text" inputMode="decimal" placeholder="0.00" className="w-full text-center text-7xl font-black bg-transparent border-none p-2 focus:ring-0 text-indigo-600 dark:text-indigo-400 font-mono tracking-tighter" value={getMaskedINR(formData.amount || "")} onChange={(e) => {
                     const val = e.target.value.replace(/[^0-9.-]/g, '');
                     setFormData(p => ({ ...p, amount: parseFloat(val) || 0 }));
                   }} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="relative bg-slate-50 dark:bg-slate-800 p-6 rounded-[32px] border-2 border-indigo-50 dark:border-slate-800 shadow-inner group flex items-center justify-between transition-all overflow-hidden">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><Calendar size={14} className="text-indigo-400" /> Log Date</label>
                    <input 
                      type="date" 
                      className="text-xl font-black text-slate-800 dark:text-slate-200 bg-transparent border-none focus:ring-0 cursor-pointer" 
                      value={formData.date} 
                      onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} 
                    />
                  </div>
                </div>

                {(formData.type === 'expense' || formData.type === 'credit' || formData.type === 'repayment') && (
                  <div className="space-y-6 animate-fade-in">
                    {formData.type === 'expense' && (
                      <div className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800 rounded-[28px] border border-indigo-50 dark:border-slate-700">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase text-slate-500">Expense as Ledger Credit</p>
                        </div>
                        <button type="button" onClick={() => setExpenseAsCredit(!expenseAsCredit)}>
                          {expenseAsCredit ? <ToggleRight className="text-indigo-600" size={36} /> : <ToggleLeft className="text-slate-300" size={36} />}
                        </button>
                      </div>
                    )}
                    {(expenseAsCredit || formData.type === 'credit' || formData.type === 'repayment') && (
                      <div className="space-y-2 animate-card-pop">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Target Identity</label>
                        <select required className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.person} onChange={e => setFormData(p => ({ ...p, person: e.target.value }))}>
                          <option value="">Choose party...</option>
                          {settings.peopleList.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Category</label>
                      <select className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}>
                        {settings.expenseCats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {formData.type === 'external' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Linked Event Hub</label>
                      <select required className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.eventId} onChange={e => setFormData(p => ({ ...p, eventId: e.target.value }))}>
                        <option value="">Select registry...</option>
                        {settings.events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Paid By</label>
                        <select className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.paidBy} onChange={e => setFormData(p => ({ ...p, paidBy: e.target.value }))}>
                          {settings.paidByList.map(pb => <option key={pb} value={pb}>{pb}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Method</label>
                        <select className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.paymentMethod} onChange={e => setFormData(p => ({ ...p, paymentMethod: e.target.value }))}>
                          {settings.paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {(formData.type !== 'external') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Asset Link</label>
                    <select className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 font-bold dark:text-slate-200 shadow-inner appearance-none" value={formData.account} onChange={e => setFormData(p => ({ ...p, account: e.target.value }))}>
                      {settings.accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Transaction Note</label>
                  <div className="relative">
                    <textarea placeholder="Describe this transaction..." rows={2} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 dark:text-slate-200 shadow-inner font-medium resize-none" value={formData.note} onChange={e => setFormData(p => ({ ...p, note: e.target.value }))} />
                    <button 
                      type="button" 
                      onClick={() => { setIsEnhancing(true); enhanceTransactionDetails(formData.note || '', settings.expenseCats).then(r => { if(r) setFormData(p => ({...p, note: r.cleanNote, category: r.suggestedCategory})); setIsEnhancing(false); }); }}
                      className="absolute right-4 bottom-4 p-3 bg-indigo-600 text-white rounded-2xl shadow-xl active:scale-90 transition-transform"
                    >
                      {isEnhancing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button type="submit" className={`w-full py-5 rounded-[28px] text-sm font-black uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${recordSuccess ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
                  {recordSuccess ? <CheckCircle2 size={22} /> : <Save size={22} />}
                  {recordSuccess ? 'Success' : 'Authorize Log'}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-tab-entry pb-20">
            <div className="flex justify-between items-center sticky top-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-xl py-4 z-20 px-2">
              <h2 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-[0.2em]">Transaction Log</h2>
              <button onClick={() => setShowFilterModal(true)} className={`p-3 rounded-xl transition-all active:scale-95 ${typeFilter !== 'All' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'}`}>
                <SlidersHorizontal size={18} />
              </button>
            </div>
            <div className="space-y-4 px-2">
              {filteredTransactions.length > 0 ? filteredTransactions.map((t) => (
                <div key={t.id} onClick={() => setViewingTransaction(t)} className="bg-white dark:bg-slate-900 p-6 rounded-[36px] shadow-sm flex justify-between items-center group border border-transparent hover:border-indigo-200 transition-all cursor-pointer">
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 flex items-center justify-center rounded-2xl ${
                      ['income', 'repayment'].includes(t.type) || (t.type === 'adjustment' && t.amount >= 0) ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {['income', 'repayment'].includes(t.type) || (t.type === 'adjustment' && t.amount >= 0) ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 dark:text-slate-100 text-sm">{t.note || t.category}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">{t.account}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-black font-mono tracking-tighter ${['income', 'repayment'].includes(t.type) || (t.type === 'adjustment' && t.amount >= 0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {['income', 'repayment'].includes(t.type) || (t.type === 'adjustment' && t.amount >= 0) ? '+' : '-'}{formatINR(Math.abs(t.amount)).replace('₹ ', '')}
                    </p>
                    <p className="text-[8px] font-black text-slate-300 uppercase">{t.date}</p>
                  </div>
                </div>
              )) : (
                <div className="py-24 text-center">
                  <ReceiptText size={48} className="mx-auto text-slate-200 mb-4"/>
                  <p className="opacity-40 font-black uppercase text-xs">Registry Empty</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'credit' && (
          <div className="space-y-6 animate-tab-entry pb-20 px-2">
             {!selectedPersonDetail ? (
               <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 p-12 rounded-[48px] shadow-sm border border-indigo-50 dark:border-slate-800 text-center space-y-3 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-full"></div>
                    <Users size={40} className="mx-auto text-indigo-600 mb-2 relative z-10" />
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">Ledger Matrix</h2>
                    <p className="text-4xl font-black font-mono text-indigo-600">{formatINR(totalNetCredit)}</p>
                    <button onClick={() => setShowAddPersonModal(true)} className="absolute top-6 right-6 p-4 bg-indigo-600 text-white rounded-2xl shadow-xl active:scale-95 transition-transform"><UserPlus size={20}/></button>
                  </div>
                  <div className="space-y-4">
                    {settings.peopleList.map(person => (
                      <div key={person} onClick={() => setSelectedPersonDetail(person)} className="bg-white dark:bg-slate-900 p-6 rounded-[36px] shadow-sm flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-all active:scale-98 relative group">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-lg">{person.charAt(0)}</div>
                          <p className="font-black text-slate-800 dark:text-slate-100 text-sm uppercase tracking-widest">{person}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className={`text-lg font-black font-mono ${personCredits[person] >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{formatINR(personCredits[person])}</p>
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
             ) : (
               <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setSelectedPersonDetail(null)} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95 transition-transform"><ChevronLeft size={22}/></button>
                    <button onClick={() => requestPin('delete-person', selectedPersonDetail)} className="p-4 bg-rose-50 text-rose-500 rounded-2xl shadow-sm active:scale-95 transition-transform"><Trash2 size={22}/></button>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-12 rounded-[48px] shadow-sm flex flex-col items-center gap-6 border border-indigo-50 dark:border-slate-800">
                    <div className="w-20 h-20 bg-indigo-600 text-white rounded-3xl flex items-center justify-center text-3xl font-black shadow-2xl">{selectedPersonDetail.charAt(0)}</div>
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mb-1">Current Obligation</p>
                      <p className="text-5xl font-black font-mono text-indigo-600 tracking-tighter">{formatINR(personCredits[selectedPersonDetail])}</p>
                    </div>
                    <div className="flex gap-4 w-full">
                      <button onClick={() => { setFormData({...formData, person: selectedPersonDetail, type: 'repayment'}); setActiveTab('add'); }} className="flex-1 py-5 bg-emerald-500 text-white rounded-[24px] font-black uppercase text-[10px] shadow-lg active:scale-95">Settle Ledger</button>
                      <button onClick={() => { setFormData({...formData, person: selectedPersonDetail, type: 'credit'}); setActiveTab('add'); }} className="flex-1 py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-[10px] shadow-lg active:scale-95">Record Credit</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-4">Interaction History</h3>
                    {transactions.filter(t => t.person === selectedPersonDetail).map(t => (
                      <div key={t.id} onClick={() => setViewingTransaction(t)} className="bg-white dark:bg-slate-900 p-6 rounded-[32px] shadow-sm flex justify-between items-center cursor-pointer border border-transparent hover:border-slate-200">
                        <div>
                          <p className="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest">{t.note || t.category}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">{t.date}</p>
                        </div>
                        <p className={`font-mono font-black text-base ${t.type === 'repayment' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'repayment' ? '+' : '-'}{formatINR(t.amount).replace('₹ ', '')}</p>
                      </div>
                    ))}
                  </div>
               </div>
             )}
          </div>
        )}

        {/* SYSTEM / PROFILE VIEWS */}
        {activeTab === 'profile' && profileView === 'menu' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-20">
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[48px] shadow-sm border border-indigo-50 dark:border-slate-800 flex flex-col items-center gap-5">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-[32px] flex items-center justify-center text-4xl font-black shadow-2xl ring-4 ring-indigo-50 dark:ring-slate-800 overflow-hidden">
                {settings.profile.name ? settings.profile.name.charAt(0).toUpperCase() : <User size={48}/>}
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-800 dark:text-slate-100">{settings.profile.name || "Master User"}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{settings.profile.email || "No email linked"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {[
                { label: 'Personal Identity', icon: User, view: 'identity', color: 'text-sky-500' },
                { label: 'Manual Adjustment', icon: Calculator, view: 'adjustment', color: 'text-emerald-600' },
                { label: 'Security Hub', icon: ShieldCheck, view: 'security', color: 'text-indigo-600' },
                { label: 'Asset Management', icon: Wallet, view: 'accounts', color: 'text-indigo-400' },
                { label: 'Event Registry', icon: Briefcase, view: 'event-config', color: 'text-purple-600' },
                { label: 'Custom Protocols', icon: Tags, view: 'categories', color: 'text-amber-600' },
                { label: `Mode: ${settings.theme.toUpperCase()}`, icon: settings.theme === 'dark' ? Sun : Moon, action: () => setSettings(s => ({...s, theme: s.theme === 'dark' ? 'light' : 'dark'})), color: 'text-rose-500' }
              ].map(item => (
                <button 
                  key={item.label} 
                  onClick={() => item.action ? item.action() : setProfileView(item.view! as any)}
                  className="bg-white dark:bg-slate-900 p-7 rounded-[36px] shadow-sm flex justify-between items-center active:scale-[0.98] transition-transform border border-transparent hover:border-indigo-100"
                >
                  <div className="flex items-center gap-5">
                    <div className={`p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 ${item.color}`}>
                      <item.icon size={22} />
                    </div>
                    <span className="font-black text-slate-700 dark:text-slate-200 uppercase text-xs tracking-[0.1em]">{item.label}</span>
                  </div>
                  <ChevronRight size={20} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'profile' && profileView === 'adjustment' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-24">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95 transition-transform"><ChevronLeft size={22}/></button>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-[40px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-8">
              <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Calculator size={24} className="text-emerald-500"/> Manual Adjustment</h3>
              
              <div className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 pl-2 tracking-widest">Asset Calibration</h4>
                  <div className="space-y-4">
                    {settings.accounts.map(acc => (
                      <div key={acc} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-slate-500">{acc}</span>
                          <span className="text-[10px] font-mono opacity-50">{formatINR(accountBalances[acc])}</span>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="New balance"
                            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 rounded-xl text-sm font-black border-none focus:ring-1 ring-emerald-500"
                            value={adjAccountValues[acc] || ""}
                            onChange={e => setAdjAccountValues(v => ({...v, [acc]: e.target.value}))}
                          />
                          <button 
                            onClick={() => {
                              const val = parseFloat(adjAccountValues[acc]);
                              if(!isNaN(val)) handleManualReset(acc, val);
                            }}
                            className="p-3 bg-emerald-500 text-white rounded-xl active:scale-95"
                          >
                            <Check size={18}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 pl-2 tracking-widest">Ledger Calibration</h4>
                  <div className="space-y-4">
                    {settings.peopleList.map(person => (
                      <div key={person} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-slate-500">{person}</span>
                          <span className="text-[10px] font-mono opacity-50">{formatINR(personCredits[person])}</span>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="New balance"
                            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 rounded-xl text-sm font-black border-none focus:ring-1 ring-emerald-500"
                            value={adjLedgerValues[person] || ""}
                            onChange={e => setAdjLedgerValues(v => ({...v, [person]: e.target.value}))}
                          />
                          <button 
                            onClick={() => {
                              const val = parseFloat(adjLedgerValues[person]);
                              if(!isNaN(val)) handlePersonReset(person, val);
                            }}
                            className="p-3 bg-emerald-500 text-white rounded-xl active:scale-95"
                          >
                            <Check size={18}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && profileView === 'accounts' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-24">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95"><ChevronLeft size={22}/></button>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
                <h3 className="text-xl font-black uppercase tracking-tight">Asset Management</h3>
                <button onClick={() => { const a = prompt("Account name?"); if(a) setSettings(s => ({...s, accounts: [...s.accounts, a]})) }} className="p-2 bg-indigo-600 text-white rounded-xl"><Plus size={20}/></button>
              </div>
              <div className="space-y-3">
                {settings.accounts.map((acc, idx) => (
                  <div key={acc} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex justify-between items-center group">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <button onClick={() => moveAsset(idx, 'up')} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30" disabled={idx === 0}><ChevronUp size={14}/></button>
                        <button onClick={() => moveAsset(idx, 'down')} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30" disabled={idx === settings.accounts.length - 1}><ChevronDown size={14}/></button>
                      </div>
                      <span className="font-black text-sm uppercase tracking-tight">{acc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSettings(s => ({...s, accountLockSettings: {...s.accountLockSettings, [acc]: !s.accountLockSettings[acc]}}))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg">
                        {settings.accountLockSettings[acc] ? <Lock size={16} className="text-rose-400"/> : <Unlock size={16} className="text-slate-400"/>}
                      </button>
                      <button onClick={() => setSettings(s => ({...s, accounts: s.accounts.filter(x => x !== acc)}))} className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg text-rose-500">
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && profileView === 'event-config' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-24">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95"><ChevronLeft size={22}/></button>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
                <h3 className="text-xl font-black uppercase tracking-tight">Event Registry</h3>
                <button onClick={() => { const n = prompt("Event name?"); if(n) setSettings(s => ({...s, events: [...s.events, {id: crypto.randomUUID(), name: n}]})) }} className="p-2 bg-indigo-600 text-white rounded-xl"><Plus size={20}/></button>
              </div>
              <div className="space-y-3">
                {settings.events.map(ev => (
                  <div key={ev.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex justify-between items-center">
                    <span className="font-black text-sm uppercase tracking-tight">{ev.name}</span>
                    <button onClick={() => setSettings(s => ({...s, events: s.events.filter(x => x.id !== ev.id)}))} className="p-2 text-rose-500">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && profileView === 'categories' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-32">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95"><ChevronLeft size={22}/></button>
            
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-6">
              <h3 className="text-xl font-black uppercase tracking-tight border-b border-slate-100 dark:border-slate-800 pb-4">Custom Protocols</h3>
              
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest pl-2">Expense Categories</h4>
                    <button onClick={() => { const c = prompt("New category?"); if(c) setSettings(s => ({...s, expenseCats: [...s.expenseCats, c]})) }} className="p-1 bg-indigo-600 text-white rounded-lg"><Plus size={16}/></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.expenseCats.map(cat => (
                      <div key={cat} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 border border-slate-100 dark:border-slate-700">
                        {cat}
                        <button onClick={() => setSettings(s => ({...s, expenseCats: s.expenseCats.filter(x => x !== cat)}))}><X size={10}/></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest pl-2">Payer Registry</h4>
                    <button onClick={() => { const p = prompt("New payer?"); if(p) setSettings(s => ({...s, paidByList: [...s.paidByList, p]})) }} className="p-1 bg-indigo-600 text-white rounded-lg"><Plus size={16}/></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.paidByList.map(item => (
                      <div key={item} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 border border-slate-100 dark:border-slate-700">
                        {item}
                        <button onClick={() => setSettings(s => ({...s, paidByList: s.paidByList.filter(x => x !== item)}))}><X size={10}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* IDENTITY VIEW */}
        {activeTab === 'profile' && profileView === 'identity' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-24">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95 transition-transform"><ChevronLeft size={22}/></button>
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[48px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-8">
              <div className="flex items-center gap-4">
                <User className="text-sky-500" size={32}/>
                <h3 className="text-xl font-black uppercase tracking-tight">Personal Identity</h3>
              </div>
              <div className="space-y-6">
                {[
                   { label: 'Master Name', key: 'name', icon: Contact },
                   { label: 'Email Protocol', key: 'email', icon: Mail },
                   { label: 'Contact Phone', key: 'phone', icon: Phone },
                   { label: 'Geo Address', key: 'address', icon: MapPin }
                ].map(field => (
                  <div key={field.key} className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 pl-4">{field.label}</label>
                    <div className="relative">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"><field.icon size={18}/></div>
                      <input 
                        type="text" 
                        placeholder={`Enter ${field.label}...`}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-5 pl-14 font-bold dark:text-slate-200 shadow-inner focus:ring-2 ring-sky-400 transition-all" 
                        value={(settings.profile as any)[field.key] || ""} 
                        onChange={(e) => setSettings(s => ({...s, profile: {...s.profile, [field.key]: e.target.value}}))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => { setIdentitySaved(true); setTimeout(() => setIdentitySaved(false), 2000); }} 
                className={`w-full py-5 rounded-[28px] font-black uppercase text-xs tracking-widest shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 ${identitySaved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}
              >
                {identitySaved ? <CheckCircle2 size={20}/> : <Save size={20}/>}
                {identitySaved ? 'Identity Secured' : 'Save Protocol'}
              </button>
            </div>
          </div>
        )}

        {/* SECURITY VIEW */}
        {activeTab === 'profile' && profileView === 'security' && (
          <div className="space-y-6 animate-tab-entry px-2 pb-24">
            <button onClick={() => setProfileView('menu')} className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm text-indigo-600 active:scale-95 transition-transform"><ChevronLeft size={22}/></button>
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[48px] shadow-sm border border-indigo-50 dark:border-slate-800 space-y-8">
              <div className="flex items-center gap-4">
                <Shield className="text-indigo-600" size={32}/>
                <h3 className="text-xl font-black uppercase tracking-tight">Security Hub</h3>
              </div>

              <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl gap-1">
                {['status', 'change', 'reset'].map((s: any) => (
                  <button key={s} onClick={() => setSecurityTab(s)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${securityTab === s ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>
                    {s}
                  </button>
                ))}
              </div>

              {securityTab === 'status' && (
                <div className="text-center space-y-6 py-4 animate-fade-in">
                  <div className={`w-24 h-24 mx-auto rounded-3xl flex items-center justify-center ${settings.balancePin ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                    {settings.balancePin ? <ShieldCheck size={48}/> : <AlertTriangle size={48}/>}
                  </div>
                  <div>
                    <p className="font-black text-lg uppercase">{settings.balancePin ? 'Encrypted' : 'Decrypted'}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      {settings.balancePin ? 'Global PIN Authentication is active' : 'Asset exposure is currently unprotected'}
                    </p>
                  </div>
                </div>
              )}

              {securityTab === 'change' && (
                <form onSubmit={handleUpdateSecurity} className="space-y-6 animate-fade-in">
                  {settings.balancePin && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Verify Identity (Current PIN)</label>
                      <input type="password" maxLength={4} inputMode="numeric" required className="w-full text-center bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl tracking-[0.5em] shadow-inner focus:ring-2 ring-indigo-400" value={oldPinVerify} onChange={e => setOldPinVerify(e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 pl-4">{settings.balancePin ? 'New Protocol Code' : 'Initialize Protocol PIN'}</label>
                      <input type="password" maxLength={4} inputMode="numeric" className="w-full text-center bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl tracking-[0.5em] shadow-inner focus:ring-2 ring-indigo-400" value={newPinRequest} onChange={e => setNewPinRequest(e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 pl-4">Confirm Code</label>
                      <input type="password" maxLength={4} inputMode="numeric" className="w-full text-center bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 font-black text-2xl tracking-[0.5em] shadow-inner focus:ring-2 ring-indigo-400" value={confirmPinRequest} onChange={e => setConfirmPinRequest(e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  </div>
                  <button type="submit" className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-transform">Update Protocol</button>
                </form>
              )}

              {securityTab === 'reset' && (
                <div className="p-8 bg-rose-50 dark:bg-rose-900/20 rounded-[32px] border border-rose-100 dark:border-rose-800/50 space-y-6 text-center animate-fade-in">
                  <div className="w-16 h-16 bg-rose-100 dark:bg-rose-800 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                    <RefreshCcw size={32}/>
                  </div>
                  <div>
                    <h4 className="font-black text-rose-600 uppercase text-sm">Emergency Reset</h4>
                    <p className="text-[10px] font-black text-rose-400 uppercase mt-2 leading-relaxed">Forgot your code? Purging the PIN will reset security protocols but maintain transaction integrity.</p>
                  </div>
                  <button onClick={() => { if(window.confirm("Execute Emergency Reset?")) { setSettings(s => ({...s, balancePin: null})); alert("Security Cleared."); setSecurityTab('status'); } }} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg">Bypass PIN Registry</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-[800] pb-8 px-6 no-print">
        <div className="max-w-2xl mx-auto bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-3xl px-8 py-5 rounded-[44px] flex justify-between items-center shadow-2xl border border-white/10 ring-1 ring-white/10 animate-fade-in">
          {[
            { id: 'dashboard', icon: PieChart, label: 'HUB' },
            { id: 'history', icon: History, label: 'LOGS' },
            { id: 'add', icon: Plus, label: 'ENTRY', fab: true },
            { id: 'credit', icon: User, label: 'LEDGER' },
            { id: 'profile', icon: Settings, label: 'SYSTEM' }
          ].map(tab => (
            tab.fab ? (
              <button key={tab.id} onClick={() => setActiveTab('add')} className={`w-16 h-16 -mt-14 rounded-[26px] flex items-center justify-center shadow-2xl transition-all active:scale-95 ${activeTab === 'add' ? 'bg-white text-indigo-600 rotate-45 scale-110' : 'bg-indigo-600 text-white'}`}>
                <Plus size={36} strokeWidth={3} />
              </button>
            ) : (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setProfileView('menu'); }} className={`flex flex-col items-center gap-2 transition-all active:scale-110 ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500'}`}>
                <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2}/>
                <span className="text-[8px] font-black uppercase tracking-[0.2em]">{tab.label}</span>
              </button>
            )
          ))}
        </div>
      </nav>

      {/* PIN Entry Overlay */}
      {pinEntryMode && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-3xl z-[2000] flex items-center justify-center p-8 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[56px] p-12 shadow-3xl text-center space-y-10 animate-card-pop border border-indigo-50 dark:border-slate-800">
            <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center ${pinError ? 'bg-rose-100 text-rose-600 animate-shake' : 'bg-indigo-50 text-indigo-600'}`}>
              <Lock size={40} />
            </div>
            <form onSubmit={handleVerifyPin} className="space-y-10">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">Auth Required</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest">Enter 4-Digit Identity PIN</p>
              </div>
              <input autoFocus type="password" inputMode="numeric" maxLength={4} className="w-full text-center text-6xl font-black bg-slate-50 dark:bg-slate-800 rounded-3xl p-8 tracking-[0.5em] border-none focus:ring-0 shadow-inner" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value.replace(/[^0-9]/g, ''))} />
              <div className="flex flex-col gap-4">
                <button type="submit" className="w-full bg-indigo-600 text-white py-6 rounded-[28px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-transform">Authorize</button>
                <button type="button" onClick={() => setPinEntryMode(false)} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Abort Protocol</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AutoPay Engine Overlay */}
      {showAutoPayManager && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[1200] flex flex-col animate-fade-in overflow-hidden">
          <div className="p-8 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center gap-4">
              <Activity className="text-emerald-400" size={32}/>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Auto-Pay Engines</h2>
            </div>
            <button onClick={() => setShowAutoPayManager(false)} className="p-4 bg-white/10 rounded-2xl text-white"><X size={24}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
            <div className="bg-emerald-600/20 border border-emerald-500/30 p-8 rounded-[40px] text-white">
              <h3 className="text-3xl font-black font-mono tracking-tighter">Active Engine</h3>
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Rules processed every 24h</p>
            </div>
            <div className="space-y-4">
              {settings.autoPays.map(auto => (
                <div key={auto.id} className="p-6 bg-white/5 border border-white/10 rounded-[32px] flex justify-between items-center group">
                  <div>
                    <p className="text-white font-black text-sm uppercase tracking-tight">{auto.purpose}</p>
                    <p className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mt-1">Day {auto.day} • {auto.account}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-black font-mono text-white">{formatINR(auto.amount)}</span>
                    <button onClick={() => setSettings(s => ({...s, autoPays: s.autoPays.filter(x => x.id !== auto.id)}))} className="p-2 text-rose-500"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))}
              {settings.autoPays.length === 0 && <p className="text-center opacity-30 uppercase font-black py-10">No rules configured</p>}
            </div>
          </div>
          <div className="p-6 bg-slate-900 border-t border-white/10 absolute bottom-0 left-0 right-0">
            <button onClick={() => setShowAddAutoPay(true)} className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase flex items-center justify-center gap-3">
              <Plus size={20}/> New Engine
            </button>
          </div>
        </div>
      )}

      {showAddAutoPay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-lg z-[1500] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[40px] p-8 space-y-6 animate-card-pop">
            <h3 className="text-xl font-black uppercase text-center">Initialize Rule</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Purpose..." className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold dark:text-white border-none" value={newAutoPay.purpose} onChange={e => setNewAutoPay(v => ({...v, purpose: e.target.value}))}/>
              <input type="number" placeholder="Amount..." className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold dark:text-white border-none" value={newAutoPay.amount || ""} onChange={e => setNewAutoPay(v => ({...v, amount: parseFloat(e.target.value)}))}/>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" min="1" max="31" placeholder="Day (1-31)" className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold dark:text-white border-none" value={newAutoPay.day} onChange={e => setNewAutoPay(v => ({...v, day: e.target.value}))}/>
                <select className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold dark:text-white border-none appearance-none" value={newAutoPay.type} onChange={e => setNewAutoPay(v => ({...v, type: e.target.value as 'expense' | 'income'}))}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowAddAutoPay(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-black uppercase text-xs">Cancel</button>
              <button onClick={handleCreateAutoPay} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl">Engage</button>
            </div>
          </div>
        </div>
      )}

      {showNotificationModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowNotificationModal(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[48px] shadow-2xl p-10 space-y-8 animate-card-pop" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto text-indigo-600 mb-4 shadow-inner">
                <Bell size={32}/>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">Active Reminders</h2>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-4 no-scrollbar">
              {dueReminders.length > 0 ? dueReminders.map(r => (
                <div key={r.id} className="p-5 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 flex justify-between items-center">
                   <div>
                     <p className="font-black text-xs uppercase tracking-tight text-slate-800 dark:text-slate-200">{r.category}</p>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{r.note || 'Scheduled'}</p>
                   </div>
                   <p className="font-black font-mono text-indigo-600">{formatINR(r.amount)}</p>
                </div>
              )) : (
                <p className="text-center opacity-40 font-black uppercase text-[10px] py-10">No pending alerts</p>
              )}
            </div>
            <button onClick={() => setShowNotificationModal(false)} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-transform">Close</button>
          </div>
        </div>
      )}

      {showFilterModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1100] flex items-end justify-center" onClick={() => setShowFilterModal(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-[48px] p-8 space-y-6 animate-card-pop" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black uppercase">Logic Filters</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['All', 'expense', 'income', 'credit', 'repayment', 'transfer', 'external'].map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === t ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowFilterModal(false)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase">Apply Filter</button>
          </div>
        </div>
      )}

      {showAddPersonModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[56px] p-12 space-y-8 animate-card-pop shadow-3xl">
            <div className="text-center">
               <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto text-indigo-600 mb-4">
                 <UserPlus size={32}/>
               </div>
               <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">Register Party</h2>
            </div>
            <div className="space-y-6">
              <input autoFocus type="text" placeholder="Identity Label..." className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl p-6 font-bold dark:text-slate-200 shadow-inner focus:ring-2 ring-indigo-500" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
              <div className="flex gap-4">
                <button onClick={() => setShowAddPersonModal(false)} className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-3xl font-black uppercase text-[10px] tracking-widest">Abort</button>
                <button onClick={() => { if(newItemName) { setSettings(s => ({...s, peopleList: [...new Set([...s.peopleList, newItemName])]})); setNewItemName(""); setShowAddPersonModal(false); } }} className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-transform">Enlist</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingTransaction && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-2xl z-[2000] flex items-end justify-center animate-fade-in" onClick={() => setViewingTransaction(null)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-t-[60px] p-12 space-y-10 animate-card-pop" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-4">
               <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mx-auto text-indigo-600 mb-2 shadow-inner">
                  <ReceiptText size={40}/>
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">{viewingTransaction.type}</p>
               <p className={`text-6xl font-black font-mono tracking-tighter ${['income', 'repayment'].includes(viewingTransaction.type) || (viewingTransaction.type === 'adjustment' && viewingTransaction.amount >= 0) ? 'text-emerald-600' : 'text-rose-600'}`}>{formatINR(Math.abs(viewingTransaction.amount))}</p>
            </div>
            <div className="p-8 bg-slate-50 dark:bg-slate-800 rounded-[40px] border border-slate-100 dark:border-slate-700 text-center shadow-inner">
              <p className="text-sm font-medium italic text-slate-500 dark:text-slate-400 leading-relaxed">"{viewingTransaction.note || 'Metadata descriptor absent.'}"</p>
            </div>
            <div className="flex gap-4">
               <button onClick={() => { setTransactions(prev => prev.filter(x => x.id !== viewingTransaction.id)); setViewingTransaction(null); }} className="p-6 bg-rose-50 text-rose-500 rounded-[28px] active:scale-95 transition-transform"><Trash2 size={24}/></button>
               <button onClick={() => setViewingTransaction(null)} className="flex-1 py-6 bg-indigo-600 text-white rounded-[28px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-transform">Close Evidence</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;