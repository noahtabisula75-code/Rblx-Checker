/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, Download, Play, Square, Menu, X, Users, CheckCircle2, XCircle, AlertTriangle, ShieldOff, Clock, User, List, Search } from 'lucide-react';
import { cn } from './lib/utils';
import axios from 'axios';
import { AnimatePresence, motion } from 'motion/react';

interface AccountInput {
  username: string;
  password?: string;
}

interface LookupResult {
  username: string;
  status: 'SUCCESS' | 'NOT_FOUND' | 'ERROR';
  data?: {
    UserID: number;
    Username: string;
    DisplayName: string;
    ProfileURL: string;
    Description: string;
    IsBanned: boolean;
    AccountAgeDays: string;
    JoinDate: string;
    BadgeCount: number;
    CollectibleCount: number;
    GroupCount: number;
    FriendCount: number;
    FollowerCount: number;
    Avatar: string;
  };
}

const BATCH_SIZE = 10;

export default function App() {
  const [mode, setMode] = useState<'bulk' | 'single'>('bulk');
  const [singleUsername, setSingleUsername] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountInput[]>([]);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const total = accounts.length;
  const processed = results.length;
  const success = results.filter(r => r.status === 'SUCCESS').length;
  const notFound = results.filter(r => r.status === 'NOT_FOUND').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const banned = results.filter(r => r.data?.IsBanned).length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      const parsed = lines.map(line => {
        const parts = line.split(':');
        return {
          username: parts[0].trim(),
          password: parts.slice(1).join(':').trim() || undefined
        };
      });
      setAccounts(parsed);
      setResults([]);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const startLookup = async () => {
    if (accounts.length === 0 || isRunning) return;
    
    setIsRunning(true);
    setResults([]);
    setProgress(0);
    abortControllerRef.current = new AbortController();

    const currentResults: LookupResult[] = [];
    
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      if (abortControllerRef.current.signal.aborted) {
        break;
      }
      
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const usernames = batch.map(a => a.username);
      
      try {
        const res = await axios.post('/api/lookup', { usernames }, {
          signal: abortControllerRef.current.signal
        });

        // Add back password info to results if needed for download later,
        // but results state only tracks what API returned + we match by username
        const newResults = res.data.results as LookupResult[];
        currentResults.push(...newResults);
        setResults([...currentResults]);
        setProgress(Math.floor(((i + batch.length) / accounts.length) * 100));
      } catch (err) {
        if (axios.isCancel(err)) {
          break; // user aborted
        }
        // Mark current batch as error
        const updatedBatch = batch.map(a => ({ username: a.username, status: 'ERROR' as const }));
        currentResults.push(...updatedBatch);
        setResults([...currentResults]);
        setProgress(Math.floor(((i + batch.length) / accounts.length) * 100));
      }
    }
    
    setIsRunning(false);
  };

  const startSingleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!singleUsername.trim() || isRunning) return;
    
    setIsRunning(true);
    setResults([]);
    setProgress(0);
    const targetAccount = { username: singleUsername.trim() };
    setAccounts([targetAccount]);
    abortControllerRef.current = new AbortController();

    try {
      const res = await axios.post('/api/lookup', { usernames: [targetAccount.username] }, {
        signal: abortControllerRef.current.signal
      });

      const newResults = res.data.results as LookupResult[];
      setResults(newResults);
      setProgress(100);
    } catch (err) {
      if (!axios.isCancel(err)) {
        setResults([{ username: targetAccount.username, status: 'ERROR' }]);
      }
      setProgress(100);
    }
    
    setIsRunning(false);
  };

  const stopLookup = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  };

  const downloadResults = () => {
    if (results.length === 0) return;
    
    const successfulResults = results.filter(r => r.status === 'SUCCESS' && r.data);
    
    if (successfulResults.length === 0) {
      alert("No successful results to download.");
      return;
    }

    const output = successfulResults.map(result => {
      const origAccount = accounts.find(a => a.username.toLowerCase() === result.username.toLowerCase());
      const d = result.data!;
      let description = d.Description || 'N/A';
      description = description.replace(/\r?\n|\r/g, ' '); // remove newlines in description

      return [
        `=============================================`,
        `[+] Account: ${origAccount?.username || result.username}`,
        `[+] Password: ${origAccount?.password || 'N/A'}`,
        `=============================================`,
        ` ├── UserID: ${d.UserID}`,
        ` ├── Username: ${d.Username}`,
        ` ├── DisplayName: ${d.DisplayName}`,
        ` ├── ProfileURL: ${d.ProfileURL}`,
        ` ├── Description: ${description}`,
        ` ├── IsBanned: ${d.IsBanned}`,
        ` ├── AccountAgeDays: ${d.AccountAgeDays}`,
        ` ├── JoinDate: ${d.JoinDate}`,
        ` ├── BadgeCount: ${d.BadgeCount}`,
        ` ├── CollectibleCount: ${d.CollectibleCount}`,
        ` ├── GroupCount: ${d.GroupCount}`,
        ` ├── FriendCount: ${d.FriendCount}`,
        ` ├── FollowerCount: ${d.FollowerCount}`,
        ` └── Avatar: ${d.Avatar}`,
      ].join('\n');
    }).join('\n\n');

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roblox_lookup_results_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-30 transition-transform duration-300 transform flex flex-col shadow-xl md:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-blue-600">
            <Users className="w-6 h-6" />
            <span>Roblox Checker</span>
          </div>
          <button className="md:hidden p-1 text-gray-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          {/* Mode Switching Navigation */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setMode('bulk')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors",
                mode === 'bulk' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <List className="w-4 h-4" />
              Bulk
            </button>
            <button
              onClick={() => setMode('single')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors",
                mode === 'single' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <User className="w-4 h-4" />
              Single
            </button>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'bulk' ? (
              <motion.div 
                key="bulk-mode"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Upload Combo/List</label>
                  <input 
                    type="file" 
                    accept=".txt"
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-lg hover:bg-blue-100 transition-colors font-medium shadow-sm"
                    disabled={isRunning}
                  >
                    <Upload className="w-4 h-4" />
                    Select .txt File
                  </button>
                  <p className="text-xs text-gray-500 text-center">Format: username:password</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bulk Controls</h3>
                  <div className="space-y-2">
                    <button 
                      onClick={startLookup}
                      disabled={accounts.length === 0 || isRunning}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                    >
                      <Play className="w-4 h-4" />
                      Start Lookup
                    </button>
                    <button 
                      onClick={stopLookup}
                      disabled={!isRunning}
                      className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                   <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Export</h3>
                   <button 
                      onClick={downloadResults}
                      disabled={results.length === 0}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download Results
                    </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="single-mode"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <form className="space-y-3" onSubmit={startSingleLookup}>
                  <label className="block text-sm font-medium text-gray-700">Target Username</label>
                  <input 
                    type="text" 
                    value={singleUsername}
                    onChange={(e) => setSingleUsername(e.target.value)}
                    placeholder="Enter Roblox username..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  />
                  <button 
                    type="submit"
                    disabled={!singleUsername.trim() || isRunning}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                  >
                    <Search className="w-4 h-4" />
                    Lookup User
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 min-w-0">
        <header className="bg-white border-b px-4 py-3 flex items-center shadow-sm z-10">
          <button 
            className="mr-4 p-1.5 md:hidden text-gray-600 hover:bg-gray-100 rounded-md" 
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-gray-800">Live Statistics</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
              <span>{total} loaded</span>
              <span>•</span>
              <span>{processed} processed</span>
            </div>
          </div>
        </header>

        {/* Progress Bar */}
        {(accounts.length > 0 || isRunning) && (
          <div className="bg-white px-6 py-3 border-b shadow-xs">
            <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              <span>Progress</span>
              <span>{Math.min(100, Math.max(0, isNaN(progress) ? 0 : progress))}% ({processed}/{total})</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${Math.min(100, Math.max(0, isNaN(progress) ? 0 : progress))}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="text-gray-500 flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">Total List</span>
                  </div>
                  <span className="text-2xl font-bold text-gray-800">{total}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="text-emerald-600 flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Success</span>
                  </div>
                  <span className="text-2xl font-bold text-gray-800">{success}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="text-amber-500 flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">Not Found</span>
                  </div>
                  <span className="text-2xl font-bold text-gray-800">{notFound}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="text-rose-500 flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Error</span>
                  </div>
                  <span className="text-2xl font-bold text-gray-800">{errors}</span>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col col-span-2 lg:col-span-1">
                  <div className="text-purple-600 flex items-center gap-2 mb-2">
                    <ShieldOff className="w-4 h-4" />
                    <span className="text-sm font-medium">Banned</span>
                  </div>
                  <span className="text-2xl font-bold text-gray-800">{banned}</span>
               </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-800">Results</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-medium">Avatar</th>
                      <th className="px-6 py-4 font-medium">Username</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">User ID</th>
                      <th className="px-6 py-4 font-medium">Friends</th>
                      <th className="px-6 py-4 font-medium">Followers</th>
                      <th className="px-6 py-4 font-medium">Badges</th>
                      <th className="px-6 py-4 font-medium">Groups</th>
                      <th className="px-6 py-4 font-medium">Age (Days)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-gray-700">
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                          <div className="flex flex-col items-center justify-center">
                            <Clock className="w-8 h-8 text-gray-300 mb-3" />
                            <p>No results yet. Start the lookup.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <AnimatePresence>
                        {[...results].reverse().map((res, idx) => (
                          <motion.tr 
                            key={`${res.username}-${idx}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-3">
                              {res.data?.Avatar && res.data.Avatar !== 'N/A' ? (
                                <img src={res.data.Avatar} alt="avatar" className="w-10 h-10 rounded-full border shadow-sm object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">?</div>
                              )}
                            </td>
                            <td className="px-6 py-3 font-medium">
                              <div className="flex flex-col">
                                <span>{res.data?.Username || res.username}</span>
                                {res.data?.IsBanned && <span className="text-[10px] text-red-600 uppercase font-bold tracking-wider">Banned</span>}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide",
                                res.status === 'SUCCESS' ? "bg-emerald-100 text-emerald-700" :
                                res.status === 'NOT_FOUND' ? "bg-amber-100 text-amber-700" :
                                "bg-rose-100 text-rose-700"
                              )}>
                                {res.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 font-mono text-gray-500">
                              {res.data?.UserID || '-'}
                            </td>
                            <td className="px-6 py-3">{res.data?.FriendCount ?? '-'}</td>
                            <td className="px-6 py-3">{res.data?.FollowerCount ?? '-'}</td>
                            <td className="px-6 py-3">{res.data?.BadgeCount ?? '-'}</td>
                            <td className="px-6 py-3">{res.data?.GroupCount ?? '-'}</td>
                            <td className="px-6 py-3">{res.data?.AccountAgeDays ?? '-'}</td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}

