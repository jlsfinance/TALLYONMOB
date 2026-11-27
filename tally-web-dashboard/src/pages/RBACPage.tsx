import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Eye,
  Settings,
  Activity,
  Search,
  Edit3,
  Trash2,
  Mail,
  AlertTriangle,
  Check,
  X,
  Building2,
  FileText,
  BarChart3,
  Package,
  CreditCard,
  RefreshCw,
  Send,
  Lock,
  Unlock,
  Monitor,
  Smartphone,
  Tablet,
  Plus,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  Database,
  Save,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import {
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  normalizeRoleKey,
} from "@/lib/rbacPermissions.mjs";
import {
  rbacService,
  type RbacUserRecord,
  type RbacInvitationRecord,
  type RbacRoleRecord,
  type RbacCompanyRecord,
  type RbacLogRecord,
} from "@/services/rbacService";

interface UIUserRow {
  rowKey: string;
  id: string;
  isInvitation: boolean;
  invitationId?: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  status: "active" | "invited" | "suspended" | "inactive";
  lastActive: string;
  lastLogin: string;
  companyAccess: string[];
  companyIds: string[];
  defaultCompany: string;
  memberships: RbacUserRecord["memberships"];
}

interface UIRole {
  id: string;
  name: string;
  displayName: string;
  description: string;
  color: string;
  permissions: Record<string, Record<string, boolean>>;
  isCustom: boolean;
  userCount: number;
}

interface AccessLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  timestamp: string;
  ipAddress: string;
  device: string;
  suspicious: boolean;
}

const roleTemplates = [
  {
    id: "full-access",
    name: "Full Access",
    description: "Complete access to all modules and features",
    icon: ShieldCheck,
    permissions: DEFAULT_ROLE_PERMISSIONS.admin,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Operational access without Delete or Manage Users",
    icon: Shield,
    permissions: DEFAULT_ROLE_PERMISSIONS.manager,
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Vouchers, Ledgers, Reports, and GST access",
    icon: FileText,
    permissions: DEFAULT_ROLE_PERMISSIONS.accountant,
  },
  {
    id: "sales",
    name: "Sales",
    description: "View records and create invoices/vouchers",
    icon: BarChart3,
    permissions: DEFAULT_ROLE_PERMISSIONS.sales,
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Strict read-only View access across modules",
    icon: Eye,
    permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "invited":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "suspended":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
};

const getRoleColorClass = (roleOrColor: string) => {
  if (roleOrColor && roleOrColor.startsWith("text-")) return roleOrColor;
  switch (normalizeRoleKey(roleOrColor)) {
    case "super_admin":
      return "text-red-400";
    case "owner":
      return "text-amber-400";
    case "admin":
      return "text-orange-400";
    case "manager":
      return "text-yellow-400";
    case "accountant":
      return "text-cyan-400";
    case "sales":
      return "text-emerald-400";
    case "viewer":
      return "text-zinc-400";
    default:
      return "text-purple-400";
  }
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseDevice = (ua: string | null | undefined) => {
  const s = String(ua || "").toLowerCase();
  if (s.includes("mobile") || s.includes("android") || s.includes("iphone")) return "Mobile";
  if (s.includes("tablet") || s.includes("ipad")) return "Tablet";
  return "Desktop";
};

const getDeviceIcon = (device: string) => {
  switch (device) {
    case "Mobile":
      return Smartphone;
    case "Tablet":
      return Tablet;
    default:
      return Monitor;
  }
};

function SummaryCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  subtitle: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all duration-300"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-400 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
        status
      )}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function UsersDashboard({
  users,
  accessLog,
}: {
  users: UIUserRow[];
  accessLog: AccessLogEntry[];
}) {
  const stats = useMemo(() => {
    const members = users.filter((u) => !u.isInvitation);
    const totalUsers = members.length;
    const activeUsers = members.filter((u) => u.status === "active").length;
    const adminCount = members.filter((u) =>
      ["super_admin", "owner", "admin"].includes(u.roleKey)
    ).length;
    const viewerCount = members.filter((u) => u.roleKey === "viewer").length;
    const pendingInvitations = users.filter((u) => u.isInvitation).length;
    const suspiciousActivity = accessLog.filter((l) => l.suspicious).length;

    return {
      totalUsers,
      activeUsers,
      adminCount,
      viewerCount,
      pendingInvitations,
      suspiciousActivity,
    };
  }, [users, accessLog]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <SummaryCard
        icon={Users}
        title="Total Members"
        value={stats.totalUsers}
        subtitle={`${stats.activeUsers} active`}
        color="bg-cyan-500/20 text-cyan-400"
      />
      <SummaryCard
        icon={Activity}
        title="Active Users"
        value={stats.activeUsers}
        subtitle="Company memberships"
        color="bg-emerald-500/20 text-emerald-400"
      />
      <SummaryCard
        icon={ShieldCheck}
        title="Owners & Admins"
        value={stats.adminCount}
        subtitle="Full control roles"
        color="bg-orange-500/20 text-orange-400"
      />
      <SummaryCard
        icon={Eye}
        title="Viewers"
        value={stats.viewerCount}
        subtitle="Read-only access"
        color="bg-zinc-500/20 text-zinc-400"
      />
      <SummaryCard
        icon={Mail}
        title="Pending Invites"
        value={stats.pendingInvitations}
        subtitle="Awaiting signup"
        color="bg-yellow-500/20 text-yellow-400"
      />
      <SummaryCard
        icon={AlertTriangle}
        title="Security Alerts"
        value={stats.suspiciousActivity}
        subtitle="Audit log events"
        color="bg-red-500/20 text-red-400"
      />
    </div>
  );
}

