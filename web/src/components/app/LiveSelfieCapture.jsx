import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { uploadUserFile } from '../../services/storageService';
import { updateUserProfile } from '../../services/userService';

export default function LiveSelfieCapture({ user, setUser, onMessage }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [capturedFile, setCapturedFile] = useState(null);
  const [capturedUrl, setCapturedUrl] = useState(user?.selfieUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const hasCameraApi = Boolean(navigator.mediaDevices?.getUserMedia);

  const stopCamera = () => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setCameraError('');
    setCapturedFile(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera capture is not supported in this browser.');
      }

      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      setCameraError(error.message || 'Camera permission was blocked. Please allow camera access and try again.');
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!capturedFile && user?.selfieUrl) {
      setCapturedUrl(user.selfieUrl);
    }
  }, [capturedFile, user?.selfieUrl]);

  const captureSelfie = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraError('Camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      setCameraError('Unable to capture selfie. Please try again.');
      return;
    }

    const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setCapturedFile(file);
    const localPreviewUrl = URL.createObjectURL(file);
    setCapturedUrl(localPreviewUrl);
    stopCamera();
    saveSelfie(file);
  };

  const retake = () => {
    if (capturedUrl && capturedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedFile(null);
    setCapturedUrl(user?.selfieUrl || '');
    startCamera();
  };

  useEffect(() => () => {
    if (capturedUrl && capturedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(capturedUrl);
    }
  }, [capturedUrl]);

  const saveSelfie = async (fileToSave = capturedFile) => {
    if (!fileToSave || !user?.uid) return;
    setIsSaving(true);
    setCameraError('');
    try {
      const upload = await uploadUserFile({
        userId: user.uid,
        file: fileToSave,
        pathPrefix: 'tutorSelfies',
        objectPath: `tutorSelfies/${user.uid}/${Date.now()}.jpg`,
      });
      const profile = await updateUserProfile(user.uid, {
        selfieUrl: upload.downloadUrl,
        selfieVerified: true,
        profilePhoto: upload.downloadUrl,
      });
      setCapturedUrl(upload.downloadUrl);
      setCapturedFile(null);
      setUser?.((prev) => ({ ...prev, ...profile }));
      onMessage?.('Selfie saved for tutor verification.');
    } catch (error) {
      setCameraError(error.message || 'Unable to save selfie right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950">
        {capturedUrl ? (
          <img src={capturedUrl} alt="Captured tutor selfie" className="aspect-video w-full object-cover" />
        ) : (
          <div className="relative aspect-video w-full">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 p-4 text-center text-sm text-zinc-100">
                <div className="space-y-2">
                  <p className="font-semibold">Camera preview unavailable</p>
                  <p className="text-xs text-zinc-300">
                    {hasCameraApi
                      ? 'Allow camera access, then retry the live selfie capture.'
                      : 'This browser does not support live camera capture.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {cameraError ? <p className="text-sm text-rose-600">{cameraError}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {capturedFile ? (
          <>
            <button type="button" onClick={saveSelfie} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              <Camera className="h-4 w-4" />
              {isSaving ? 'Saving selfie...' : 'Save selfie'}
            </button>
            <button type="button" onClick={retake} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
              <RefreshCw className="h-4 w-4" />
              Retake
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={captureSelfie}
              disabled={!hasCameraApi || Boolean(cameraError && !streamRef.current)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              Capture selfie
            </button>
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              <RefreshCw className="h-4 w-4" />
              Retry camera
            </button>
          </>
        )}
      </div>
    </div>
  );
}
