import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { JournalEntry, PlasticAction, PlasticItem, PlasticScanResult } from '../types';
import { saveJournalEntry } from '../lib/firebase';
import {
  X,
  Zap,
  Camera,
  Upload,
  Check,
  Sparkles,
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Trophy,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface QuickAddModalProps {
  isOpen?: boolean;
  onClose: () => void;
  user: User;
  onEntrySaved: (entry: JournalEntry) => void;
  onShowNotification?: (notification: { type: 'success' | 'error'; message: string }) => void;
}

interface ItemOption {
  id: string;
  name: string;
  category: string;
  icon: string;
}

const DEFAULT_OPTIONS: ItemOption[] = [
  { id: 'bag', name: 'Plastic Bag', category: 'Bags & Carriers', icon: '🛍️' },
  { id: 'bottle', name: 'Plastic Bottle', category: 'Beverage Containers', icon: '🥤' },
  { id: 'container', name: 'Food Container', category: 'Food Packaging', icon: '🍱' },
  { id: 'cup', name: 'Disposable Cup', category: 'Beverage Cups', icon: '☕' },
  { id: 'packaging', name: 'Plastic Packaging', category: 'Wraps & Films', icon: '🧴' },
  { id: 'delivery', name: 'Delivery Packaging', category: 'Shipping & Delivery', icon: '📦' },
  { id: 'other', name: 'Other', category: 'General Plastic', icon: '✨' },
];

const ACTION_OPTIONS: Array<{
  action: PlasticAction;
  label: string;
  description: string;
  isImpact: boolean;
  colorClass: string;
}> = [
  {
    action: 'avoided',
    label: 'Avoided',
    description: 'Bypassed or turned down single-use plastic',
    isImpact: true,
    colorClass: 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600',
  },
  {
    action: 'reused',
    label: 'Reused',
    description: 'Reused an existing item instead of discarding',
    isImpact: true,
    colorClass: 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600',
  },
  {
    action: 'replaced',
    label: 'Replaced with Alternative',
    description: 'Used reusable or eco-friendly alternative',
    isImpact: true,
    colorClass: 'border-[#2d5a4c] bg-[#f4f7f5] text-[#1e3a31] ring-1 ring-[#2d5a4c]',
  },
  {
    action: 'used',
    label: 'Used',
    description: 'Used a single-use plastic item today',
    isImpact: false,
    colorClass: 'border-slate-300 bg-slate-50 text-slate-800',
  },
  {
    action: 'purchased',
    label: 'Purchased',
    description: 'Bought a product packaged in plastic',
    isImpact: false,
    colorClass: 'border-slate-300 bg-slate-50 text-slate-800',
  },
  {
    action: 'disposed',
    label: 'Disposed',
    description: 'Recycled or binned a plastic item',
    isImpact: false,
    colorClass: 'border-slate-300 bg-slate-50 text-slate-800',
  },
];

const RECENT_KEY = 'quick_add_recent_categories';

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen = true,
  onClose,
  user,
  onEntrySaved,
  onShowNotification,
}) => {
  // Item state
  const [selectedItemId, setSelectedItemId] = useState<string>('bottle');
  const [customItemName, setCustomItemName] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [action, setAction] = useState<PlasticAction>('avoided');
  const [note, setNote] = useState<string>('');
  const [recentCategories, setRecentCategories] = useState<string[]>([]);

  // Photo & Vision state
  const [showPhotoOptions, setShowPhotoOptions] = useState<boolean>(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState<boolean>(false);
  const [visionResult, setVisionResult] = useState<PlasticScanResult | null>(null);
  const [resinCode, setResinCode] = useState<string>('');
  const [plasticType, setPlasticType] = useState<string>('');

  // Camera capture modal state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stop camera helper defined BEFORE any hooks that call it
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Load recently used categories from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentCategories(parsed);
          setSelectedItemId(parsed[0]);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Cleanup camera stream when closing modal or unmounting
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const startCamera = async () => {
    try {
      setErrorMsg(null);
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setIsCameraActive(false);
      setErrorMsg('Camera could not be accessed. You can upload a photo instead.');
    }
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPhotoBase64(dataUrl);
    setPhotoMimeType('image/jpeg');
    stopCamera();
    analyzeAttachedPhoto(dataUrl, 'image/jpeg');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setErrorMsg('Please select a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setPhotoBase64(result);
        setPhotoMimeType(file.type || 'image/jpeg');
        analyzeAttachedPhoto(result, file.type || 'image/jpeg');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  // Analyze attached photo with Gemini Vision
  const analyzeAttachedPhoto = async (base64: string, mime: string) => {
    setIsAnalyzingPhoto(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/scans/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: mime,
          userId: user.uid,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze photo.');
      }

      setVisionResult(data.result);
      setSavedImageUrl(data.imageUrl);
      setSavedImagePath(data.imagePath);

      if (data.result.resinCode) {
        setResinCode(data.result.resinCode);
      }
      if (data.result.detectedMaterial) {
        setPlasticType(data.result.detectedMaterial);
      }

      // If detection aligns with a known category, pre-select it
      const itemDesc = (data.result.itemDescription || '').toLowerCase();
      if (itemDesc.includes('bottle') || itemDesc.includes('flask')) {
        setSelectedItemId('bottle');
      } else if (itemDesc.includes('bag') || itemDesc.includes('sack')) {
        setSelectedItemId('bag');
      } else if (itemDesc.includes('cup') || itemDesc.includes('mug')) {
        setSelectedItemId('cup');
      } else if (itemDesc.includes('container') || itemDesc.includes('box') || itemDesc.includes('tray')) {
        setSelectedItemId('container');
      } else if (itemDesc.includes('delivery') || itemDesc.includes('bubble') || itemDesc.includes('mailer')) {
        setSelectedItemId('delivery');
      } else if (itemDesc.includes('wrap') || itemDesc.includes('packaging')) {
        setSelectedItemId('packaging');
      }
    } catch (err: any) {
      console.warn('Vision analysis warning:', err);
      // Even if vision fails, user can still submit the quick add with the photo
      setErrorMsg(`Photo attached. Vision note: ${err.message || 'Auto-detection unavailable'}.`);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  const removePhoto = () => {
    setPhotoBase64(null);
    setSavedImageUrl(null);
    setSavedImagePath(null);
    setVisionResult(null);
    setResinCode('');
    setPlasticType('');
    setShowPhotoOptions(false);
  };

  // Get active item details
  const activeOption = DEFAULT_OPTIONS.find((o) => o.id === selectedItemId) || DEFAULT_OPTIONS[0];
  const finalItemName = selectedItemId === 'other' ? customItemName.trim() || 'Custom Plastic Item' : activeOption.name;
  const finalCategory = selectedItemId === 'other' ? 'Other Single-Use Plastic' : activeOption.category;

  const qualifiesForImpact = action === 'avoided' || action === 'reused' || action === 'replaced';

  // Submit Quick Add Entry
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (selectedItemId === 'other' && !customItemName.trim()) {
      setErrorMsg('Please enter a name for the custom plastic item.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const entryId = `entry_quick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const safeQuantity = Math.max(1, quantity);

      // Save to recent categories in localStorage
      try {
        const updatedRecent = [selectedItemId, ...recentCategories.filter((c) => c !== selectedItemId)].slice(0, 4);
        setRecentCategories(updatedRecent);
        localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecent));
      } catch {
        // Ignore
      }

      // Build structured plastic item
      const plasticItem: PlasticItem = {
        id: `item_${Date.now()}`,
        name: finalItemName,
        category: finalCategory,
        action: action,
        quantity: safeQuantity,
        estimatedImpactNote: note.trim()
          ? note.trim()
          : qualifiesForImpact
          ? `Prevented ${safeQuantity} ${finalItemName.toLowerCase()} from entering waste stream.`
          : `Recorded ${safeQuantity} ${finalItemName.toLowerCase()}.`,
        plasticType: plasticType || (resinCode ? `Resin ${resinCode}` : undefined),
        resinCode: resinCode || undefined,
        imageUrl: savedImageUrl || undefined,
        alternative: visionResult?.recommendedAlternative
          ? {
              title: visionResult.recommendedAlternative,
              whyBetter: 'Reusable, low-footprint replacement.',
              costLevel: 'Budget',
              convenienceScore: 'Easy',
            }
          : undefined,
      };

      // Construct Quick Add Journal Entry
      const newEntry: JournalEntry = {
        id: entryId,
        userId: user.uid,
        date: today,
        timestamp: Date.now(),
        text: `[Quick Add] ${safeQuantity}x ${finalItemName} (${action}).${note.trim() ? ` Note: "${note.trim()}"` : ''}`,
        reflection: qualifiesForImpact
          ? `Logged ${safeQuantity} ${finalItemName} as ${action}. Conscious avoidance directly impacts your cumulative reduction targets!`
          : `Logged ${safeQuantity} ${finalItemName} as ${action}. Tracking usage maintains daily awareness of plastic touchpoints.`,
        encouragement: qualifiesForImpact
          ? 'Every single-use item bypassed counts toward your milestones!'
          : 'Awareness is the first step toward lasting plastic reduction.',
        items: [plasticItem],
        source: 'quick_add',
        quickAddMetadata: {
          categoryKey: selectedItemId,
          plasticType: plasticType || undefined,
          resinCode: resinCode || undefined,
          note: note.trim() || undefined,
          imageUrl: savedImageUrl || undefined,
          imagePath: savedImagePath || undefined,
          contributedToImpact: qualifiesForImpact,
        },
      };

      // Persist to user-isolated Firestore
      await saveJournalEntry(user.uid, newEntry);

      // Notify parent app state
      onEntrySaved(newEntry);

      // Show designated positive confirmation
      if (qualifiesForImpact) {
        onShowNotification({
          type: 'success',
          message: `Nice! ${safeQuantity} ${finalItemName.toLowerCase()} added to your avoided-plastic impact.`,
        });
      } else {
        onShowNotification({
          type: 'success',
          message: `Added: ${safeQuantity} ${finalItemName.toLowerCase()} (${action}).`,
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Quick Add failed:', err);
      setErrorMsg(`Failed to save entry: ${err.message || 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      id="quick-add-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="quick-add-modal-container"
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        {/* Header */}
        <div className="bg-[#1e3a31] text-white px-5 py-4 flex items-center justify-between border-b border-[#2d5a4c] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2d5a4c] text-[#a8c69f] flex items-center justify-center border border-[#3e7262] shadow-xs">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span>Quick Add Plastic</span>
                <span className="text-[10px] bg-[#2d5a4c] text-[#a8c69f] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  Fast Log
                </span>
              </h2>
              <p className="text-slate-300 text-[11px] leading-tight">
                Record your plastic in seconds without writing a full entry
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-quick-add"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-[#2d5a4c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* 1. Item Selection (Large buttons/cards) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. Select Item
              </label>
              {recentCategories.length > 0 && (
                <span className="text-[10px] text-slate-500 font-semibold">
                  Saved recently used
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEFAULT_OPTIONS.map((item) => {
                const isSelected = selectedItemId === item.id;
                const isRecent = recentCategories[0] === item.id;

                return (
                  <button
                    key={item.id}
                    id={`quick-add-item-${item.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setErrorMsg(null);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                      isSelected
                        ? 'border-[#2d5a4c] bg-[#f4f7f5] shadow-xs ring-1 ring-[#2d5a4c]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl sm:text-2xl">{item.icon}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[#2d5a4c] text-white flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {isRecent && !isSelected ? 'Recent' : item.category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom item name if "Other" is chosen */}
            {selectedItemId === 'other' && (
              <div className="mt-2.5 animate-in fade-in duration-150">
                <input
                  type="text"
                  id="input-custom-item-name"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="E.g., Plastic cutlery, Straw, Bubble wrap..."
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] text-slate-800 font-medium"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* 2. Quantity Selector */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
              2. Quantity
            </label>
            <div className="flex items-center gap-3">
              {/* Stepper */}
              <div className="flex items-center border border-slate-200 bg-slate-50 rounded-xl overflow-hidden shadow-2xs">
                <button
                  type="button"
                  id="btn-qty-minus"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-12 text-center text-sm font-bold text-slate-800">
                  {quantity}
                </span>
                <button
                  type="button"
                  id="btn-qty-plus"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 text-slate-700 transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuantity(n)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                      quantity === n
                        ? 'bg-[#1e3a31] text-[#a8c69f] border-[#1e3a31] shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. What happened to the item? (Action) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                3. What happened to this plastic?
              </label>
              {qualifiesForImpact && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-emerald-700" />
                  <span>Impact Wall Milestone</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACTION_OPTIONS.map((opt) => {
                const isSelected = action === opt.action;

                return (
                  <button
                    key={opt.action}
                    id={`quick-add-action-${opt.action}`}
                    type="button"
                    onClick={() => setAction(opt.action)}
                    className={`p-2.5 rounded-xl border text-left flex items-start justify-between transition-all ${
                      isSelected
                        ? opt.colorClass
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold capitalize">{opt.label}</span>
                        {opt.isImpact && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            +Impact
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                        {opt.description}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-current shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Optional Note Field */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
              4. Short Note <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              id="input-quick-add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Bought this because I forgot my reusable bottle."
              maxLength={200}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] text-slate-800"
            />
          </div>

          {/* 5. Optional Photo & Plastic Scanner (Gemini Vision) */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#2d5a4c]" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Attach Photo &amp; Identify Plastic
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Optional</span>
            </div>

            {/* Photo preview if captured/uploaded */}
            {photoBase64 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
                  <img
                    src={photoBase64}
                    alt="Attached plastic"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {visionResult ? visionResult.itemDescription : 'Photo Attached'}
                      </span>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="text-slate-400 hover:text-red-600 p-1"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isAnalyzingPhoto ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#2d5a4c] font-semibold mt-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Gemini Vision identifying plastic type...</span>
                      </div>
                    ) : visionResult ? (
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {visionResult.resinCode && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#1e3a31] text-[#a8c69f] rounded font-bold">
                              Resin {visionResult.resinCode}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold border border-slate-200">
                            {visionResult.confidenceLevel} Confidence
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate">
                          {plasticType || visionResult.detectedMaterial}
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => photoBase64 && analyzeAttachedPhoto(photoBase64, photoMimeType)}
                        className="mt-1 text-[11px] text-[#2d5a4c] font-bold hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Identify with Gemini Vision</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Optional Resin Code Selector / Confirmation */}
                {visionResult && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-semibold text-[11px]">Resin Code:</span>
                    <select
                      id="quick-add-resin-selector"
                      value={resinCode}
                      onChange={(e) => setResinCode(e.target.value)}
                      className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-semibold"
                    >
                      <option value="">Unknown / None</option>
                      <option value="#1">#1 PET (Bottles &amp; jars)</option>
                      <option value="#2">#2 HDPE (Milk jugs &amp; tubs)</option>
                      <option value="#3">#3 PVC (Pipes &amp; packaging)</option>
                      <option value="#4">#4 LDPE (Bags &amp; wraps)</option>
                      <option value="#5">#5 PP (Straws &amp; tubs)</option>
                      <option value="#6">#6 PS (Styrofoam &amp; cutlery)</option>
                      <option value="#7">#7 Other (Mixed resins)</option>
                    </select>
                  </div>
                )}
              </div>
            ) : isCameraActive ? (
              /* Live Camera Viewfinder inside modal */
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-52">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-4 border border-dashed border-white/60 rounded-lg pointer-events-none" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="btn-quick-add-snap"
                    onClick={captureCameraFrame}
                    className="flex-1 text-xs px-4 py-2 bg-[#2d5a4c] hover:bg-[#1e3a31] text-white rounded-lg font-bold uppercase tracking-wider shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#a8c69f]" />
                    <span>Snap &amp; Identify</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Camera / Upload buttons */
              <div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-quick-add-camera"
                    onClick={startCamera}
                    className="flex-1 py-2 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#2d5a4c]" />
                    <span>Take Photo</span>
                  </button>

                  <button
                    type="button"
                    id="btn-quick-add-upload"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#2d5a4c]" />
                    <span>Upload Image</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Footer Submit Button */}
          <div className="pt-2 border-t border-slate-100">
            <button
              id="btn-submit-quick-add"
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs shadow-xs transition-all flex items-center justify-center gap-2 ${
                qualifiesForImpact
                  ? 'bg-[#1e3a31] hover:bg-[#2d5a4c] text-white'
                  : 'bg-[#2d5a4c] hover:bg-[#1e3a31] text-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#a8c69f]" />
                  <span>Saving Quick Log...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-[#a8c69f] fill-current" />
                  <span>
                    Save Log ({quantity}x {finalItemName})
                  </span>
                  {qualifiesForImpact && (
                    <span className="text-[10px] bg-[#a8c69f] text-[#1e3a31] px-1.5 py-0.5 rounded font-bold lowercase">
                      +impact
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
