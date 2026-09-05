import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  Camera,
  Upload,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  PlusCircle,
  ArrowRight,
  RefreshCw,
  X,
  Layers,
  HelpCircle,
  Sparkles,
  RotateCcw,
  Check,
  Calendar,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import type {
  PlasticScanResult,
  PlasticScanRecord,
  PlasticTypeOption,
  PlasticAction,
  JournalEntry,
} from '../types';
import {
  saveScanRecord,
  fetchScanRecords,
  deleteScanRecord,
  saveJournalEntry,
} from '../lib/firebase';

interface PlasticScannerSectionProps {
  user: User;
  onEntrySaved: (entry: JournalEntry) => void;
  onFindAlternative: (prompt: string) => void;
  onNavigateToJournal: () => void;
}

const COMMON_PLASTIC_OPTIONS: PlasticTypeOption[] = [
  'PET / PETE (#1)',
  'HDPE (#2)',
  'PVC (#3)',
  'LDPE (#4)',
  'PP (#5)',
  'PS (#6)',
  'Other / mixed plastic (#7)',
  'Not plastic / unable to determine',
];

const RESIN_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '#1': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  '#2': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  '#3': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  '#4': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  '#5': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  '#6': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  '#7': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

export const PlasticScannerSection: React.FC<PlasticScannerSectionProps> = ({
  user,
  onEntrySaved,
  onFindAlternative,
  onNavigateToJournal,
}) => {
  // Capture & Image state
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string>('image/jpeg');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PlasticScanResult | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual correction state
  const [correctedType, setCorrectedType] = useState<string>('');
  const [isSavedToHistory, setIsSavedToHistory] = useState<boolean>(false);

  // Journal addition modal state
  const [showJournalModal, setShowJournalModal] = useState<boolean>(false);
  const [journalAction, setJournalAction] = useState<PlasticAction>('used');
  const [journalQuantity, setJournalQuantity] = useState<number>(1);
  const [journalItemName, setJournalItemName] = useState<string>('');
  const [journalNote, setJournalNote] = useState<string>('');
  const [isSavingToJournal, setIsSavingToJournal] = useState<boolean>(false);

  // Scan history state
  const [scansHistory, setScansHistory] = useState<PlasticScanRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [selectedHistoricalScan, setSelectedHistoricalScan] = useState<PlasticScanRecord | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Fetch scan history on load
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      if (!user) return;
      setLoadingHistory(true);
      try {
        const records = await fetchScanRecords(user.uid);
        if (isMounted) {
          setScansHistory(records);
        }
      } catch (err: any) {
        console.error('Error fetching scan records:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Stop camera helper defined BEFORE any hooks that call it
  const stopCameraStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Start in-browser camera stream
  const startCamera = async (facingMode: 'environment' | 'user' = 'environment') => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback directly to native camera file input
        cameraInputRef.current?.click();
        return;
      }

      // Stop any existing stream
      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera stream error, triggering mobile capture fallback:', err);
      setCameraError(
        'Direct camera access was denied or unsupported. Using standard photo capture...'
      );
      stopCameraStream();
      cameraInputRef.current?.click();
    }
  };

  // Switch camera facing mode
  const toggleCameraFacing = () => {
    const nextMode = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextMode);
    startCamera(nextMode);
  };

  // Capture frame from video element
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    setSelectedImageBase64(dataUrl);
    setSelectedMimeType('image/jpeg');
    stopCameraStream();

    // Trigger analysis immediately
    analyzeImage(dataUrl, 'image/jpeg');
  };

  // Handle file selection (drag & drop or input)
  const processFile = (file: File) => {
    setErrorMessage(null);
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!validMimes.includes(file.type.toLowerCase())) {
      setErrorMessage('Unsupported file format. Please choose a JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size exceeds 10MB limit. Please select a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setSelectedImageBase64(result);
        setSelectedMimeType(file.type || 'image/jpeg');
        analyzeImage(result, file.type || 'image/jpeg');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Could not read image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  // Analyze Image with Gemini Vision
  const analyzeImage = async (base64Data: string, mimeType: string) => {
    setIsAnalyzing(true);
    setScanResult(null);
    setErrorMessage(null);
    setIsSavedToHistory(false);
    setCorrectedType('');

    try {
      const response = await fetch('/api/scans/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: mimeType,
          userId: user.uid,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze plastic image.');
      }

      setScanResult(data.result);
      setSavedImageUrl(data.imageUrl);
      setSavedImagePath(data.imagePath);

      // Pre-fill journal item name
      setJournalItemName(data.result.itemDescription || 'Scanned Plastic Item');

      // Scroll to result smoothly
      setTimeout(() => {
        const resultEl = document.getElementById('scan-result-card');
        if (resultEl) {
          resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (err: any) {
      console.error('Scan analysis failed:', err);
      setErrorMessage(
        err.message || 'Error connecting to Gemini Vision service. Please check your image and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save scan to user's private Firestore collection
  const handleSaveScan = async () => {
    if (!scanResult || !user) return;

    try {
      const newScanRecord: PlasticScanRecord = {
        id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user.uid,
        timestamp: Date.now(),
        imageUrl: savedImageUrl || undefined,
        imagePath: savedImagePath || undefined,
        detectedItem: scanResult.itemDescription,
        detectedPlasticType: correctedType || scanResult.detectedMaterial,
        resinCode: scanResult.resinCode,
        confidenceLevel: scanResult.confidenceLevel,
        explanation: scanResult.explanation,
        disposalGuidance: scanResult.disposalGuidance,
        recommendedAlternative: scanResult.recommendedAlternative,
        userCorrectedType: correctedType || undefined,
      };

      await saveScanRecord(user.uid, newScanRecord);
      setScansHistory((prev) => [newScanRecord, ...prev]);
      setIsSavedToHistory(true);
      setSuccessBanner('Scan result securely saved to your private scan records.');
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: any) {
      console.error('Error saving scan to Firestore:', err);
      setErrorMessage(`Failed to save scan record: ${err.message}`);
    }
  };

  // Delete an individual scan record and its associated image
  const handleDeleteScan = async (scanId: string, imagePath?: string) => {
    if (!user) return;
    try {
      // 1. Delete image file from server if it exists
      if (imagePath) {
        try {
          await fetch('/api/scans/image', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              imagePath: imagePath,
            }),
          });
        } catch (imgErr) {
          console.warn('Could not delete image file from server:', imgErr);
        }
      }

      // 2. Delete Firestore record
      await deleteScanRecord(user.uid, scanId);

      // 3. Update state
      setScansHistory((prev) => prev.filter((s) => s.id !== scanId));
      if (selectedHistoricalScan?.id === scanId) {
        setSelectedHistoricalScan(null);
      }
      setSuccessBanner('Scan record and image deleted.');
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err: any) {
      console.error('Error deleting scan:', err);
      setErrorMessage(`Could not delete scan: ${err.message}`);
    }
  };

  // Add identified item to Daily Journal
  const handleConfirmAddToJournal = async () => {
    if (!scanResult || !user) return;
    setIsSavingToJournal(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const plasticMaterial = correctedType || scanResult.detectedMaterial;

      const newEntry: JournalEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user.uid,
        date: today,
        timestamp: Date.now(),
        text: `Scanned item: ${journalItemName} (${plasticMaterial}). Action: ${journalAction}.${
          journalNote ? ` Note: ${journalNote}` : ''
        }`,
        reflection: `Added via Plastic Scanner. Material verified as ${plasticMaterial}.`,
        encouragement:
          journalAction === 'avoided' || journalAction === 'replaced'
            ? 'Great job actively avoiding single-use plastic! Every avoided item counts toward your milestones.'
            : 'Logging your plastic usage builds mindful awareness for future swaps.',
        items: [
          {
            id: `item_${Date.now()}`,
            name: journalItemName,
            category: scanResult.resinCode ? `Plastic (${scanResult.resinCode})` : 'Plastic Packaging',
            action: journalAction,
            quantity: Math.max(1, journalQuantity),
            estimatedImpactNote: `Material: ${plasticMaterial}. ${scanResult.disposalGuidance}`,
            plasticType: plasticMaterial,
            resinCode: scanResult.resinCode,
            imageUrl: savedImageUrl || undefined,
            alternative: {
              title: scanResult.recommendedAlternative,
              whyBetter: 'Lower footprint, durable, and reduces recurring plastic waste.',
              costLevel: 'Budget (<$10)',
              convenienceScore: 'Easy',
            },
          },
        ],
        source: 'scanner',
        quickAddMetadata: {
          categoryKey: scanResult.resinCode ? `Plastic (${scanResult.resinCode})` : 'Plastic Packaging',
          plasticType: plasticMaterial,
          resinCode: scanResult.resinCode,
          note: journalNote || undefined,
          imageUrl: savedImageUrl || undefined,
          imagePath: savedImagePath || undefined,
          contributedToImpact: journalAction === 'avoided' || journalAction === 'replaced' || journalAction === 'reused',
        },
      };

      await saveJournalEntry(user.uid, newEntry);
      onEntrySaved(newEntry);
      setShowJournalModal(false);
      setSuccessBanner(
        journalAction === 'avoided' || journalAction === 'replaced'
          ? 'Item added to journal and updated on your Impact Wall!'
          : 'Item added to your Daily Journal.'
      );
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: any) {
      console.error('Error saving item to journal:', err);
      setErrorMessage(`Failed to add item to journal: ${err.message}`);
    } finally {
      setIsSavingToJournal(false);
    }
  };

  // Launch Gemini Coach conversation about alternatives
  const handleAskGeminiAlternatives = () => {
    if (!scanResult) return;
    const material = correctedType || scanResult.detectedMaterial;
    const prompt = `I scanned a plastic item: "${scanResult.itemDescription}" identified as ${material} (${scanResult.resinCode || 'resin code unknown'}). What are the most practical, affordable, and durable alternatives for this specific item, and how can I easily make the swap in my daily routine?`;
    onFindAlternative(prompt);
  };

  // Reset scan state
  const handleResetScan = () => {
    setSelectedImageBase64(null);
    setScanResult(null);
    setSavedImageUrl(null);
    setSavedImagePath(null);
    setErrorMessage(null);
    setIsSavedToHistory(false);
    setCorrectedType('');
    stopCameraStream();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#1e3a31] text-white p-6 rounded-xl shadow-xs border border-[#2d5a4c]/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#a8c69f]">
                AI Multimodal Vision
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <ScanLine className="w-6 h-6 text-[#a8c69f]" />
              <span>Plastic Scanner</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Snap or upload a photo of any plastic container, bottle, or packaging. Gemini Vision detects
              resin codes (#1–#7), inspects visual cues, provides conditional recycling guidance, and recommends practical swaps.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#2d5a4c] px-3.5 py-2 rounded-lg border border-[#3d7362] text-xs text-[#a8c69f] font-semibold shrink-0">
            <Sparkles className="w-4 h-4 text-[#a8c69f]" />
            <span>Gemini Vision Assisted</span>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-800 ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Primary Scanner Capture Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#1e3a31] flex items-center justify-center border border-slate-200">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Capture or Upload Product Photo</h2>
              <p className="text-xs text-slate-500">
                Ensure good lighting and focus on embossed resin recycling triangles (#1–#7) if visible.
              </p>
            </div>
          </div>
          {selectedImageBase64 && (
            <button
              type="button"
              onClick={handleResetScan}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Scan</span>
            </button>
          )}
        </div>

        {/* Live Camera Viewfinder Overlay */}
        {isCameraActive ? (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 max-w-xl mx-auto border border-slate-300 shadow-sm flex flex-col items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder Target Guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-56 border-2 border-white/70 rounded-2xl relative shadow-sm">
                <div className="absolute top-2 left-2 text-[10px] uppercase font-bold text-white/90 bg-black/40 px-2 py-0.5 rounded">
                  Align Plastic / Symbol
                </div>
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-[#a8c69f]" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-[#a8c69f]" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-[#a8c69f]" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-[#a8c69f]" />
              </div>
            </div>

            {/* Camera Control Bar */}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-4 px-4">
              <button
                type="button"
                onClick={toggleCameraFacing}
                title="Switch Camera"
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 flex items-center justify-center border border-white/30 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                id="btn-capture-shutter"
                type="button"
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-white text-[#1e3a31] hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg transition-transform border-4 border-[#2d5a4c]"
              >
                <div className="w-11 h-11 rounded-full bg-[#1e3a31] text-[#a8c69f] flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
              </button>

              <button
                type="button"
                onClick={stopCameraStream}
                title="Cancel Camera"
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 flex items-center justify-center border border-white/30 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Upload & Camera Trigger Panel */
          <div>
            {!selectedImageBase64 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all ${
                  dragActive
                    ? 'border-[#2d5a4c] bg-[#f4f7f5]'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-[#2d5a4c] mx-auto flex items-center justify-center shadow-xs mb-4">
                  <ScanLine className="w-7 h-7" />
                </div>

                <h3 className="text-sm font-bold text-slate-800">
                  Ready to scan a plastic item
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Take a photo using your phone/webcam or drag &amp; drop a clear image (JPG, PNG, or WEBP up to 10MB).
                </p>

                {cameraError && (
                  <p className="text-[11px] text-amber-700 font-medium mt-2 bg-amber-50 py-1 px-2 rounded max-w-md mx-auto border border-amber-200">
                    {cameraError}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                  {/* Take Photo Button */}
                  <button
                    id="btn-take-photo"
                    type="button"
                    onClick={() => startCamera(cameraFacing)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a31] hover:bg-[#2d5a4c] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors"
                  >
                    <Camera className="w-4 h-4 text-[#a8c69f]" />
                    <span>Take Photo</span>
                  </button>

                  {/* Upload Photo Button */}
                  <button
                    id="btn-upload-photo"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-slate-300 shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>Upload Image</span>
                  </button>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processFile(e.target.files[0]);
                    }
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processFile(e.target.files[0]);
                    }
                  }}
                />
              </div>
            ) : (
              /* Selected Image Preview */
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="relative w-44 h-44 rounded-lg overflow-hidden border border-slate-300 shadow-xs bg-slate-900 shrink-0">
                  <img
                    src={selectedImageBase64}
                    alt="Captured Plastic Item"
                    className="w-full h-full object-cover"
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-[#1e3a31]/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-[#a8c69f] mb-2" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center text-slate-200">
                        Analyzing Vision...
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                      Photo Captured
                    </span>
                    {scanResult?.resinCode && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1e3a31] text-[#a8c69f]">
                        {scanResult.resinCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {isAnalyzing
                      ? 'Gemini Multimodal Vision is reading visual characteristics, shape curvature, opacity, and resin code markings...'
                      : scanResult
                      ? `Analysis complete for ${scanResult.itemDescription}. Review details below.`
                      : 'Image ready. Click re-analyze if necessary.'}
                  </p>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleResetScan();
                        startCamera(cameraFacing);
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      <span>Retake Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>Choose Different Photo</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analysis Loading State Indicator */}
      {isAnalyzing && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#f4f7f5] text-[#2d5a4c] mx-auto flex items-center justify-center border border-[#2d5a4c]/20 mb-3 shadow-xs">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            Analyzing Plastic Characteristics &amp; Symbols
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Gemini is identifying resin classifications (#1–#7), evaluating confidence, checking for recycling symbols, and formulating disposal guidelines.
          </p>
        </div>
      )}

      {/* Analysis Result Visual Card */}
      {scanResult && !isAnalyzing && (
        <div
          id="scan-result-card"
          className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
        >
          {/* Result Card Header */}
          <div className="bg-[#1e3a31] text-white p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#2d5a4c] border border-[#3d7362] text-[#a8c69f] flex items-center justify-center text-lg font-bold shrink-0">
                  {scanResult.resinCode && scanResult.resinCode !== 'unknown' && scanResult.resinCode !== 'none' ? (
                    <span>{scanResult.resinCode}</span>
                  ) : (
                    <HelpCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#a8c69f]">
                      Detected Material
                    </span>
                    {scanResult.visibleSymbolFound && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Symbol Found
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                    {correctedType || scanResult.detectedMaterial}
                  </h3>
                </div>
              </div>

              {/* Confidence Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-medium">Confidence:</span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    scanResult.confidenceLevel === 'High'
                      ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500/50'
                      : scanResult.confidenceLevel === 'Moderate'
                      ? 'bg-blue-900/60 text-blue-200 border-blue-500/50'
                      : 'bg-amber-900/60 text-amber-200 border-amber-500/50'
                  }`}
                >
                  {scanResult.confidenceLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Result Card Body */}
          <div className="p-5 sm:p-6 space-y-5">
            {/* Warning if plastic type cannot be confidently identified */}
            {scanResult.confidenceLevel === 'Unable to confidently identify' && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">
                    Unable to confidently identify the plastic type.
                  </span>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    Visual appearance alone is not sufficient to distinguish this resin with certainty. Please check the bottom or rim of the product physically for an embossed triangular recycling symbol (#1 through #7), or use the manual correction selector below.
                  </p>
                </div>
              </div>
            )}

            {/* Grid Breakdown: Item, Resin, Clues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Item Description & Clues */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    What The Item Appears To Be
                  </span>
                  {scanResult.resinCode && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        RESIN_BADGE_COLORS[scanResult.resinCode]?.bg || 'bg-slate-100'
                      } ${RESIN_BADGE_COLORS[scanResult.resinCode]?.text || 'text-slate-700'} ${
                        RESIN_BADGE_COLORS[scanResult.resinCode]?.border || 'border-slate-200'
                      }`}
                    >
                      Resin Code: {scanResult.resinCode}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {scanResult.itemDescription}
                </p>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Visual Clues &amp; Observation
                  </span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {scanResult.explanation}
                  </p>
                </div>

                {scanResult.requiresSeparation && (
                  <div className="pt-2 text-[11px] text-amber-700 font-semibold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Multiple materials detected: separate cap, pump, or film before disposal.</span>
                  </div>
                )}
              </div>

              {/* Disposal & Recyclability Guidance */}
              <div className="p-4 rounded-xl bg-[#f4f7f5] border border-[#2d5a4c]/20 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c] block">
                  Disposal &amp; Recyclability Guidance
                </span>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {scanResult.disposalGuidance}
                </p>
                <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60">
                  * Note: Municipal recycling availability depends on local infrastructure. Always verify with your local waste management guidelines.
                </p>
              </div>
            </div>

            {/* Recommended Alternative Section */}
            <div className="p-4 sm:p-5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#2d5a4c]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c]">
                    Recommended Low-Plastic Alternative
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-800">
                  {scanResult.recommendedAlternative}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAskGeminiAlternatives}
                className="flex items-center gap-1.5 text-xs font-bold text-white px-3.5 py-2 rounded-lg bg-[#2d5a4c] hover:bg-[#1e3a31] transition-colors shrink-0 shadow-xs"
              >
                <span>Find Better Alternative</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#a8c69f]" />
              </button>
            </div>

            {/* Manual Correction Selector */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Incorrect identification?</span>
                <span className="text-xs text-slate-500">Manually select resin type:</span>
              </div>
              <select
                id="select-correct-plastic-type"
                value={correctedType || scanResult.detectedMaterial}
                onChange={(e) => setCorrectedType(e.target.value)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#2d5a4c]"
              >
                <option value={scanResult.detectedMaterial}>
                  Detected: {scanResult.detectedMaterial}
                </option>
                {COMMON_PLASTIC_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Action Buttons */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Add to Journal Button */}
                <button
                  id="btn-add-scan-to-journal"
                  type="button"
                  onClick={() => setShowJournalModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2d5a4c] hover:bg-[#1e3a31] text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
                >
                  <BookOpen className="w-4 h-4 text-[#a8c69f]" />
                  <span>Add to Journal</span>
                </button>

                {/* Find Better Alternative Button */}
                <button
                  id="btn-find-better-alternative"
                  type="button"
                  onClick={handleAskGeminiAlternatives}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
                >
                  <MessageSquare className="w-4 h-4 text-[#2d5a4c]" />
                  <span>Find Alternative</span>
                </button>
              </div>

              {/* Save Scan Button */}
              <button
                id="btn-save-scan-record"
                type="button"
                disabled={isSavedToHistory}
                onClick={handleSaveScan}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-xs ${
                  isSavedToHistory
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                }`}
              >
                {isSavedToHistory ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Scan Saved</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4 text-[#2d5a4c]" />
                    <span>Save Scan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Journal Modal */}
      {showJournalModal && scanResult && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#2d5a4c]" />
                <h3 className="text-sm font-bold text-slate-800">Add Scanned Item to Journal</h3>
              </div>
              <button
                onClick={() => setShowJournalModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Item Description</label>
                <input
                  type="text"
                  value={journalItemName}
                  onChange={(e) => setJournalItemName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#2d5a4c]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  How did you interact with this plastic?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'used', label: 'Used the item' },
                    { val: 'purchased', label: 'Purchased the item' },
                    { val: 'avoided', label: 'Avoided the item' },
                    { val: 'reused', label: 'Reused the item' },
                    { val: 'replaced', label: 'Replaced with alternative' },
                  ].map((act) => (
                    <button
                      key={act.val}
                      type="button"
                      onClick={() => setJournalAction(act.val as PlasticAction)}
                      className={`p-2 rounded-lg border text-left font-semibold text-xs transition-colors ${
                        journalAction === act.val
                          ? 'bg-[#1e3a31] text-white border-[#1e3a31]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
                {(journalAction === 'avoided' || journalAction === 'replaced') && (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1.5 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                    This action will contribute directly to your <strong>Impact Wall</strong> avoided items!
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={journalQuantity}
                    onChange={(e) => setJournalQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#2d5a4c]"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Detected Resin</label>
                  <input
                    type="text"
                    readOnly
                    value={correctedType || scanResult.detectedMaterial}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Optional Personal Note</label>
                <input
                  type="text"
                  placeholder="e.g. Brought my own reusable container from home"
                  value={journalNote}
                  onChange={(e) => setJournalNote(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#2d5a4c]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowJournalModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 border border-slate-200"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-save-to-journal"
                type="button"
                disabled={isSavingToJournal}
                onClick={handleConfirmAddToJournal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#2d5a4c] hover:bg-[#1e3a31] transition-colors"
              >
                {isSavingToJournal ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save to Journal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historical Scans Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#1e3a31] flex items-center justify-center border border-slate-200">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Scan History ({scansHistory.length})
              </h2>
              <p className="text-xs text-slate-500">
                Previously scanned items and resin records saved to your account.
              </p>
            </div>
          </div>
        </div>

        {loadingHistory ? (
          <div className="py-8 text-center text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#2d5a4c]" />
            <span>Loading your scan history...</span>
          </div>
        ) : scansHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <ScanLine className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-slate-600">No saved scans yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Take a photo or upload an image above, then click &quot;Save Scan&quot; to keep a record here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scansHistory.map((scan) => (
              <div
                key={scan.id}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-start gap-3">
                  {scan.imageUrl ? (
                    <img
                      src={scan.imageUrl}
                      alt={scan.detectedItem}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-slate-900 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <ScanLine className="w-6 h-6 text-slate-300" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {scan.resinCode && scan.resinCode !== 'unknown' && scan.resinCode !== 'none' && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            RESIN_BADGE_COLORS[scan.resinCode]?.bg || 'bg-slate-100'
                          } ${RESIN_BADGE_COLORS[scan.resinCode]?.text || 'text-slate-700'} ${
                            RESIN_BADGE_COLORS[scan.resinCode]?.border || 'border-slate-200'
                          }`}
                        >
                          {scan.resinCode}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(scan.timestamp).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-800 truncate">
                      {scan.detectedItem}
                    </h4>
                    <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                      {scan.userCorrectedType || scan.detectedPlasticType}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-slate-500 font-medium">
                    Confidence: <strong>{scan.confidenceLevel}</strong>
                  </span>
                  <button
                    type="button"
                    title="Delete scan and image"
                    onClick={() => handleDeleteScan(scan.id, scan.imagePath)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
