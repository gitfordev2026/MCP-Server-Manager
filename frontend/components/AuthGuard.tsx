"use client";

import dynamic from "next/dynamic";
import React from "react";

const AuthGuardClient = dynamic(() => import("./AuthGuardContent"), {
  ssr: false,
});

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return <AuthGuardClient>{children}</AuthGuardClient>;
}
