'use client';

import React, { createContext, useContext, ReactNode } from 'react';

export interface UserProfile {
  username: string;
  sub: string;
  roles: string[];
  primary_role: 'admin' | 'developer' | null;
  email?: string;
}

interface UserContextType {
  user: UserProfile | null;
  role: 'admin' | 'developer' | null;
  isAdmin: boolean;
  isDeveloper: boolean;
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  role: null,
  isAdmin: false,
  isDeveloper: false,
  loading: true,
  setUser: () => {},
});

export function UserProvider({
  user,
  loading,
  setUser,
  children,
}: {
  user: UserProfile | null;
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
  children: ReactNode;
}) {
  const role = user?.primary_role || null;
  const isAdmin = role === 'admin';
  const isDeveloper = role === 'developer';

  return (
    <UserContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isDeveloper,
        loading,
        setUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
