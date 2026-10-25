import { useState, useMemo, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Settings,
  Activity,
  Search,
  Filter,
  MoreVertical,
  Edit3,
  Trash2,
  UserX,
  Mail,
  Clock,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Building2,
  Key,
  FileText,
  BarChart3,
  Package,
  CreditCard,
  RefreshCw,
  Download,
  Share2,
  Send,
  Lock,
  Unlock,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Plus,
  Copy,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  Layers,
  Database,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { supabase } from "@/lib/insforge";

// Types
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | "suspended" | "inactive";
  lastActive: string;
  lastLogin: string;
  avatar?: string;
  companyAccess: string[];
  defaultCompany: string;
}

interface Role {
  id: string;
  name: string;
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
  location: string;
  suspicious: boolean;
}

interface Company {
  id: string;
  name: string;
  userCount: number;
}

// Permission categories
const permissionCategories = {
  Vouchers: ["View", "Create", "Edit", "Delete", "Approve"],
  Ledgers: ["View", "Create", "Edit", "Delete"],
  Reports: ["View", "Export", "Share"],
  Settings: ["View", "Edit", "Manage Users"],
  GST: ["View", "File", "Export"],
  Tally: ["Sync", "Configure"],
  Stock: ["View", "Create", "Edit", "Delete"],
  Billing: ["View", "Edit", "Manage"],
};

// Role templates
const roleTemplates = [
  {
    id: "full-access",
    name: "Full Access",
    description: "Complete access to all modules and features",
    icon: ShieldCheck,
    permissions: Object.fromEntries(
      Object.entries(permissionCategories).map(([cat, perms]) => [
        cat,
        Object.fromEntries(perms.map((p) => [p, true])),
      ])
    ),
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Vouchers, Ledgers, Reports, and GST access",
    icon: FileText,
    permissions: {
      Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: false },
      Ledgers: { View: true, Create: true, Edit: true, Delete: false },
      Reports: { View: true, Export: true, Share: false },
      Settings: { View: false, Edit: false, "Manage Users": false },
      GST: { View: true, File: true, Export: true },
      Tally: { Sync: true, Configure: false },
      Stock: { View: false, Create: false, Edit: false, Delete: false },
      Billing: { View: false, Edit: false, Manage: false },
    },
  },
  {
    id: "sales-manager",
    name: "Sales Manager",
    description: "Vouchers, Stock, and Reports access",
    icon: BarChart3,
    permissions: {
      Vouchers: { View: true, Create: true, Edit: false, Delete: false, Approve: false },
      Ledgers: { View: false, Create: false, Edit: false, Delete: false },
      Reports: { View: true, Export: false, Share: false },
      Settings: { View: false, Edit: false, "Manage Users": false },
      GST: { View: false, File: false, Export: false },
      Tally: { Sync: false, Configure: false },
      Stock: { View: true, Create: true, Edit: true, Delete: false },
      Billing: { View: true, Edit: false, Manage: false },
    },
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "View-only access across all modules",
    icon: Eye,
    permissions: Object.fromEntries(
      Object.entries(permissionCategories).map(([cat, perms]) => [
        cat,
        Object.fromEntries(
          perms.map((p) => [p, p === "View"])
        ),
      ])
    ),
  },
];

