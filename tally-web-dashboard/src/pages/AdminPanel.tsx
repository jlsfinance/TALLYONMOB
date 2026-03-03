import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/insforge';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPanel() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const navigate = useNavigate();
    const { selectCompany } = useAuth() as any;

    useEffect(() => {
        fetchAllUsers();
    }, []);

    const fetchAllUsers = async () => {
        setLoading(true);
        try {
            // Get auth token
            const { data: { session } } = await supabase.auth.getCurrentSession();
            if (!session) {
                alert('Please login first');
                return;
            }

            // Call admin Edge Function
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL || ''}/api/v1/admin/license`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ action: 'list_all' }),
                }
            );

            const result = await response.json();
            if (result.licenses) {
                // Fetch companies for each user
                const enrichedUsers = await Promise.all(
                    result.licenses.map(async (license) => {
                        const { data: companies } = await supabase
                            .from('companies')
                            .select('id, name, gstin, address, state, created_at, owner_id')
                            .eq('owner_id', license.user_id)
                            .order('created_at', { ascending: false });

                        return {
                            ...license,
                            companies: companies || [],
                        };
                    })
                );
                setUsers(enrichedUsers);
            } else {
                alert(result.message || 'Failed to fetch users');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error fetching users: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const executeAdminAction = async (action, targetEmail, days = null) => {
        try {
            const { data: { session } } = await supabase.auth.getCurrentSession();
            if (!session) {
                alert('Please login first');
                return;
            }

            const body: any = { action, target_email: targetEmail };
            if (days) body.days = days;

            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL || ''}/api/v1/admin/license`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                }
            );

            const result = await response.json();
            if (result.status === 'ok') {
                alert(result.message || 'Action completed successfully');
                fetchAllUsers(); // Refresh
            } else {
                alert(result.message || 'Action failed');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        }
    };

    const viewAsUser = (company) => {
        // Set the company in context and navigate to dashboard
        selectCompany(company);
        navigate('/dashboard');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getDaysRemaining = (endDate) => {
        if (!endDate) return 0;
        const diff = new Date(endDate).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div className="spinner"></div>
                <p>Loading users...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1f2937' }}>
                    🔐 Admin Panel
                </h1>
                <button
                    onClick={fetchAllUsers}
                    style={{
                        padding: '10px 20px',
                        background: '#6366f1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                    }}
                >
                    🔄 Refresh
                </button>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                        <tr>
                            <th style={thStyle}>Email</th>
                            <th style={thStyle}>Plan</th>
                            <th style={thStyle}>Status</th>
                            <th style={thStyle}>Days Left</th>
                            <th style={thStyle}>Tally Serial</th>
                            <th style={thStyle}>Companies</th>
                            <th style={thStyle}>Last Login</th>
                            <th style={thStyle}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => {
                            const daysLeft = user.plan === 'trial'
                                ? getDaysRemaining(user.trial_end)
                                : getDaysRemaining(user.subscription_end);

                            return (
                                <React.Fragment key={user.id}>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: '600', color: '#1f2937' }}>{user.email}</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>ID: {user.user_id.slice(0, 8)}...</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                padding: '4px 12px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                background: user.plan === 'pro' ? '#dbeafe' : '#fef3c7',
                                                color: user.plan === 'pro' ? '#1e40af' : '#92400e',
                                            }}>
                                                {user.plan === 'pro' ? '⭐ Pro' : '🆓 Trial'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                padding: '4px 12px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                background: user.status === 'active' ? '#d1fae5' : user.status === 'blocked' ? '#fee2e2' : '#fef3c7',
                                                color: user.status === 'active' ? '#065f46' : user.status === 'blocked' ? '#991b1b' : '#92400e',
                                            }}>
                                                {user.status === 'active' ? '✅ Active' : user.status === 'blocked' ? '🚫 Blocked' : '⏰ Expired'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                fontWeight: '700',
                                                fontSize: '16px',
                                                color: daysLeft > 7 ? '#10b981' : daysLeft > 0 ? '#f59e0b' : '#ef4444',
                                            }}>
                                                {daysLeft}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '4px' }}>days</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <code style={{ fontSize: '12px', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                                                {user.tally_serial || '?'}
                                            </code>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                                                {user.companies.length} {user.companies.length === 1 ? 'company' : 'companies'}
                                            </div>
                                            {user.companies.length > 0 && (
                                                <button
                                                    onClick={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
                                                    style={{
                                                        fontSize: '11px',
                                                        color: '#6366f1',
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        textDecoration: 'underline',
                                                        marginTop: '4px',
                                                    }}
                                                >
                                                    {selectedUser?.id === user.id ? 'Hide' : 'View'}
                                                </button>
                                            )}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                {formatDate(user.last_login_at)}
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => {
                                                        const days = prompt('Extend subscription by how many days?', '30');
                                                        if (days) executeAdminAction('extend_subscription', user.email, parseInt(days));
                                                    }}
                                                    style={actionBtnStyle('#10b981')}
                                                    title="Extend Subscription"
                                                >
                                                    ➕ Days
                                                </button>
                                                <button
                                                    onClick={() => executeAdminAction('reset_serial', user.email)}
                                                    style={actionBtnStyle('#f59e0b')}
                                                    title="Reset Tally Serial"
                                                >
                                                    🔄 Serial
                                                </button>
                                                <button
                                                    onClick={() => executeAdminAction(user.status === 'blocked' ? 'reactivate' : 'block', user.email)}
                                                    style={actionBtnStyle(user.status === 'blocked' ? '#10b981' : '#ef4444')}
                                                    title={user.status === 'blocked' ? 'Reactivate' : 'Block'}
                                                >
                                                    {user.status === 'blocked' ? '✅' : '🚫'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {selectedUser?.id === user.id && user.companies.length > 0 && (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '0', background: '#f9fafb' }}>
                                                <div style={{ padding: '20px', borderTop: '2px solid #e5e7eb' }}>
                                                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#1f2937' }}>
                                                        📊 Companies for {user.email}
                                                    </h3>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                                                        {user.companies.map((company) => (
                                                            <div
                                                                key={company.id}
                                                                onClick={() => viewAsUser(company)}
                                                                style={{
                                                                    background: 'white',
                                                                    padding: '15px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #e5e7eb',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                                                    e.currentTarget.style.borderColor = '#6366f1';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.boxShadow = 'none';
                                                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: '700', fontSize: '14px', color: '#1f2937', marginBottom: '8px' }}>
                                                                    {company.name}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                                                    <strong>GSTIN:</strong> {company.gstin || '—'}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                                                    <strong>Address:</strong> {company.address || '—'}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                                                    <strong>State:</strong> {company.state || '—'}
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>
                                                                    Created: {formatDate(company.created_at)}
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '11px',
                                                                    color: '#6366f1',
                                                                    marginTop: '8px',
                                                                    fontWeight: '600',
                                                                    textAlign: 'center',
                                                                    padding: '6px',
                                                                    background: '#eef2ff',
                                                                    borderRadius: '4px',
                                                                }}>
                                                                    👁️ Click to view as user
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>

                {users.length === 0 && (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
                        <p style={{ fontSize: '18px' }}>No users found</p>
                    </div>
                )}
            </div>
        </div>
    );
}

const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: '700' as const,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
};

const tdStyle = {
    padding: '16px',
    fontSize: '14px',
    color: '#374151',
};

const actionBtnStyle = (color: string) => ({
    padding: '6px 10px',
    background: color,
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600' as const,
    cursor: 'pointer' as const,
    whiteSpace: 'nowrap' as const,
});


