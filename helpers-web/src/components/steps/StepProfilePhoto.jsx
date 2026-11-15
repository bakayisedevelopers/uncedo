import { useRef, useState } from 'react';
import { Camera, CheckCircle2, Upload, UserCheck } from 'lucide-react';
import { deleteStorageObject, updateHelperBasics, uploadHelperFile } from '../../services/helperDataService';

export function StepProfilePhoto({ user, profile, onCompleteNext }) {
  const currentUrl = String(profile?.profilePhoto || profile?.selfieUrl || '').trim();
  const currentObjectPath = String(profile?.profilePhotoObjectPath || '').trim();

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const mime = String(file.type || '').toLowerCase();
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      setError('Upload a clear JPG, PNG, or WEBP photo showing your face.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image must be 8 MB or smaller.');
      return;
    }

    setUploading(true);
    setError('');
    setNotice('');
    try {
      const uploaded = await uploadHelperFile({
        uid: user.uid,
        file,
        pathPrefix: 'helper-profile-photos',
      });
      if (currentObjectPath && currentObjectPath !== uploaded.objectPath) {
        await deleteStorageObject(currentObjectPath).catch(() => null);
      }
      await updateHelperBasics(user.uid, {
        profilePhoto: uploaded.downloadUrl,
        selfieUrl: uploaded.downloadUrl,
        profilePhotoObjectPath: uploaded.objectPath,
        selfieCapturedAt: uploaded.uploadedAt,
        selfieCaptureSource: 'web',
      });
      setNotice('Profile photo saved.');
    } catch (err) {
      setError(err?.message || 'Could not upload your profile photo right now.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-well/60 border border-border p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-7">
        <div className="h-36 w-36 rounded-xl border border-border bg-surface overflow-hidden shrink-0 flex items-center justify-center shadow-sm">
          {currentUrl ? (
            <img
              src={currentUrl}
              alt="Helper profile headshot"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-ink-400">
              <UserCheck className="h-10 w-10" strokeWidth={1.4} />
              <span className="text-[11px] font-medium uppercase tracking-wider">No photo</span>
            </div>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-700">
            {currentUrl ? 'Headshot on file' : 'Required verification photo'}
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900">
            {currentUrl ? 'Profile selfie uploaded' : 'Take or upload a clear profile selfie'}
          </h2>
          <p className="text-sm text-ink-500 max-w-lg leading-relaxed">
            Customers see this photo in WhatsApp and booking confirmations before you arrive. Use natural lighting facing the camera with no sunglasses or filters.
          </p>

          <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-3">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileSelected}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-surface hover:bg-well text-sm font-semibold text-ink-900 disabled:opacity-50"
            >
              <Camera className="h-4 w-4 text-tealbrand-700" />
              {uploading ? 'Uploading…' : 'Take Selfie'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading…' : currentUrl ? 'Replace Photo' : 'Upload Image'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border border-t border-b border-border text-xs text-ink-500">
        <div className="py-4 sm:pr-5">
          <div className="font-semibold text-ink-900 mb-1">01 · Even lighting</div>
          Face a window or bright outdoor shade so facial features stay sharp and clear.
        </div>
        <div className="py-4 sm:px-5">
          <div className="font-semibold text-ink-900 mb-1">02 · Full face visible</div>
          Remove caps, masks, or tinted sunglasses before capturing your headshot.
        </div>
        <div className="py-4 sm:pl-5">
          <div className="font-semibold text-ink-900 mb-1">03 · Unedited photo</div>
          Upload a genuine personal portrait — never logos, group photos, or artwork.
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
        <button
          type="button"
          onClick={() => onCompleteNext?.()}
          disabled={!currentUrl || uploading}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue to Services
        </button>
      </div>
    </div>
  );
}
