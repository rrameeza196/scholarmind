import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Shield, Loader2, ArrowRight } from 'lucide-react';
import { AuthUser } from '../types.js';

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // Google sign-in not configured — guest mode still works below.

    // The GIS script is loaded async in index.html; poll briefly until it's ready.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            width: 320
          });
        }
        setGoogleReady(true);
      } else if (attempts > 40) {
        clearInterval(interval);
      }
    }, 150);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleCredential = async (response: { credential: string }) => {
    setError(null);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google sign-in failed.');
      }
      onAuthenticated(data.user);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    }
  };

  const handleGuest = async () => {
    setError(null);
    setIsGuestLoading(true);
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start a guest session.');
      }
      onAuthenticated(data.user);
    } catch (err: any) {
      setError(err.message || 'Failed to start a guest session.');
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f3] flex items-center justify-center p-4" id="login-screen">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-xl border border-stone-200">
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 bg-[#1a56db] rounded-2xl flex items-center justify-center text-white shadow-md mb-4">
            <BrainCircuit className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-display font-bold text-stone-900">ScholarMind</h1>
          <p className="text-sm text-stone-500 mt-2 max-w-sm">
            Sign in to keep your paper library and chat history private to you, or continue as a guest.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {GOOGLE_CLIENT_ID ? (
            <div className="flex justify-center" id="google-signin-button">
              <div ref={googleButtonRef} />
              {!googleReady && (
                <div className="flex items-center gap-2 text-xs text-stone-400 py-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Google Sign-In...
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-xs text-stone-400 bg-stone-50 border border-stone-200 rounded-xl py-3 px-4">
              Google sign-in isn't configured on this deployment yet. You can still continue as a guest below.
            </div>
          )}

          <div className="flex items-center my-4">
            <div className="grow border-t border-stone-200"></div>
            <span className="text-xs text-stone-400 px-3 uppercase tracking-wider font-mono">Or</span>
            <div className="grow border-t border-stone-200"></div>
          </div>

          <button
            onClick={handleGuest}
            disabled={isGuestLoading}
            className="w-full flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 text-stone-700 font-medium py-3 px-4 border border-stone-300 rounded-xl transition-all cursor-pointer disabled:opacity-60"
          >
            {isGuestLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Continue as Guest
          </button>
        </div>

        {error && (
          <p className="mt-4 text-xs text-red-600 text-center">{error}</p>
        )}

        <div className="mt-6 pt-5 border-t border-stone-100 flex items-center justify-center gap-1.5 text-xs text-stone-400">
          <Shield className="h-3.5 w-3.5" />
          Your papers and chats are private to your account
        </div>
      </div>
    </div>
  );
}