function UsersManagement({
  companies,
  users,
  roles,
  selectedCompanyFilter,
  onReload,
}: {
  companies: RbacCompanyRecord[];
  users: UIUserRow[];
  roles: UIRole[];
  selectedCompanyFilter: string;
  onReload: () => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UIUserRow | null>(null);
  const [editCompanyId, setEditCompanyId] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "viewer",
    companyIds: selectedCompanyFilter !== "all" ? [selectedCompanyFilter] : ([] as string[]),
  });

  useEffect(() => {
    if (selectedCompanyFilter !== "all") {
      setNewUser((prev) => ({ ...prev, companyIds: [selectedCompanyFilter] }));
    }
  }, [selectedCompanyFilter]);

  const assignableRoles = useMemo(
    () => roles.filter((r) => !["owner", "super_admin"].includes(normalizeRoleKey(r.name))),
    [roles]
  );

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole =
        filterRole === "all" ||
        normalizeRoleKey(user.roleKey) === normalizeRoleKey(filterRole);
      const matchesStatus = filterStatus === "all" || user.status === filterStatus;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, filterRole, filterStatus]);

  const resolveTargetCompanyId = (user: UIUserRow): string | null => {
    if (selectedCompanyFilter !== "all") return selectedCompanyFilter;
    const nonOwner = user.memberships.find((m) => !m.is_owner);
    return nonOwner?.company_id || user.memberships[0]?.company_id || null;
  };

  const handleAddUser = async () => {
    if (!newUser.email.trim() || !newUser.email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (newUser.companyIds.length === 0) {
      toast.error("Select at least one company");
      return;
    }
    setBusyKey("invite");
    try {
      const result = await rbacService.inviteMember({
        companyIds: newUser.companyIds,
        email: newUser.email,
        role: newUser.role,
        fullName: newUser.name,
      });
      await onReload();
      setNewUser({
        name: "",
        email: "",
        role: "viewer",
        companyIds: selectedCompanyFilter !== "all" ? [selectedCompanyFilter] : [],
      });
      setShowAddUser(false);
      if (result.status === "added") {
        toast.success(`${result.email} added to selected company`);
      } else if (result.emailSent) {
        toast.success(`Invitation email sent to ${result.email}`);
      } else {
        toast(
          `Pending invitation saved for ${result.email}, but email was not sent (${result.emailError || "mail delivery unavailable"}). Share the signup link manually.`,
          { icon: "⚠️", duration: 6000 }
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invitation");
    } finally {
      setBusyKey(null);
    }
  };

  const handleEditRole = async (user: UIUserRow, newRoleSlug: string) => {
    const targetCompanyId = editCompanyId || resolveTargetCompanyId(user);
    if (!targetCompanyId) {
      toast.error("No company selected for this user");
      return;
    }
    setBusyKey(`role-${user.id}`);
    try {
      await rbacService.updateMemberRole(targetCompanyId, user.id, newRoleSlug);
      await onReload();
      setEditingUser(null);
      toast.success("Role updated and saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update role");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSuspendUser = async (user: UIUserRow) => {
    const targetCompanyId = resolveTargetCompanyId(user);
    if (!targetCompanyId) {
      toast.error("Select a company first");
      return;
    }
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setBusyKey(`status-${user.rowKey}`);
    try {
      await rbacService.updateMemberStatus(targetCompanyId, user.id, nextStatus);
      await onReload();
      toast.success(nextStatus === "suspended" ? "User suspended" : "User reactivated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update user status");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveUser = async (user: UIUserRow) => {
    const targetCompanyId = resolveTargetCompanyId(user);
    if (!targetCompanyId) {
      toast.error("Select a company first");
      return;
    }
    setBusyKey(`remove-${user.rowKey}`);
    try {
      await rbacService.removeMember({
        companyId: targetCompanyId,
        userId: user.isInvitation ? null : user.id,
        invitationId: user.isInvitation ? user.invitationId : null,
      });
      await onReload();
      toast.success(user.isInvitation ? "Invitation revoked" : "User removed from company");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove user");
    } finally {
      setBusyKey(null);
    }
  };

  const handleResendInvite = async (user: UIUserRow) => {
    if (!user.invitationId) return;
    setBusyKey(`resend-${user.rowKey}`);
    try {
      await rbacService.resendInvitation(user.invitationId);
      await onReload();
      toast.success(`Invitation email resent to ${user.email}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to resend invitation email");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedRows.length === filteredUsers.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredUsers.map((u) => u.rowKey));
    }
  };

  const handleBulkAction = async (action: "suspend" | "remove") => {
    if (selectedRows.length === 0) {
      toast.error("No users selected");
      return;
    }
    const targets = filteredUsers.filter((u) => selectedRows.includes(u.rowKey));
    const activeMembers = targets.filter((u) => !u.isInvitation);
    const pendingInvites = targets.filter((u) => u.isInvitation);

    setBusyKey("bulk");
    try {
      if (selectedCompanyFilter !== "all" && activeMembers.length > 0) {
        await rbacService.bulkMemberAction(
          selectedCompanyFilter,
          activeMembers.map((u) => u.id),
          action
        );
      } else {
        for (const u of activeMembers) {
          const cid = resolveTargetCompanyId(u);
          if (!cid) continue;
          if (action === "remove") {
            await rbacService.removeMember({ companyId: cid, userId: u.id });
          } else {
            await rbacService.updateMemberStatus(cid, u.id, "suspended");
          }
        }
      }

      if (action === "remove") {
        for (const inv of pendingInvites) {
          const cid = resolveTargetCompanyId(inv);
          if (cid && inv.invitationId) {
            await rbacService.removeMember({ companyId: cid, invitationId: inv.invitationId });
          }
        }
      }

      await onReload();
      setSelectedRows([]);
      toast.success(`Bulk ${action} applied`);
    } catch (err: any) {
      toast.error(err?.message || "Bulk action failed");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Users & Invitations</h2>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-medium rounded-lg transition-colors"
        >
          <UserPlus size={16} />
          Invite / Add User
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Roles</option>
          {roles.map((role) => (
            <option key={role.id} value={role.name}>
              {role.displayName}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {selectedRows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg"
        >
          <span className="text-cyan-400 text-sm font-medium">{selectedRows.length} selected</span>
          <div className="flex gap-2">
            <button
              disabled={busyKey === "bulk"}
              onClick={() => void handleBulkAction("suspend")}
              className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
            >
              Suspend
            </button>
            <button
              disabled={busyKey === "bulk"}
              onClick={() => void handleBulkAction("remove")}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </div>
          <button
            onClick={() => setSelectedRows([])}
            className="ml-auto text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-3 px-4">
                <input
                  type="checkbox"
                  checked={selectedRows.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                />
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">Name</th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium hidden sm:table-cell">Email</th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">Role</th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">Status</th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium hidden md:table-cell">Last Login</th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const targetCid = resolveTargetCompanyId(user);
              const isCompanyOwner = user.memberships.some(
                (m) => m.company_id === targetCid && m.is_owner
              );
              return (
                <tr key={user.rowKey} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(user.rowKey)}
                      onChange={() => {
                        setSelectedRows((prev) =>
                          prev.includes(user.rowKey)
                            ? prev.filter((k) => k !== user.rowKey)
                            : [...prev, user.rowKey]
                        );
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-white">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-zinc-400 text-xs sm:hidden">{user.email}</p>
                        {user.companyAccess.length > 0 && (
                          <p className="text-zinc-500 text-xs">{user.companyAccess.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-300 hidden sm:table-cell">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${getRoleColorClass(user.roleKey)}`}>{user.role}</span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="py-3 px-4 text-zinc-400 text-sm hidden md:table-cell">{user.lastLogin}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {!user.isInvitation && (
                        <button
                          disabled={isCompanyOwner}
                          onClick={() => {
                            setEditingUser(user);
                            setEditCompanyId(targetCid || "");
                          }}
                          className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30"
                          title={isCompanyOwner ? "Company owner role is fixed" : "Edit Role"}
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                      {!user.isInvitation && (
                        <button
                          disabled={isCompanyOwner || busyKey === `status-${user.rowKey}`}
                          onClick={() => void handleSuspendUser(user)}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${
                            user.status === "suspended"
                              ? "text-emerald-400 hover:bg-emerald-500/20"
                              : "text-yellow-400 hover:bg-yellow-500/20"
                          }`}
                          title={user.status === "suspended" ? "Unsuspend" : "Suspend"}
                        >
                          {user.status === "suspended" ? <Unlock size={16} /> : <Lock size={16} />}
                        </button>
                      )}
                      {user.isInvitation && (
                        <button
                          disabled={busyKey === `resend-${user.rowKey}`}
                          onClick={() => void handleResendInvite(user)}
                          className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Resend Invite"
                        >
                          <Send size={16} />
                        </button>
                      )}
                      <button
                        disabled={isCompanyOwner || busyKey === `remove-${user.rowKey}`}
                        onClick={() => void handleRemoveUser(user)}
                        className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30"
                        title={user.isInvitation ? "Revoke Invitation" : "Remove User"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p>No users or pending invitations match your criteria</p>
        </div>
      )}

      <Modal isOpen={showAddUser} onClose={() => setShowAddUser(false)} title="Invite / Add Team Member">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full Name</label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Enter full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email Address *</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="user@company.in"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Company Access *</label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {companies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 p-2 hover:bg-zinc-800/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUser.companyIds.includes(company.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewUser({ ...newUser, companyIds: [...newUser.companyIds, company.id] });
                      } else {
                        setNewUser({ ...newUser, companyIds: newUser.companyIds.filter((id) => id !== company.id) });
                      }
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-zinc-300 text-sm">{company.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowAddUser(false)}
              className="flex-1 px-4 py-2.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={busyKey === "invite"}
              onClick={() => void handleAddUser()}
              className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
            >
              {busyKey === "invite" ? "Saving..." : "Send Invitation"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={editingUser !== null} onClose={() => setEditingUser(null)} title="Change User Role">
        {editingUser && (
          <div className="space-y-4">
            <p className="text-zinc-300">
              Select company and role for <span className="text-white font-medium">{editingUser.name}</span>
            </p>
            {editingUser.memberships.length > 1 && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Company</label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                >
                  {editingUser.memberships
                    .filter((m) => !m.is_owner)
                    .map((m) => (
                      <option key={m.company_id} value={m.company_id}>
                        {m.company_name} ({m.role_label})
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              {assignableRoles.map((role) => (
                <button
                  key={role.id}
                  disabled={busyKey === `role-${editingUser.id}`}
                  onClick={() => void handleEditRole(editingUser, role.name)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    normalizeRoleKey(editingUser.roleKey) === normalizeRoleKey(role.name)
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${getRoleColorClass(role.color)}`}>{role.displayName}</span>
                    {normalizeRoleKey(editingUser.roleKey) === normalizeRoleKey(role.name) && (
                      <Check size={16} className="text-cyan-400" />
                    )}
                  </div>
                  <p className="text-zinc-400 text-xs mt-1">{role.description || `${role.userCount} users`}</p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setEditingUser(null)}
              className="w-full px-4 py-2.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RolesPermissions({
  roles,
  onReload,
}: {
  roles: UIRole[];
  onReload: () => Promise<void>;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(roles[0]?.id || null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  const selectedRoleData = roles.find((r) => r.id === selectedRoleId) || roles[0] || null;

  const startEditing = (role: UIRole) => {
    setEditingRoleId(role.id);
    setDraftPermissions(JSON.parse(JSON.stringify(role.permissions || {})));
  };

  const togglePermission = (category: string, permission: string) => {
    setDraftPermissions((prev) => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [permission]: !(prev[category]?.[permission] || false),
      },
    }));
  };

  const handleSavePermissions = async () => {
    if (!editingRoleId) return;
    setSaving(true);
    try {
      await rbacService.saveRole({
        roleId: editingRoleId,
        permissions: draftPermissions,
      });
      await onReload();
      setEditingRoleId(null);
      toast.success("Role permissions saved to database");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error("Please enter a role name");
      return;
    }
    setSaving(true);
    try {
      const emptyPerms = Object.fromEntries(
        Object.entries(PERMISSION_CATEGORIES).map(([cat, perms]) => [
          cat,
          Object.fromEntries(perms.map((p) => [p, p === "View"])),
        ])
      );
      const created = await rbacService.saveRole({
        displayName: newRoleName.trim(),
        description: newRoleDesc.trim(),
        permissions: emptyPerms,
        color: "text-purple-400",
      });
      await onReload();
      setNewRoleName("");
      setNewRoleDesc("");
      setShowCreateRole(false);
      if (created?.id) {
        setSelectedRoleId(created.id);
        setEditingRoleId(created.id);
        setDraftPermissions(created.permissions || emptyPerms);
      }
      toast.success(`Custom role "${newRoleName.trim()}" created`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role: UIRole) => {
    if (!role.isCustom) return;
    if (!window.confirm(`Delete custom role "${role.displayName}"?`)) return;
    setSaving(true);
    try {
      await rbacService.deleteRole(role.id);
      await onReload();
      setSelectedRoleId(null);
      setEditingRoleId(null);
      toast.success("Custom role deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete role");
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = roleTemplates.find((t) => t.id === templateId);
    if (!template || !editingRoleId) return;
    setDraftPermissions(JSON.parse(JSON.stringify(template.permissions)));
    setShowTemplates(false);
    toast.success(`Template "${template.name}" loaded — click Save Permissions to persist`);
  };

  const activeMatrix =
    editingRoleId === selectedRoleData?.id ? draftPermissions : selectedRoleData?.permissions || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Roles & Permissions</h2>
        <button
          onClick={() => setShowCreateRole(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Create Custom Role
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <p className="text-zinc-400 text-sm font-medium mb-3">Roles</p>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRoleId(role.id);
                setEditingRoleId(null);
              }}
              className={`w-full p-3 rounded-lg border text-left transition-all ${
                selectedRoleData?.id === role.id
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${getRoleColorClass(role.color)}`}>{role.displayName}</span>
                <div className="flex items-center gap-2">
                  {role.isCustom && (
                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">Custom</span>
                  )}
                  <span className="text-zinc-400 text-sm">{role.userCount}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {selectedRoleData ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className={`text-lg font-semibold ${getRoleColorClass(selectedRoleData.color)}`}>
                    {selectedRoleData.displayName}
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    {selectedRoleData.description || `${selectedRoleData.userCount} member(s) assigned`}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {editingRoleId === selectedRoleData.id ? (
                    <>
                      <button
                        onClick={() => setShowTemplates(true)}
                        className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                      >
                        Apply Template
                      </button>
                      <button
                        onClick={() => setEditingRoleId(null)}
                        className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => void handleSavePermissions()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-black font-medium rounded-lg text-sm hover:bg-cyan-600 transition-colors disabled:opacity-50"
                      >
                        <Save size={14} />
                        {saving ? "Saving..." : "Save Permissions"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(selectedRoleData)}
                        className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                      >
                        Edit Permissions
                      </button>
                      {selectedRoleData.isCustom && (
                        <button
                          disabled={saving}
                          onClick={() => void handleDeleteRole(selectedRoleData)}
                          className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
                  <div key={category}>
                    <h4 className="text-zinc-300 font-medium mb-3 flex items-center gap-2">
                      {category === "Vouchers" && <FileText size={16} />}
                      {category === "Ledgers" && <Database size={16} />}
                      {category === "Reports" && <BarChart3 size={16} />}
                      {category === "Settings" && <Settings size={16} />}
                      {category === "GST" && <FileText size={16} />}
                      {category === "Tally" && <RefreshCw size={16} />}
                      {category === "Stock" && <Package size={16} />}
                      {category === "Billing" && <CreditCard size={16} />}
                      {category}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {permissions.map((permission) => {
                        const isEnabled = Boolean(activeMatrix[category]?.[permission]);
                        const isEditing = editingRoleId === selectedRoleData.id;
                        return (
                          <button
                            key={permission}
                            onClick={() => {
                              if (isEditing) togglePermission(category, permission);
                            }}
                            disabled={!isEditing}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                              isEnabled ? "border-cyan-500/30 bg-cyan-500/10" : "border-zinc-700 bg-zinc-800/50"
                            } ${isEditing ? "cursor-pointer hover:border-cyan-500/50" : "cursor-default"}`}
                          >
                            <span className={`text-sm ${isEnabled ? "text-white" : "text-zinc-400"}`}>
                              {permission}
                            </span>
                            {isEnabled ? (
                              <ToggleRight size={20} className="text-cyan-400" />
                            ) : (
                              <ToggleLeft size={20} className="text-zinc-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center text-zinc-400">
              <Shield size={48} className="mx-auto mb-4 opacity-50" />
              <p>Select a role to view permissions</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showCreateRole} onClose={() => setShowCreateRole(false)} title="Create Custom Role">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Role Name *</label>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="e.g., Tax Consultant"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <input
              type="text"
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowCreateRole(false)}
              className="flex-1 px-4 py-2.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => void handleCreateRole()}
              className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Role"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTemplates} onClose={() => setShowTemplates(false)} title="Apply Role Template">
        <div className="space-y-3">
          <p className="text-zinc-400 text-sm">
            Select a template to populate permissions, then click Save Permissions.
          </p>
          {roleTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                onClick={() => applyTemplate(template.id)}
                className="w-full p-4 rounded-lg border border-zinc-700 hover:border-cyan-500/50 hover:bg-zinc-800/50 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-lg">
                    <Icon size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{template.name}</p>
                    <p className="text-zinc-400 text-sm">{template.description}</p>
                  </div>
                  <ArrowRight size={16} className="ml-auto text-zinc-500" />
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

function AccessLog({
  accessLog,
  onReload,
}: {
  accessLog: AccessLogEntry[];
  onReload: () => Promise<void>;
}) {
  const [filterUser, setFilterUser] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);

  const filteredLog = useMemo(() => {
    return accessLog.filter((entry) => {
      const matchesUser = filterUser === "all" || entry.userId === filterUser;
      const matchesAction =
        filterAction === "all" || entry.action.toLowerCase().includes(filterAction.toLowerCase());
      const matchesSuspicious = !showSuspiciousOnly || entry.suspicious;
      return matchesUser && matchesAction && matchesSuspicious;
    });
  }, [accessLog, filterUser, filterAction, showSuspiciousOnly]);

  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    return accessLog.filter((entry) => {
      if (seen.has(entry.userId)) return false;
      seen.add(entry.userId);
      return true;
    });
  }, [accessLog]);

  const uniqueActions = useMemo(() => Array.from(new Set(accessLog.map((e) => e.action))), [accessLog]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">RBAC & Access Audit Log</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSuspiciousOnly}
              onChange={(e) => setShowSuspiciousOnly(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-zinc-300 text-sm">Security events only</span>
          </label>
          <button
            onClick={() => void onReload()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-200"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Actors</option>
          {uniqueUsers.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.userName}
            </option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Actions</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filteredLog.map((entry) => {
          const DeviceIcon = getDeviceIcon(entry.device);
          return (
            <div
              key={entry.id}
              className={`relative p-4 rounded-xl border transition-all ${
                entry.suspicious ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      entry.suspicious ? "bg-red-500/20" : "bg-zinc-800"
                    }`}
                  >
                    {entry.suspicious ? (
                      <AlertTriangle size={18} className="text-red-400" />
                    ) : (
                      <DeviceIcon size={18} className="text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{entry.userName}</span>
                      <span className="text-cyan-400 text-xs font-mono">{entry.action}</span>
                    </div>
                    <p className="text-zinc-400 text-sm">{entry.resource}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-zinc-500 hidden md:block">{entry.ipAddress}</span>
                  <span className="text-zinc-400 whitespace-nowrap">{entry.timestamp}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredLog.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <Activity size={48} className="mx-auto mb-4 opacity-50" />
          <p>No audit logs found</p>
        </div>
      )}
    </div>
  );
}

function CompanyAccess({
  companies,
  users,
  onReload,
}: {
  companies: RbacCompanyRecord[];
  users: UIUserRow[];
  onReload: () => Promise<void>;
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const membersOnly = useMemo(() => users.filter((u) => !u.isInvitation), [users]);

  const companyUsers = useMemo(() => {
    if (!selectedCompanyId) return membersOnly;
    return membersOnly.filter((u) => u.companyIds.includes(selectedCompanyId));
  }, [membersOnly, selectedCompanyId]);

  const handleToggleCompanyAccess = async (user: UIUserRow, companyId: string, grant: boolean) => {
    setBusyKey(`access-${user.id}-${companyId}`);
    try {
      await rbacService.setCompanyAccess(user.id, companyId, grant, user.roleKey || "viewer");
      await onReload();
      toast.success(grant ? "Company access granted" : "Company access revoked");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update company access");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSetDefaultCompany = async (userId: string, companyId: string) => {
    setBusyKey(`default-${userId}-${companyId}`);
    try {
      await rbacService.setDefaultCompany(userId, companyId);
      await onReload();
      toast.success("Default company updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update default company");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Company Access</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <p className="text-zinc-400 text-sm font-medium mb-3">Companies</p>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedCompanyId(null)}
              className={`w-full p-3 rounded-lg border text-left transition-all ${
                selectedCompanyId === null
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-zinc-400" />
                  <span className="text-white font-medium">All Companies</span>
                </div>
                <span className="text-zinc-400 text-sm">{membersOnly.length}</span>
              </div>
            </button>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`w-full p-3 rounded-lg border text-left transition-all ${
                  selectedCompanyId === company.id
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-zinc-400" />
                    <span className="text-white font-medium">{company.name}</span>
                  </div>
                  <span className="text-zinc-400 text-sm">{company.user_count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
            <h3 className="text-white font-medium mb-4">
              {selectedCompanyId
                ? `Users with access to ${companies.find((c) => c.id === selectedCompanyId)?.name || "Company"}`
                : "All Users"}
            </h3>
            <div className="space-y-3">
              {companyUsers.map((user) => {
                const ungrantedCompanies = companies.filter((c) => !user.companyIds.includes(c.id));
                return (
                  <div key={user.id} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-white">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{user.name}</p>
                          <p className="text-zinc-400 text-sm">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm ${getRoleColorClass(user.roleKey)}`}>{user.role}</span>
                        <StatusBadge status={user.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {user.memberships.map((m) => (
                        <div
                          key={m.company_id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-700/50 rounded-lg text-sm"
                        >
                          <span className="text-zinc-200">{m.company_name}</span>
                          <span className="text-xs text-zinc-400">({m.role_label})</span>
                          {m.is_default && (
                            <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded">
                              Default
                            </span>
                          )}
                          <button
                            disabled={busyKey === `default-${user.id}-${m.company_id}`}
                            onClick={() => void handleSetDefaultCompany(user.id, m.company_id)}
                            className="text-zinc-400 hover:text-cyan-400 transition-colors"
                            title="Set as default company"
                          >
                            <Star size={12} />
                          </button>
                          {!m.is_owner && (
                            <button
                              disabled={busyKey === `access-${user.id}-${m.company_id}`}
                              onClick={() => void handleToggleCompanyAccess(user, m.company_id, false)}
                              className="text-zinc-400 hover:text-red-400 transition-colors"
                              title="Revoke company access"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))}

                      {ungrantedCompanies.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const cid = e.target.value;
                            if (cid) void handleToggleCompanyAccess(user, cid, true);
                            e.target.value = "";
                          }}
                          className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-cyan-400 cursor-pointer"
                        >
                          <option value="">+ Grant Company Access...</option>
                          {ungrantedCompanies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {companyUsers.length === 0 && (
              <div className="text-center py-8 text-zinc-400">
                <Building2 size={32} className="mx-auto mb-3 opacity-50" />
                <p>No users have access to this company</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Star({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function RBACPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [users, setUsers] = useState<UIUserRow[]>([]);
  const [roles, setRoles] = useState<UIRole[]>([]);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [companies, setCompanies] = useState<RbacCompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRealData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const overview = await rbacService.getOverview(companyFilter === "all" ? null : companyFilter);

      const memberRows: UIUserRow[] = overview.users.map((u: RbacUserRecord) => ({
        rowKey: `user:${u.id}`,
        id: u.id,
        isInvitation: false,
        name: u.name,
        email: u.email,
        role: u.role,
        roleKey: normalizeRoleKey(u.roleKey),
        status: u.status,
        lastActive: formatDateTime(u.lastActive),
        lastLogin: formatDateTime(u.lastLogin),
        companyAccess: (u.memberships || []).map((m) => m.company_name),
        companyIds: (u.memberships || []).map((m) => m.company_id),
        defaultCompany:
          (u.memberships || []).find((m) => m.is_default)?.company_name ||
          u.memberships?.[0]?.company_name ||
          "N/A",
        memberships: u.memberships || [],
      }));

      const inviteRows: UIUserRow[] = overview.invitations.map((inv: RbacInvitationRecord) => ({
        rowKey: `inv:${inv.id}`,
        id: inv.id,
        isInvitation: true,
        invitationId: inv.id,
        name: inv.full_name,
        email: inv.email,
        role: inv.role_label,
        roleKey: normalizeRoleKey(inv.role),
        status: "invited",
        lastActive: "Invited",
        lastLogin: "Never",
        companyAccess: [inv.company_name],
        companyIds: [inv.company_id],
        defaultCompany: inv.company_name,
        memberships: [
          {
            company_id: inv.company_id,
            company_name: inv.company_name,
            role: inv.role,
            role_label: inv.role_label,
            status: "active",
            is_default: false,
            is_owner: false,
          },
        ],
      }));

      setUsers([...memberRows, ...inviteRows]);

      setRoles(
        overview.roles.map((r: RbacRoleRecord) => ({
          id: r.id,
          name: r.name,
          displayName: r.display_name || r.name,
          description: r.description || "",
          color: getRoleColorClass(r.color || r.name),
          permissions:
            r.permissions && Object.keys(r.permissions).length > 0
              ? r.permissions
              : DEFAULT_ROLE_PERMISSIONS[normalizeRoleKey(r.name)] || {},
          isCustom: !r.is_system,
          userCount: Number(r.user_count || 0),
        }))
      );

      setCompanies(overview.companies);

      setAccessLog(
        overview.logs.map((l: RbacLogRecord) => ({
          id: l.id,
          userId: l.user_id || "system",
          userName: l.user_email || l.user_id?.substring(0, 8) || "System",
          action: l.action,
          resource: [
            l.entity_type,
            l.entity_name,
            l.details && Object.keys(l.details).length > 0 ? JSON.stringify(l.details) : "",
          ]
            .filter(Boolean)
            .join(" · "),
          timestamp: formatDateTime(l.created_at),
          ipAddress: l.ip_address || "N/A",
          device: parseDevice(l.user_agent),
          suspicious: /suspend|remove|revoked|failed|delete/i.test(l.action),
        }))
      );
    } catch (e: any) {
      console.error("RBAC data load error:", e);
      setLoadError(e?.message || "Failed to load RBAC data");
    } finally {
      setLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    void loadRealData();
  }, [loadRealData]);

  const tabs = [
    { id: "users", label: "Users", icon: Users },
    { id: "roles", label: "Roles & Permissions", icon: Shield },
    { id: "log", label: "Access Log", icon: Activity },
    { id: "companies", label: "Company Access", icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#fff",
            border: "1px solid #27272a",
          },
        }}
      />

      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Shield size={24} className="text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  Role-Based Access Control
                </h1>
                <p className="text-zinc-400 text-sm">
                  Super Admin control over memberships, roles, permissions, and company access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white"
              >
                <option value="all">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void loadRealData()}
                className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800"
                title="Refresh"
              >
                <RefreshCw size={16} className={loading ? "animate-spin text-cyan-400" : "text-zinc-300"} />
              </button>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto pb-4 -mb-4 scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loadError && (
          <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
            {loadError}
          </div>
        )}

        {loading && users.length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "users" && (
                <div className="space-y-6">
                  <UsersDashboard users={users} accessLog={accessLog} />
                  <UsersManagement
                    users={users}
                    roles={roles}
                    companies={companies}
                    selectedCompanyFilter={companyFilter}
                    onReload={loadRealData}
                  />
                </div>
              )}
              {activeTab === "roles" && <RolesPermissions roles={roles} onReload={loadRealData} />}
              {activeTab === "log" && <AccessLog accessLog={accessLog} onReload={loadRealData} />}
              {activeTab === "companies" && (
                <CompanyAccess users={users} companies={companies} onReload={loadRealData} />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
