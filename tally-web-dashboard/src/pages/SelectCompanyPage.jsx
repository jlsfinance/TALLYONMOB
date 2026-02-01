import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SelectCompanyPage.css';

export default function SelectCompanyPage() {
    const { companies, selectCompany, selectedCompany, loading, deleteCompany } = useAuth();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteModal, setDeleteModal] = useState({ show: false, company: null });
    const [deleting, setDeleting] = useState(false);

    // If company already selected, go to dashboard
    useEffect(() => {
        if (selectedCompany && !loading) {
            navigate('/', { replace: true });
        }
    }, [selectedCompany, loading, navigate]);

    const handleSelectCompany = (company) => {
        selectCompany(company);
        navigate('/', { replace: true });
    };

    const handleDeleteClick = (e, company) => {
        e.stopPropagation();
        setDeleteModal({ show: true, company });
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal.company) return;

        setDeleting(true);
        const { success, error } = await deleteCompany(deleteModal.company.id);
        setDeleting(false);

        if (success) {
            setDeleteModal({ show: false, company: null });
        } else {
            alert('Delete failed: ' + (error || 'Unknown error'));
        }
    };

    const filteredCompanies = companies.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="select-company-3d">
                <div className="select-company-3d__bg-grid" />
                <div className="select-company-3d__loading">
                    <div className="select-company-3d__spinner" />
                    <p>Loading companies...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="select-company-3d">
            {/* Background */}
            <div className="select-company-3d__bg-grid" />
            <div className="select-company-3d__orbs">
                <div className="select-company-3d__orb select-company-3d__orb--1" />
                <div className="select-company-3d__orb select-company-3d__orb--2" />
            </div>

            <div className="select-company-3d__container">
                {/* Header */}
                <div className="select-company-3d__header">
                    <div className="select-company-3d__logo">
                        <span>📊</span>
                    </div>
                    <h1 className="select-company-3d__title">LiveKeeping</h1>
                    <p className="select-company-3d__subtitle">Select your company to continue</p>
                </div>

                {/* Search */}
                {companies.length > 3 && (
                    <div className="select-company-3d__search">
                        <span className="select-company-3d__search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search company..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="select-company-3d__search-input"
                        />
                    </div>
                )}

                {/* Company List */}
                <div className="select-company-3d__list">
                    {filteredCompanies.length === 0 ? (
                        <div className="select-company-3d__empty">
                            <span className="select-company-3d__empty-icon">🏢</span>
                            <p>No companies found</p>
                            <span>Sync your Tally data to get started</span>
                        </div>
                    ) : (
                        filteredCompanies.map((company, index) => (
                            <div
                                key={company.id}
                                className="select-company-3d__card-wrapper"
                                style={{ animationDelay: `${index * 80}ms` }}
                            >
                                <button
                                    onClick={() => handleSelectCompany(company)}
                                    className="select-company-3d__card"
                                >
                                    <div className="select-company-3d__card-avatar">
                                        {company.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="select-company-3d__card-info">
                                        <h3 className="select-company-3d__card-name">{company.name}</h3>
                                        <div className="select-company-3d__card-meta">
                                            {company.guid && (
                                                <span className="select-company-3d__card-guid">
                                                    {company.guid.substring(0, 12)}...
                                                </span>
                                            )}
                                            {company.last_sync_at && (
                                                <span className="select-company-3d__card-synced">
                                                    <span className="select-company-3d__card-dot" />
                                                    Synced
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="select-company-3d__card-arrow">→</span>
                                </button>

                                <button
                                    onClick={(e) => handleDeleteClick(e, company)}
                                    className="select-company-3d__delete-btn"
                                    title="Delete Company Data"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="select-company-3d__footer">
                    <p>Powered by LiveKeeping • Tally Sync Platform</p>
                </div>
            </div>

            {/* Delete Modal */}
            {deleteModal.show && (
                <div className="select-company-3d__modal-overlay">
                    <div className="select-company-3d__modal">
                        <div className="select-company-3d__modal-icon">⚠️</div>
                        <h3 className="select-company-3d__modal-title">Delete Company?</h3>
                        <p className="select-company-3d__modal-text">
                            This will permanently delete all data for{' '}
                            <strong>{deleteModal.company?.name}</strong>.
                        </p>
                        <p className="select-company-3d__modal-warning">
                            Vouchers, Sales, Purchases, Ledgers - everything will be removed.
                        </p>

                        <div className="select-company-3d__modal-actions">
                            <button
                                onClick={() => setDeleteModal({ show: false, company: null })}
                                disabled={deleting}
                                className="select-company-3d__modal-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                                className="select-company-3d__modal-delete"
                            >
                                {deleting ? (
                                    <>
                                        <div className="select-company-3d__btn-spinner" />
                                        Deleting...
                                    </>
                                ) : (
                                    '🗑️ Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
