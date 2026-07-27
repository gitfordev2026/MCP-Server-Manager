"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";
import { authenticatedFetch } from "@/services/http";

interface UserItem {
  id: number;
  keycloak_sub: string;
  username: string;
  role: "admin" | "developer";
  created_on: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserManagementModal({ isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Add User State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "developer">("developer");
  const [submittingUser, setSubmittingUser] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "developer">("developer");

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/proxy/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to load admin user list:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(user: UserItem, roleToSet: "admin" | "developer") {
    setUpdatingId(user.id);
    setStatusMsg(null);
    try {
      const res = await authenticatedFetch(`/api/proxy/api/admin/users/${user.username}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleToSet }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: roleToSet } : u))
        );
        setStatusMsg(`Updated ${user.username}'s role to ${roleToSet.toUpperCase()}`);
      }
    } catch (err) {
      console.error("Failed to update user role:", err);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setSubmittingUser(true);
    setStatusMsg(null);
    try {
      const res = await authenticatedFetch("/api/proxy/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          role: newRole,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setStatusMsg(`User '${result.username}' registered in DB with role ${newRole.toUpperCase()}`);
        setNewUsername("");
        setNewRole("developer");
        setShowAddForm(false);
        await loadUsers();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Failed to register user");
      }
    } catch (err) {
      console.error("Failed to add user:", err);
    } finally {
      setSubmittingUser(false);
    }
  }

  function startEditing(user: UserItem) {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditRole(user.role);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setSubmittingUser(true);
    setStatusMsg(null);
    try {
      const res = await authenticatedFetch(`/api/proxy/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editUsername.trim(),
          role: editRole,
        }),
      });

      if (res.ok) {
        setStatusMsg(`Updated user '${editUsername}' details successfully.`);
        setEditingUser(null);
        await loadUsers();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Failed to edit user");
      }
    } catch (err) {
      console.error("Failed to edit user:", err);
    } finally {
      setSubmittingUser(false);
    }
  }

  async function handleDeleteUser(user: UserItem) {
    if (!confirm(`Are you sure you want to delete user '${user.username}'?`)) return;

    setUpdatingId(user.id);
    setStatusMsg(null);
    try {
      const res = await authenticatedFetch(`/api/proxy/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setStatusMsg(`User '${user.username}' deleted successfully`);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Failed to delete user");
      }
    } catch (err) {
      console.error("Failed to delete user:", err);
    } finally {
      setUpdatingId(null);
    }
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[99999] overflow-y-auto p-4 backdrop-blur-md grid place-items-center animate-in fade-in duration-200 ${
      isDark ? "bg-slate-950/80" : "bg-slate-900/50"
    }`}>
      <div className={`relative w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto ${
        isDark
          ? "border-slate-700/80 bg-slate-900 text-slate-100"
          : "border-slate-200 bg-white text-slate-900"
      }`}>
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-100 bg-slate-50/80"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              isDark
                ? "bg-purple-500/20 border-purple-500/30 text-purple-400"
                : "bg-purple-100 border-purple-200 text-purple-600"
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                User Management & Access Controls
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Manage Keycloak user IDs & allot database roles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingUser(null);
                setShowAddForm(!showAddForm);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              {showAddForm ? "Close Form" : "Add User"}
            </button>

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDark
                  ? "text-slate-400 hover:text-white hover:bg-slate-800"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMsg && (
          <div className="px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            {statusMsg}
          </div>
        )}

        {/* Add User Form Card */}
        {showAddForm && (
          <form onSubmit={handleAddUser} className={`px-6 py-4 border-b flex flex-wrap items-end gap-3 animate-in slide-in-from-top-2 duration-150 ${
            isDark ? "bg-slate-850 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex-1 min-w-[200px]">
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Keycloak Username *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. john_doe"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none transition-colors ${
                  isDark
                    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-purple-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-500"
                }`}
              />
            </div>

            <div className="w-40">
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Database Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "developer")}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none transition-colors ${
                  isDark
                    ? "bg-slate-900 border-slate-700 text-white focus:border-purple-500"
                    : "bg-white border-slate-300 text-slate-900 focus:border-purple-500"
                }`}
              >
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submittingUser}
              className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow transition-all cursor-pointer disabled:opacity-50"
            >
              {submittingUser ? "Saving..." : "Save New User"}
            </button>
          </form>
        )}

