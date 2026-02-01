
import { ShieldAlert, Copy, ExternalLink } from 'lucide-react';

export const PermissionErrorModal = () => {
  const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow user to read/write their own company profile
    match /companies/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow user to read/write their own data in 'users' collection
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
  }
}`;

  const copyRules = () => {
    navigator.clipboard.writeText(rules);
    alert("Rules copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-red-200">
        <div className="bg-red-50 p-6 border-b border-red-100 flex items-start gap-4">
          <div className="bg-red-100 p-3 rounded-full">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Database Permission Error</h2>
            <p className="text-slate-600 mt-1">
              The application cannot access the database. This usually happens when <strong>Firestore Security Rules</strong> are missing or incorrect.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
              Action Required: Update Firebase Rules
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm mb-4">
              <li>Go to your <strong>Firebase Console</strong> &gt; <strong>Firestore Database</strong> &gt; <strong>Rules</strong> tab.</li>
              <li>Replace the existing rules with the code below.</li>
              <li>Click <strong>Publish</strong>.</li>
            </ol>
          </div>

          <div className="relative">
            <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed border border-slate-700">
              {rules}
            </pre>
            <button
              onClick={copyRules}
              className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>

          <div className="flex justify-end gap-3">
            <a
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
            >
              Open Firebase Console <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors"
            >
              I've Updated Rules, Reload App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
