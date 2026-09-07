import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';
import Navbar from '../../components/Navbar';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  Search,
  Users,
  CheckCircle,
  XCircle,
  Shield,
  Loader2,
  Mail,
  MapPin,
  Calendar,
} from 'lucide-react';

export default function UserManagement() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setUsers(data as Profile[]);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    setTogglingUser(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      setUsers(
        users.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
      );
    } catch (error) {
      console.error('Error updating user status:', error);
      alert(t('failed_update_user_status'));
    } finally {
      setTogglingUser(null);
    }
  };

  const toggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    setTogglingUser(userId);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (error) {
      console.error('Error updating user role:', error);
      alert(t('failed_update_user_role'));
    } finally {
      setTogglingUser(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.fullname.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());

    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'active' && user.is_active) ||
      (statusFilter === 'inactive' && !user.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 font-poppins">
            {t('user_management')}
          </h1>
          <p className="text-gray-600 mt-1">{t('manage_users_desc')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-gray-500 text-sm">{t('total_users')}</p>
          </div>

          <div className="stat-card">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-2">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.admins}</p>
            <p className="text-gray-500 text-sm">{t('admins')}</p>
          </div>

          <div className="stat-card">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            <p className="text-gray-500 text-sm">{t('active')}</p>
          </div>

          <div className="stat-card">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
            <p className="text-gray-500 text-sm">{t('inactive')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('search_users')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-12"
                />
              </div>
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input w-full md:w-40"
            >
              <option value="">{t('all_roles')}</option>
              <option value="user">{t('user')}</option>
              <option value="admin">{t('admins')}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-full md:w-40"
            >
              <option value="">{t('all_status')}</option>
              <option value="active">{t('active')}</option>
              <option value="inactive">{t('inactive')}</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="table-header">{t('user')}</th>
                    <th className="table-header">{t('district')}</th>
                    <th className="table-header">{t('role')}</th>
                    <th className="table-header">{t('status')}</th>
                    <th className="table-header">{t('joined')}</th>
                    <th className="table-header">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-gray-900">{user.fullname}</p>
                          <div className="flex items-center gap-1 text-gray-500 text-sm">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1 text-gray-700">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {user.district}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span
                          className={`badge ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.role === 'admin' ? t('admins') : t('user')}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span
                          className={`badge ${
                            user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.is_active ? t('active') : t('inactive')}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1 text-gray-500 text-sm">
                          <Calendar className="w-3 h-3" />
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleUserStatus(user.id, user.is_active)}
                            disabled={togglingUser === user.id}
                            className={`p-2 rounded-lg ${
                              user.is_active
                                ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title={user.is_active ? t('deactivate_user') : t('activate_user')}
                          >
                            {togglingUser === user.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : user.is_active ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => toggleUserRole(user.id, user.role)}
                            disabled={togglingUser === user.id}
                            className={`p-2 rounded-lg hover:bg-gray-100 ${
                              user.role === 'admin' ? 'text-purple-600' : 'text-gray-500 hover:text-purple-600'
                            }`}
                            title={user.role === 'admin' ? t('make_user') : t('make_admin')}
                          >
                            {togglingUser === user.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Shield className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
