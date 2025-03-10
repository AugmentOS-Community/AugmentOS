// src/hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import axios from 'axios';

// Define the types for our auth context
interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isWebViewAuth: boolean;
  signOut: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWebViewAuth, setIsWebViewAuth] = useState(false);

  // Set up axios authorization with Supabase token
  const setupAxiosAuth = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  // Handle sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setupAxiosAuth(null);
  };

  useEffect(() => {
    // Get initial session from Supabase
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // Check for WebView injected Supabase token first
        const webViewToken = localStorage.getItem('supabase_token');
        if (webViewToken) {
          console.log('Using WebView injected Supabase token');
          setupAxiosAuth(webViewToken);
          // Create a minimal session object for our state
          setSession({ access_token: webViewToken } as Session);
          setUser({ id: 'webview-user' } as User);
          setIsWebViewAuth(true);
          setIsLoading(false);
          return;
        }
        
        // Fall back to Supabase auth
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user || null);
        
        // Set the Supabase token for API requests
        setupAxiosAuth(data.session?.access_token || null);
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
    
    // Create global function for WebView token updates
    window.setSupabaseToken = (token: string) => {
      console.log('Token received from WebView');
      setupAxiosAuth(token);
      setSession({ access_token: token } as Session);
      setUser({ id: 'webview-user' } as User);
      setIsWebViewAuth(true);
    };

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user || null);

        if (event === 'SIGNED_IN' && session?.access_token) {
          setupAxiosAuth(session.access_token);
        } else if (event === 'SIGNED_OUT') {
          setupAxiosAuth(null);
        }
      }
    );

    // Clean up subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Calculate authenticated state
  const isAuthenticated = !!user && !!session;

  // Provide auth context to children components
  return (
    <AuthContext.Provider value={{
      session,
      user,
      isLoading,
      isAuthenticated,
      isWebViewAuth,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}