// Mock data
const initialUsers: User[] = [
  {
    id: "1",
    name: "Rajesh Kumar",
    email: "rajesh@tallydemo.in",
    role: "Super Admin",
    status: "active",
    lastActive: "2 min ago",
    lastLogin: "2026-06-17 09:15 AM",
    companyAccess: ["Tally Solutions Pvt Ltd", "Kumar Trading Co"],
    defaultCompany: "Tally Solutions Pvt Ltd",
  },
  {
    id: "2",
    name: "Priya Sharma",
    email: "priya@tallydemo.in",
    role: "Admin",
    status: "active",
    lastActive: "15 min ago",
    lastLogin: "2026-06-17 08:45 AM",
    companyAccess: ["Tally Solutions Pvt Ltd", "Sharma Enterprises"],
    defaultCompany: "Sharma Enterprises",
  },
  {
    id: "3",
    name: "Amit Patel",
    email: "amit@tallydemo.in",
    role: "Accountant",
    status: "active",
    lastActive: "1 hour ago",
    lastLogin: "2026-06-17 08:00 AM",
    companyAccess: ["Patel Manufacturing"],
    defaultCompany: "Patel Manufacturing",
  },
  {
    id: "4",
    name: "Neha Gupta",
    email: "neha@tallydemo.in",
    role: "Manager",
    status: "active",
    lastActive: "30 min ago",
    lastLogin: "2026-06-17 08:30 AM",
    companyAccess: ["Gupta Retail", "Gupta Wholesale"],
    defaultCompany: "Gupta Retail",
  },
  {
    id: "5",
    name: "Vikram Singh",
    email: "vikram@tallydemo.in",
    role: "Viewer",
    status: "invited",
    lastActive: "Never",
    lastLogin: "Never",
    companyAccess: ["Singh Industries"],
    defaultCompany: "Singh Industries",
  },
  {
    id: "6",
    name: "Deepak Mehta",
    email: "deepak@tallydemo.in",
    role: "Accountant",
    status: "suspended",
    lastActive: "5 days ago",
    lastLogin: "2026-06-12 02:30 PM",
    companyAccess: ["Mehta Constructions"],
    defaultCompany: "Mehta Constructions",
  },
  {
    id: "7",
    name: "Sunita Reddy",
    email: "sunita@tallydemo.in",
    role: "Manager",
    status: "inactive",
    lastActive: "2 months ago",
    lastLogin: "2026-04-15 10:00 AM",
    companyAccess: ["Reddy Foods", "Reddy Beverages"],
    defaultCompany: "Reddy Foods",
  },
  {
    id: "8",
    name: "Arjun Nair",
    email: "arjun@tallydemo.in",
    role: "Viewer",
    status: "active",
    lastActive: "5 min ago",
    lastLogin: "2026-06-17 09:10 AM",
    companyAccess: ["Nair Exports"],
    defaultCompany: "Nair Exports",
  },
];

const initialRoles: Role[] = [
  {
    id: "super-admin",
    name: "Super Admin",
    color: "text-red-400",
    permissions: Object.fromEntries(
      Object.entries(permissionCategories).map(([cat, perms]) => [
        cat,
        Object.fromEntries(perms.map((p) => [p, true])),
      ])
    ),
    isCustom: false,
    userCount: 1,
  },
  {
    id: "admin",
    name: "Admin",
    color: "text-orange-400",
    permissions: Object.fromEntries(
      Object.entries(permissionCategories).map(([cat, perms]) => [
        cat,
        Object.fromEntries(perms.map((p) => [p, true])),
      ])
    ),
    isCustom: false,
    userCount: 1,
  },
  {
    id: "manager",
    name: "Manager",
    color: "text-yellow-400",
    permissions: {
      Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: true },
      Ledgers: { View: true, Create: true, Edit: true, Delete: false },
      Reports: { View: true, Export: true, Share: true },
      Settings: { View: true, Edit: false, "Manage Users": false },
      GST: { View: true, File: false, Export: true },
      Tally: { Sync: true, Configure: false },
      Stock: { View: true, Create: true, Edit: true, Delete: false },
      Billing: { View: true, Edit: true, Manage: false },
    },
    isCustom: false,
    userCount: 2,
  },
  {
    id: "accountant",
    name: "Accountant",
    color: "text-cyan-400",
    permissions: {
      Vouchers: { View: true, Create: true, Edit: true, Delete: false, Approve: false },
      Ledgers: { View: true, Create: true, Edit: true, Delete: false },
      Reports: { View: true, Export: true, Share: false },
      Settings: { View: false, Edit: false, "Manage Users": false },
      GST: { View: true, File: true, Export: true },
      Tally: { Sync: true, Configure: false },
      Stock: { View: false, Create: false, Edit: false, Delete: false },
      Billing: { View: false, Edit: false, Manage: false },
    },
    isCustom: false,
    userCount: 2,
  },
  {
    id: "viewer",
    name: "Viewer",
    color: "text-zinc-400",
    permissions: Object.fromEntries(
      Object.entries(permissionCategories).map(([cat, perms]) => [
        cat,
        Object.fromEntries(perms.map((p) => [p, p === "View"])),
      ])
    ),
    isCustom: false,
    userCount: 2,
  },
];