        {/* Edit User Modal Form */}
        {editingUser && (
          <form onSubmit={handleSaveEdit} className={`px-6 py-4 border-b flex flex-wrap items-end gap-3 bg-purple-500/10 border-purple-500/20 animate-in slide-in-from-top-2 duration-150`}>
            <div className="flex-1 min-w-[200px]">
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Edit Username
              </label>
              <input
                type="text"
                required
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${
                  isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>

            <div className="w-40">
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Database Role
              </label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as "admin" | "developer")}
                className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${
                  isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              >
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingUser}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow cursor-pointer disabled:opacity-50"
              >
                {submittingUser ? "Updating..." : "Update User"}
              </button>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                  isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Modal Body / Table */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className={`flex items-center justify-center py-12 gap-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <svg className="w-5 h-5 animate-spin text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm font-medium">Loading registered database users...</span>
            </div>
          ) : (
            <div className={`overflow-x-auto rounded-xl border ${
              isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50/50"
            }`}>
              <table className="w-full text-left text-xs">
                <thead className={`font-semibold border-b ${
                  isDark
                    ? "bg-slate-900/90 text-slate-400 border-slate-800"
                    : "bg-slate-100/90 text-slate-600 border-slate-200"
                }`}>
                  <tr>
                    <th className="px-4 py-3">User ID (Sub / Keycloak ID)</th>
                    <th className="px-4 py-3">Username (Name)</th>
                    <th className="px-4 py-3">Database Role</th>
                    <th className="px-4 py-3 text-right">Role Controls & Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${
                  isDark ? "divide-slate-800/60" : "divide-slate-200/60"
                }`}>
                  {users.map((u) => (
                    <tr key={u.id} className={`transition-colors ${
                      isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-100/60"
                    }`}>
                      <td className={`px-4 py-3 font-mono text-[11px] ${
                        isDark ? "text-purple-400" : "text-purple-600"
                      }`}>
                        {u.keycloak_sub}
                      </td>
                      <td className={`px-4 py-3 font-semibold flex items-center gap-2 ${
                        isDark ? "text-slate-100" : "text-slate-900"
                      }`}>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] ${
                          isDark ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-700"
                        }`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        {u.username}
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                            isDark
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                              : "bg-purple-100 text-purple-700 border-purple-300"
                          }`}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            ADMIN
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                            isDark
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                              : "bg-blue-100 text-blue-700 border-blue-300"
                          }`}>
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            DEVELOPER
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {/* Quick Role Toggle */}
                          <div className={`inline-flex rounded-lg border p-0.5 ${
                            isDark ? "border-slate-700/60 bg-slate-900" : "border-slate-300 bg-slate-100"
                          }`}>
                            <button
                              disabled={updatingId === u.id || u.role === "admin"}
                              onClick={() => handleRoleChange(u, "admin")}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                                u.role === "admin"
                                  ? "bg-purple-600 text-white font-bold shadow"
                                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Admin
                            </button>
                            <button
                              disabled={updatingId === u.id || u.role === "developer"}
                              onClick={() => handleRoleChange(u, "developer")}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                                u.role === "developer"
                                  ? "bg-blue-600 text-white font-bold shadow"
                                  : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Dev
                            </button>
                          </div>

                          {/* Edit User Button */}
                          <button
                            onClick={() => startEditing(u)}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isDark
                                ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                                : "border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            }`}
                            title="Edit User"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Delete User Button */}
                          <button
                            disabled={updatingId === u.id}
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 transition-colors cursor-pointer"
                            title="Delete User"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center justify-between px-6 py-3 border-t text-xs ${
          isDark
            ? "border-slate-800 bg-slate-900/90 text-slate-400"
            : "border-slate-100 bg-slate-50/90 text-slate-500"
        }`}>
          <span>Total Registered Users: {users.length}</span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
