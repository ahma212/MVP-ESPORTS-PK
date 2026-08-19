import React, { useState, useRef } from 'react';
import { UserProfile } from '../types';
import { X, Camera, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSmartLoading } from '../context/LoadingContext';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdate: (updatedProfile: UserProfile) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, userProfile, onUpdate }) => {
  const { showLoader, hideLoader } = useSmartLoading();
  const [formData, setFormData] = useState({
    name: userProfile.name || '',
    pubg_id_name: userProfile.pubg_id_name || '',
    pubg_id_number: userProfile.pubg_id_number || '',
    avatar_url: userProfile.avatar_url || ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, avatar_url: previewUrl }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    showLoader("Saving profile...");

    try {
      let finalAvatarUrl = userProfile.avatar_url || '';

      // 1. Upload avatar image to Supabase Storage if a new file was selected
      if (avatarFile && supabase) {
        try {
          const fileExt = avatarFile.name.split('.').pop() || 'png';
          const fileName = `${userProfile.id}/avatar_${Date.now()}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, avatarFile, { upsert: true, cacheControl: '3600' });

          if (!uploadError && uploadData) {
            const { data: publicUrlData } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);

            if (publicUrlData?.publicUrl) {
              const rawUrl = publicUrlData.publicUrl;
              finalAvatarUrl = rawUrl.includes('?') ? `${rawUrl}&t=${Date.now()}` : `${rawUrl}?t=${Date.now()}`;
            }
          } else {
            console.warn("Supabase avatars storage upload warning:", uploadError?.message);
          }
        } catch (uploadErr: any) {
          console.warn("Avatar upload exception:", uploadErr);
        }
      }

      const trimmedName = formData.name.trim();
      const trimmedPubgName = formData.pubg_id_name.trim();
      const trimmedPubgId = formData.pubg_id_number.trim();

      // 2. Strict Security: Save ONLY name, pubg_name, pubg_id, avatar_url to public.profiles table
      // NEVER send is_admin, role, wallet_balance, or other system fields
      if (supabase) {
        const dbPayload: {
          name: string;
          pubg_name: string;
          pubg_id: string;
          avatar_url: string | null;
        } = {
          name: trimmedName,
          pubg_name: trimmedPubgName,
          pubg_id: trimmedPubgId,
          avatar_url: finalAvatarUrl || userProfile.avatar_url || null
        };

        const { error: updateError } = await supabase
          .from('profiles')
          .update(dbPayload)
          .eq('id', userProfile.id);

        if (updateError) {
          console.warn("Profile database update warning:", updateError.message);
        }
      }

      // 3. Immediately update active user profile state in frontend memory
      const finalProfile: UserProfile = {
        ...userProfile,
        name: trimmedName,
        pubg_id_name: trimmedPubgName,
        pubg_id_number: trimmedPubgId,
        avatar_url: finalAvatarUrl || userProfile.avatar_url || null
      };

      onUpdate(finalProfile);
      onClose();
    } catch (err: any) {
      console.error("Profile update error:", err);
      alert("Error updating profile. Please try again.");
    } finally {
      setIsSaving(false);
      hideLoader();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#07192e] border border-[#00e5ff]/30 rounded-2xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white">Edit Profile</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#0055ff] p-0.5 border-2 border-[#00e5ff] shadow-lg shadow-[#00e5ff]/20">
                <div className="w-full h-full bg-[#030a16] rounded-full flex items-center justify-center font-black text-[#00e5ff] text-2xl overflow-hidden">
                  {formData.avatar_url ? (
                    <img 
                      src={formData.avatar_url} 
                      alt="Avatar" 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    userProfile.username?.charAt(0).toUpperCase() || 'P'
                  )}
                </div>
              </div>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-[#00e5ff] rounded-full text-[#030a16] hover:scale-110 active:scale-95 transition-all shadow-md"
                title="Choose new avatar"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Username (Read-only)</label>
            <input type="text" value={userProfile.username} disabled className="w-full bg-[#030a16]/50 border border-gray-800 rounded-xl p-3 text-gray-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email (Read-only)</label>
            <input type="email" value={userProfile.email} disabled className="w-full bg-[#030a16]/50 border border-gray-800 rounded-xl p-3 text-gray-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Full Name</label>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#030a16] border border-gray-700 rounded-xl p-3 text-white focus:border-[#00e5ff] outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">PUBG ID Name</label>
            <input type="text" value={formData.pubg_id_name} onChange={e => setFormData({...formData, pubg_id_name: e.target.value})} className="w-full bg-[#030a16] border border-gray-700 rounded-xl p-3 text-white focus:border-[#00e5ff] outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">PUBG ID Number</label>
            <input type="text" value={formData.pubg_id_number} onChange={e => setFormData({...formData, pubg_id_number: e.target.value})} className="w-full bg-[#030a16] border border-gray-700 rounded-xl p-3 text-white focus:border-[#00e5ff] outline-none" />
          </div>
          <button 
            type="submit" 
            disabled={isSaving}
            className={`w-full py-3 bg-[#00e5ff] text-[#030a16] font-bold rounded-xl flex items-center justify-center gap-2 mt-6 active:scale-95 transition-transform ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span> SAVING CHANGES...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
