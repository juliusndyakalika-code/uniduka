import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { User, Mail, Phone, KeyRound, Check, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface Profile { id: string; fullName: string; email?: string | null; phone?: string | null; role: string; }
interface ProfileForm { fullName: string; email?: string; phone?: string; }
interface PwForm { currentPassword: string; newPassword: string; confirmPassword: string; }

export default function MyAccountPage() {
  const qc = useQueryClient();
  const { user: storeUser, setAuth, token, account, shopId } = useAuthStore();

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data.data),
  });

  const profileForm = useForm<ProfileForm>();
  const pwForm = useForm<PwForm>();

  const [profileError, setProfileError] = useState('');
  const [profileDone, setProfileDone] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const [showPws, setShowPws] = useState(false);

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        fullName: profile.fullName,
        email: profile.email || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (d: ProfileForm) => api.patch('/auth/me', d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setProfileDone(true);
      setProfileError('');
      // Update auth store so sidebar name updates immediately
      const updated = res.data.data as Profile;
      if (storeUser && token && account) {
        setAuth(token, { ...storeUser, fullName: updated.fullName, email: updated.email, phone: updated.phone }, account, shopId || undefined);
      }
      setTimeout(() => setProfileDone(false), 3000);
    },
    onError: (e: unknown) => {
      setProfileError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save');
    },
  });

  const { mutate: changePassword, isPending: changingPw } = useMutation({
    mutationFn: (d: PwForm) => api.put('/auth/password', { currentPassword: d.currentPassword, newPassword: d.newPassword }),
    onSuccess: () => {
      setPwDone(true);
      setPwError('');
      pwForm.reset();
    },
    onError: (e: unknown) => {
      setPwError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed');
    },
  });

  function onPwSubmit(d: PwForm) {
    if (d.newPassword !== d.confirmPassword) { setPwError('Passwords do not match'); return; }
    if (d.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwError('');
    changePassword(d);
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-lg space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Account</h1>
          <p className="page-subtitle">Manage your personal details and password</p>
        </div>
      </div>

      {/* Avatar + role */}
      <div className="card p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 text-xl font-bold flex items-center justify-center flex-shrink-0">
          {profile?.fullName?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-stone-900">{profile?.fullName}</p>
          <p className="text-xs text-stone-400 uppercase tracking-widest mt-0.5">{profile?.role?.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Profile form */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <User size={15} className="text-primary-600" />
          <h2 className="text-sm font-bold text-stone-900">Personal Details</h2>
        </div>

        {profileError && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{profileError}</div>
        )}
        {profileDone && (
          <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-1.5">
            <Check size={12} /> Profile updated successfully
          </div>
        )}

        <form onSubmit={profileForm.handleSubmit(d => {
          if (!d.email && !d.phone) { setProfileError('Provide email or phone number (at least one required)'); return; }
          setProfileError('');
          saveProfile(d);
        })} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input {...profileForm.register('fullName', { required: true })} className="input" />
          </div>
          <div>
            <label className="label flex items-center gap-1"><Mail size={12} /> Email</label>
            <input {...profileForm.register('email')} type="email" className="input" placeholder="your@email.com" />
          </div>
          <div>
            <label className="label flex items-center gap-1"><Phone size={12} /> Phone Number</label>
            <input {...profileForm.register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
          </div>
          <p className="text-[11px] text-stone-400">Email or phone is required — you use these to log in.</p>
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? <Loader2 size={13} className="animate-spin" /> : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={15} className="text-primary-600" />
          <h2 className="text-sm font-bold text-stone-900">Change Password</h2>
        </div>

        {pwError && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{pwError}</div>
        )}
        {pwDone && (
          <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-1.5">
            <Check size={12} /> Password changed successfully
          </div>
        )}

        <form onSubmit={pwForm.handleSubmit(onPwSubmit)} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input
              {...pwForm.register('currentPassword', { required: true })}
              type={showPws ? 'text' : 'password'}
              className="input"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              {...pwForm.register('newPassword', { required: true, minLength: 8 })}
              type={showPws ? 'text' : 'password'}
              className="input"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              {...pwForm.register('confirmPassword', { required: true })}
              type={showPws ? 'text' : 'password'}
              className="input"
              placeholder="Repeat new password"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer">
            <input type="checkbox" checked={showPws} onChange={e => setShowPws(e.target.checked)} className="rounded" />
            Show passwords
          </label>
          <button type="submit" disabled={changingPw} className="btn-primary">
            {changingPw ? <Loader2 size={13} className="animate-spin" /> : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