const initialAccessLog: AccessLogEntry[] = [
  {
    id: "1",
    userId: "1",
    userName: "Rajesh Kumar",
    action: "Login",
    resource: "System",
    timestamp: "2026-06-17 09:15 AM",
    ipAddress: "192.168.1.100",
    device: "Desktop",
    location: "Mumbai, Maharashtra",
    suspicious: false,
  },
  {
    id: "2",
    userId: "2",
    userName: "Priya Sharma",
    action: "Created Voucher",
    resource: "Sales Voucher #SV-2026-0847",
    timestamp: "2026-06-17 09:12 AM",
    ipAddress: "192.168.1.105",
    device: "Desktop",
    location: "Delhi, NCR",
    suspicious: false,
  },
  {
    id: "3",
    userId: "3",
    userName: "Amit Patel",
    action: "Exported Report",
    resource: "Balance Sheet - Q4 FY26",
    timestamp: "2026-06-17 09:08 AM",
    ipAddress: "192.168.1.110",
    device: "Laptop",
    location: "Ahmedabad, Gujarat",
    suspicious: false,
  },
  {
    id: "4",
    userId: "5",
    userName: "Vikram Singh",
    action: "Failed Login Attempt (3x)",
    resource: "System",
    timestamp: "2026-06-17 09:05 AM",
    ipAddress: "203.0.113.50",
    device: "Mobile",
    location: "Jaipur, Rajasthan",
    suspicious: true,
  },
  {
    id: "5",
    userId: "4",
    userName: "Neha Gupta",
    action: "Edited Ledger",
    resource: "Cash Account - Primary",
    timestamp: "2026-06-17 09:00 AM",
    ipAddress: "192.168.1.115",
    device: "Desktop",
    location: "Pune, Maharashtra",
    suspicious: false,
  },
  {
    id: "6",
    userId: "8",
    userName: "Arjun Nair",
    action: "Viewed Report",
    resource: "P&L Statement - March 2026",
    timestamp: "2026-06-17 08:55 AM",
    ipAddress: "192.168.1.120",
    device: "Tablet",
    location: "Kochi, Kerala",
    suspicious: false,
  },
  {
    id: "7",
    userId: "1",
    userName: "Rajesh Kumar",
    action: "Updated Role Permissions",
    resource: "Role: Accountant",
    timestamp: "2026-06-17 08:45 AM",
    ipAddress: "192.168.1.100",
    device: "Desktop",
    location: "Mumbai, Maharashtra",
    suspicious: false,
  },
  {
    id: "8",
    userId: "6",
    userName: "Deepak Mehta",
    action: "Failed Login Attempt (5x)",
    resource: "System",
    timestamp: "2026-06-17 08:30 AM",
    ipAddress: "198.51.100.25",
    device: "Desktop",
    location: "Unknown Location",
    suspicious: true,
  },
];

// Helper functions
const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "invited":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "suspended":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "inactive":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
};

const getRoleColor = (role: string) => {
  switch (role) {
    case "Super Admin":
      return "text-red-400";
    case "Admin":
      return "text-orange-400";
    case "Manager":
      return "text-yellow-400";
    case "Accountant":
      return "text-cyan-400";
    case "Viewer":
      return "text-zinc-400";
    default:
      return "text-purple-400";
  }
};

const getDeviceIcon = (device: string) => {
  switch (device) {
    case "Desktop":
      return Monitor;
    case "Laptop":
      return Monitor;
    case "Mobile":
      return Smartphone;
    case "Tablet":
      return Tablet;
    default:
      return Monitor;
  }
};

// Components
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
      initial={{ opacity: 0, y: 20 }}
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
  users: User[];
  accessLog: AccessLogEntry[];
}) {
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === "active").length;
    const adminCount = users.filter(
      (u) => u.role === "Super Admin" || u.role === "Admin"
    ).length;
    const viewerCount = users.filter((u) => u.role === "Viewer").length;
    const pendingInvitations = users.filter((u) => u.status === "invited").length;
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <SummaryCard
          icon={Users}
          title="Total Users"
          value={stats.totalUsers}
          subtitle={`${stats.activeUsers} active`}
          color="bg-cyan-500/20 text-cyan-400"
        />
        <SummaryCard
          icon={Activity}
          title="Active Users"
          value={stats.activeUsers}
          subtitle="Currently active"
          color="bg-emerald-500/20 text-emerald-400"
        />
        <SummaryCard
          icon={ShieldCheck}
          title="Admins"
          value={stats.adminCount}
          subtitle="Super Admin + Admin"
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
          subtitle="Awaiting acceptance"
          color="bg-yellow-500/20 text-yellow-400"
        />
        <SummaryCard
          icon={AlertTriangle}
          title="Security Alerts"
          value={stats.suspiciousActivity}
          subtitle="Suspicious activity"
          color="bg-red-500/20 text-red-400"
        />
      </div>
    </div>
  );
}

function UsersManagement({
  users,
  setUsers,
  roles,
}: {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  roles: Role[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditRole, setShowEditRole] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "Viewer",
    companyAccess: [] as string[],
  });
  const [showBulkActions, setShowBulkActions] = useState(false);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === "all" || user.role === filterRole;
      const matchesStatus =
        filterStatus === "all" || user.status === filterStatus;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, filterRole, filterStatus]);

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) {
      toast.error("Please fill in all required fields");
      return;
    }
    const user: User = {
      id: String(Date.now()),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: "invited",
      lastActive: "Never",
      lastLogin: "Never",
      companyAccess: newUser.companyAccess,
      defaultCompany: newUser.companyAccess[0] || "",
    };
    setUsers([...users, user]);
    setNewUser({ name: "", email: "", role: "Viewer", companyAccess: [] });
    setShowAddUser(false);
    toast.success(`Invitation sent to ${user.email}`);
  };

  const handleEditRole = (userId: string, newRole: string) => {
    setUsers(
      users.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    setShowEditRole(null);
    toast.success("Role updated successfully");
  };

  const handleSuspendUser = (userId: string) => {
    setUsers(
      users.map((u) =>
        u.id === userId
          ? { ...u, status: u.status === "suspended" ? "active" : "suspended" }
          : u
      )
    );
    toast.success("User status updated");
  };

  const handleRemoveUser = (userId: string) => {
    setUsers(users.filter((u) => u.id !== userId));
    toast.success("User removed successfully");
  };

  const handleResendInvite = (email: string) => {
    toast.success(`Invitation resent to ${email}`);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((u) => u.id));
    }
  };

  const handleBulkAction = (action: string) => {
    if (selectedUsers.length === 0) {
      toast.error("No users selected");
      return;
    }
    switch (action) {
      case "suspend":
        setUsers(
          users.map((u) =>
            selectedUsers.includes(u.id) ? { ...u, status: "suspended" } : u
          )
        );
        toast.success(`${selectedUsers.length} users suspended`);
        break;
      case "remove":
        setUsers(users.filter((u) => !selectedUsers.includes(u.id)));
        toast.success(`${selectedUsers.length} users removed`);
        break;
    }
    setSelectedUsers([]);
    setShowBulkActions(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Users Management</h2>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-medium rounded-lg transition-colors"
        >
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search users..."
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
              {role.name}
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

      {/* Bulk Actions */}
      {selectedUsers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg"
        >
          <span className="text-cyan-400 text-sm font-medium">
            {selectedUsers.length} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction("suspend")}
              className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30 transition-colors"
            >
              Suspend
            </button>
            <button
              onClick={() => handleBulkAction("remove")}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
            >
              Remove
            </button>
          </div>
          <button
            onClick={() => setSelectedUsers([])}
            className="ml-auto text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-3 px-4">
                <input
                  type="checkbox"
                  checked={
                    selectedUsers.length === filteredUsers.length &&
                    filteredUsers.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                />
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">
                Name
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium hidden sm:table-cell">
                Email
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">
                Role
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">
                Status
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium hidden md:table-cell">
                Last Active
              </th>
              <th className="text-left py-3 px-4 text-zinc-400 text-sm font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <motion.tr
                key={user.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => {
                      if (selectedUsers.includes(user.id)) {
                        setSelectedUsers(
                          selectedUsers.filter((id) => id !== user.id)
                        );
                      } else {
                        setSelectedUsers([...selectedUsers, user.id]);
                      }
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                  />
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-white">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-white font-medium">{user.name}</p>
                      <p className="text-zinc-400 text-sm sm:hidden">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-zinc-300 hidden sm:table-cell">
                  {user.email}
                </td>
                <td className="py-3 px-4">
                  <span className={`font-medium ${getRoleColor(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <StatusBadge status={user.status} />
                </td>
                <td className="py-3 px-4 text-zinc-400 text-sm hidden md:table-cell">
                  {user.lastActive}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEditRole(user.id)}
                      className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit Role"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleSuspendUser(user.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        user.status === "suspended"
                          ? "text-emerald-400 hover:bg-emerald-500/20"
                          : "text-yellow-400 hover:bg-yellow-500/20"
                      }`}
                      title={
                        user.status === "suspended" ? "Unsuspend" : "Suspend"
                      }
                    >
                      {user.status === "suspended" ? (
                        <Unlock size={16} />
                      ) : (
                        <Lock size={16} />
                      )}
                    </button>
                    {user.status === "invited" && (
                      <button
                        onClick={() => handleResendInvite(user.email)}
                        className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Resend Invite"
                      >
                        <Send size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveUser(user.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Remove User"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p>No users found matching your criteria</p>
        </div>
      )}

      {/* Add User Modal */}
      <Modal
        isOpen={showAddUser}
        onClose={() => setShowAddUser(false)}
        title="Add New User"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Enter full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser({ ...newUser, email: e.target.value })
              }
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="user@company.in"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Role
            </label>
            <select
              value={newUser.role}
              onChange={(e) =>
                setNewUser({ ...newUser, role: e.target.value })
              }
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Company Access
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {companies.map((company) => (
                <label
                  key={company.id}
                  className="flex items-center gap-2 p-2 hover:bg-zinc-800/50 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={newUser.companyAccess.includes(company.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewUser({
                          ...newUser,
                          companyAccess: [
                            ...newUser.companyAccess,
                            company.name,
                          ],
                        });
                      } else {
                        setNewUser({
                          ...newUser,
                          companyAccess: newUser.companyAccess.filter(
                            (c) => c !== company.name
                          ),
                        });
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
              onClick={handleAddUser}
              className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Send Invitation
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        isOpen={showEditRole !== null}
        onClose={() => setShowEditRole(null)}
        title="Change User Role"
      >
        {showEditRole && (
          <div className="space-y-4">
            <p className="text-zinc-300">
              Select a new role for{" "}
              <span className="text-white font-medium">
                {users.find((u) => u.id === showEditRole)?.name}
              </span>
            </p>
            <div className="space-y-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleEditRole(showEditRole, role.name)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    users.find((u) => u.id === showEditRole)?.role === role.name
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${role.color}`}>
                      {role.name}
                    </span>
                    {users.find((u) => u.id === showEditRole)?.role ===
                      role.name && (
                      <Check size={16} className="text-cyan-400" />
                    )}
                  </div>
                  <p className="text-zinc-400 text-sm mt-1">
                    {role.userCount} user{role.userCount !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowEditRole(null)}
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
  setRoles,
}: {
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
}) {
  const [selectedRole, setSelectedRole] = useState<string | null>(
    roles[0]?.id || null
  );
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const togglePermission = (roleId: string, category: string, permission: string) => {
    setRoles(
      roles.map((role) => {
        if (role.id === roleId) {
          return {
            ...role,
            permissions: {
              ...role.permissions,
              [category]: {
                ...role.permissions[category],
                [permission]: !role.permissions[category]?.[permission],
              },
            },
          };
        }
        return role;
      })
    );
  };

  const handleCreateRole = () => {
    if (!newRoleName) {
      toast.error("Please enter a role name");
      return;
    }
    const role: Role = {
      id: String(Date.now()),
      name: newRoleName,
      color: "text-purple-400",
      permissions: Object.fromEntries(
        Object.entries(permissionCategories).map(([cat, perms]) => [
          cat,
          Object.fromEntries(perms.map((p) => [p, false])),
        ])
      ),
      isCustom: true,
      userCount: 0,
    };
    setRoles([...roles, role]);
    setNewRoleName("");
    setShowCreateRole(false);
    setSelectedRole(role.id);
    setEditingRole(role.id);
    toast.success(`Role "${role.name}" created`);
  };

  const applyTemplate = (templateId: string) => {
    const template = roleTemplates.find((t) => t.id === templateId);
    if (!template || !editingRole) return;
    setRoles(
      roles.map((role) => {
        if (role.id === editingRole) {
          return { ...role, permissions: template.permissions };
        }
        return role;
      })
    );
    setShowTemplates(false);
    toast.success(`Template "${template.name}" applied`);
  };

  const selectedRoleData = roles.find((r) => r.id === selectedRole);

  return (
    <div className="space-y-4">
      {/* Header */}
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
        {/* Roles List */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-zinc-400 text-sm font-medium mb-3">Roles</p>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRole(role.id);
                setEditingRole(null);
              }}
              className={`w-full p-3 rounded-lg border text-left transition-all ${
                selectedRole === role.id
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${role.color}`}>{role.name}</span>
                <div className="flex items-center gap-2">
                  {role.isCustom && (
                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                      Custom
                    </span>
                  )}
                  <span className="text-zinc-400 text-sm">{role.userCount}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Permissions Grid */}
        <div className="lg:col-span-3">
          {selectedRoleData ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className={`text-lg font-semibold ${selectedRoleData.color}`}>
                    {selectedRoleData.name}
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    {selectedRoleData.userCount} user
                    {selectedRoleData.userCount !== 1 ? "s" : ""} with this role
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingRole === selectedRoleData.id ? (
                    <>
                      <button
                        onClick={() => setShowTemplates(true)}
                        className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                      >
                        Apply Template
                      </button>
                      <button
                        onClick={() => setEditingRole(null)}
                        className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditingRole(selectedRoleData.id)}
                      className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm hover:bg-zinc-600 transition-colors"
                    >
                      Edit Permissions
                    </button>
                  )}
                </div>
              </div>

              {/* Permission Matrix */}
              <div className="space-y-6">
                {Object.entries(permissionCategories).map(
                  ([category, permissions]) => (
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
                          const isEnabled =
                            selectedRoleData.permissions[category]?.[permission] ||
                            false;
                          const isEditing = editingRole === selectedRoleData.id;
                          return (
                            <button
                              key={permission}
                              onClick={() => {
                                if (isEditing) {
                                  togglePermission(
                                    selectedRoleData.id,
                                    category,
                                    permission
                                  );
                                }
                              }}
                              disabled={!isEditing}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                isEnabled
                                  ? "border-cyan-500/30 bg-cyan-500/10"
                                  : "border-zinc-700 bg-zinc-800/50"
                              } ${isEditing ? "cursor-pointer hover:border-cyan-500/50" : "cursor-default"}`}
                            >
                              <span
                                className={`text-sm ${
                                  isEnabled ? "text-white" : "text-zinc-400"
                                }`}
                              >
                                {permission}
                              </span>
                              {isEnabled ? (
                                <ToggleRight
                                  size={20}
                                  className="text-cyan-400"
                                />
                              ) : (
                                <ToggleLeft
                                  size={20}
                                  className="text-zinc-500"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
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

      {/* Create Role Modal */}
      <Modal
        isOpen={showCreateRole}
        onClose={() => setShowCreateRole(false)}
        title="Create Custom Role"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Role Name
            </label>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="e.g., Tax Consultant"
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
              onClick={handleCreateRole}
              className="flex-1 px-4 py-2.5 bg-cyan-500 text-black font-medium rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Create Role
            </button>
          </div>
        </div>
      </Modal>

      {/* Apply Template Modal */}
      <Modal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        title="Apply Role Template"
      >
        <div className="space-y-3">
          <p className="text-zinc-400 text-sm">
            Select a template to apply to this role. This will overwrite current
            permissions.
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
                    <p className="text-zinc-400 text-sm">
                      {template.description}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="ml-auto text-zinc-500"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

function AccessLog({ accessLog }: { accessLog: AccessLogEntry[] }) {
  const [filterUser, setFilterUser] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);

  const filteredLog = useMemo(() => {
    return accessLog.filter((entry) => {
      const matchesUser =
        filterUser === "all" || entry.userId === filterUser;
      const matchesAction =
        filterAction === "all" ||
        entry.action.toLowerCase().includes(filterAction.toLowerCase());
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

  const uniqueActions = useMemo(() => {
    const actions = new Set(accessLog.map((e) => e.action));
    return Array.from(actions);
  }, [accessLog]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Access Log</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSuspiciousOnly}
              onChange={(e) => setShowSuspiciousOnly(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-zinc-300 text-sm">Suspicious only</span>
            {showSuspiciousOnly && (
              <AlertTriangle size={14} className="text-red-400" />
            )}
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
        >
          <option value="all">All Users</option>
          {uniqueUsers.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.userName}
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

      {/* Timeline */}
      <div className="space-y-3">
        {filteredLog.map((entry, index) => {
          const DeviceIcon = getDeviceIcon(entry.device);
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`relative p-4 rounded-xl border transition-all ${
                entry.suspicious
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      entry.suspicious
                        ? "bg-red-500/20"
                        : "bg-zinc-800"
                    }`}
                  >
                    {entry.suspicious ? (
                      <AlertTriangle size={18} className="text-red-400" />
                    ) : (
                      <DeviceIcon size={18} className="text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {entry.userName}
                      </span>
                      <span className="text-zinc-400 text-sm">
                        {entry.action}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-sm">{entry.resource}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-zinc-500 hidden md:block">
                    {entry.ipAddress}
                  </span>
                  <span className="text-zinc-500 hidden lg:block">
                    {entry.location}
                  </span>
                  <span className="text-zinc-400 whitespace-nowrap">
                    {entry.timestamp}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredLog.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <Activity size={48} className="mx-auto mb-4 opacity-50" />
          <p>No access logs found</p>
        </div>
      )}
    </div>
  );
}

function CompanyAccess({
  users,
  setUsers,
}: {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const companyUsers = useMemo(() => {
    if (!selectedCompany) return users;
    return users.filter((u) => u.companyAccess.includes(selectedCompany));
  }, [users, selectedCompany]);

  const toggleCompanyAccess = (userId: string, company: string) => {
    setUsers(
      users.map((u) => {
        if (u.id === userId) {
          const hasAccess = u.companyAccess.includes(company);
          return {
            ...u,
            companyAccess: hasAccess
              ? u.companyAccess.filter((c) => c !== company)
              : [...u.companyAccess, company],
            defaultCompany:
              !hasAccess && u.companyAccess.length === 0 ? company : u.defaultCompany,
          };
        }
        return u;
      })
    );
  };

  const setDefaultCompany = (userId: string, company: string) => {
    setUsers(
      users.map((u) => (u.id === userId ? { ...u, defaultCompany: company } : u))
    );
    toast.success("Default company updated");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Company Access</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Companies List */}
        <div className="lg:col-span-1">
          <p className="text-zinc-400 text-sm font-medium mb-3">Companies</p>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedCompany(null)}
              className={`w-full p-3 rounded-lg border text-left transition-all ${
                selectedCompany === null
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-zinc-400" />
                  <span className="text-white font-medium">All Companies</span>
                </div>
                <span className="text-zinc-400 text-sm">{users.length}</span>
              </div>
            </button>
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => setSelectedCompany(company.name)}
                className={`w-full p-3 rounded-lg border text-left transition-all ${
                  selectedCompany === company.name
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-zinc-400" />
                    <span className="text-white font-medium">{company.name}</span>
                  </div>
                  <span className="text-zinc-400 text-sm">
                    {company.userCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Users per Company */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-6">
            <h3 className="text-white font-medium mb-4">
              {selectedCompany
                ? `Users with access to ${selectedCompany}`
                : "All Users"}
            </h3>
            <div className="space-y-3">
              {companyUsers.map((user) => (
                <div
                  key={user.id}
                  className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-white">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-zinc-400 text-sm">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm ${getRoleColor(user.role)}`}>
                        {user.role}
                      </span>
                      <StatusBadge status={user.status} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.companyAccess.map((company) => (
                      <div
                        key={company}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-700/50 rounded-lg text-sm"
                      >
                        <span className="text-zinc-300">{company}</span>
                        {user.defaultCompany === company && (
                          <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded">
                            Default
                          </span>
                        )}
                        <button
                          onClick={() => setDefaultCompany(user.id, company)}
                          className="text-zinc-500 hover:text-cyan-400 transition-colors"
                          title="Set as default"
                        >
                          <Star size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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

// Star component for default company indicator
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

// Main Component
export default function RBACPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRealData();
  }, []);

  const loadRealData = async () => {
    setLoading(true);
    try {
      // Load users from user_licenses
      const { data: licenses } = await supabase
        .from("user_licenses")
        .select("id, user_id, license_key, status, expiry_date, created_at")
        .order("created_at", { ascending: false });

      // Load companies
      const { data: comps } = await supabase
        .from("companies")
        .select("id, name, owner_id")
        .order("created_at", { ascending: false });

      // Load roles
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("*")
        .order("name");

      // Load activity logs
      const { data: logs } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      // Build users from licenses
      if (licenses && licenses.length > 0) {
        const companyMap = new Map((comps || []).map((c: any) => [c.id, c]));
        const ownerCompanies = new Map<string, string[]>();
        (comps || []).forEach((c: any) => {
          if (c.owner_id) {
            if (!ownerCompanies.has(c.owner_id)) ownerCompanies.set(c.owner_id, []);
            ownerCompanies.get(c.owner_id)!.push(c.name);
          }
        });

        const userMap = new Map<string, User>();
        (licenses || []).forEach((l: any) => {
          const uid = l.user_id;
          if (!userMap.has(uid)) {
            const companyNames = ownerCompanies.get(uid) || [];
            userMap.set(uid, {
              id: uid,
              name: uid.substring(0, 8),
              email: `${uid.substring(0, 8)}@user`,
              role: l.license_key?.startsWith("TOM-SUPER") ? "Super Admin" : "User",
              status: l.status === "active" ? "active" : l.status === "expired" ? "inactive" : "suspended",
              lastActive: l.created_at ? new Date(l.created_at).toLocaleDateString() : "Never",
              lastLogin: l.created_at ? new Date(l.created_at).toLocaleDateString() : "Never",
              companyAccess: companyNames,
              defaultCompany: companyNames[0] || "N/A",
            });
          }
        });
        setUsers(Array.from(userMap.values()));
      }

      // Build roles
      if (roleData && roleData.length > 0) {
        const builtRoles: Role[] = roleData.map((r: any) => ({
          id: r.id,
          name: r.display_name || r.name,
          color: r.is_system ? "#06b6d4" : "#8b5cf6",
          permissions: r.permissions || {},
          isCustom: !r.is_system,
          userCount: 0,
        }));
        setRoles(builtRoles);
      } else {
        // Default roles if table is empty
        setRoles([
          { id: "1", name: "Super Admin", color: "#ef4444", permissions: {}, isCustom: false, userCount: 1 },
          { id: "2", name: "Admin", color: "#f59e0b", permissions: {}, isCustom: false, userCount: 0 },
          { id: "3", name: "Accountant", color: "#3b82f6", permissions: {}, isCustom: false, userCount: 0 },
          { id: "4", name: "Viewer", color: "#6b7280", permissions: {}, isCustom: false, userCount: 0 },
        ]);
      }

      // Build access log
      if (logs && logs.length > 0) {
        setAccessLog(logs.map((l: any) => ({
          id: l.id,
          userId: l.user_id || "unknown",
          userName: l.user_email || l.user_id?.substring(0, 8) || "Unknown",
          action: l.action || "unknown",
          resource: l.resource || "unknown",
          timestamp: l.created_at || new Date().toISOString(),
          ipAddress: l.ip_address || "N/A",
          device: l.device || "Web",
          location: l.location || "N/A",
          suspicious: false,
        })));
      }

      // Build companies
      if (comps && comps.length > 0) {
        setCompanies(comps.map((c: any) => ({
          id: c.id,
          name: c.name,
          userCount: 1,
        })));
      }
    } catch (e) {
      console.error("RBAC data load error:", e);
    } finally {
      setLoading(false);
    }
  };

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

      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 sm:py-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Shield size={24} className="text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  Role-Based Access Control
                </h1>
                <p className="text-zinc-400 text-sm">
                  Manage users, roles, permissions, and company access
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "users" && (
              <div className="space-y-6">
                <UsersDashboard users={users} accessLog={accessLog} />
                <UsersManagement users={users} setUsers={setUsers} roles={roles} />
              </div>
            )}
            {activeTab === "roles" && (
              <RolesPermissions roles={roles} setRoles={setRoles} />
            )}
            {activeTab === "log" && <AccessLog accessLog={accessLog} />}
            {activeTab === "companies" && (
              <CompanyAccess users={users} setUsers={setUsers} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
