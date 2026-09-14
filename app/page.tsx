'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, CheckSquare, MapPin, Home, 
  Plus, Trash2, Camera, X, RefreshCw, ChevronLeft, Calendar, Clock, Image as ImageIcon, ExternalLink, Maximize2, ListChecks, Edit3, Heart, ChevronRight as ChevronRightIcon, Sparkles, Save, Settings
} from 'lucide-react';

// 💡 현시점 고정 버전 (특별한 지정이 없을 시 1.0.1, 1.0.2 순으로 자동 업데이트)
const APP_VERSION = 'v1.0.1';

interface PlaceCard {
  id: string;
  order: number;
  ampm: string;
  hour: string;
  minute: string;
  name: string;
  address: string;
  mapUrl?: string;
  imageUrl?: string;
  tip: string;
}

interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  type: string;
  places: PlaceCard[];
  review?: string;
  memoriesImages?: string[];
}

interface ChecklistItem {
  id: number;
  tripId?: string;
  category: string;
  title: string;
  completed: boolean;
  imageUrl?: string;
}

const HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-15': '설날 연휴',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-03': '지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};

const compressFileBeforeUpload = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.6);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};

export default function WTAApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'home' | 'itinerary' | 'checklist' | 'past'>('home');
  
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [currentCalDate, setCurrentCalDate] = useState(new Date());
  const [selectedCalTrip, setSelectedCalTrip] = useState<{ trip: Trip; dateStr: string } | null>(null);

  const [wifePhoto, setWifePhoto] = useState<string>('/wife.jpg');
  const [loginBgPhoto, setLoginBgPhoto] = useState<string>('/login-bg.jpg');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWife = localStorage.getItem('wta_wife_photo');
      if (savedWife) setWifePhoto(savedWife);

      const savedBg = localStorage.getItem('wta_login_bg');
      if (savedBg) setLoginBgPhoto(savedBg);
    }
  }, []);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [memoryTrips, setMemoryTrips] = useState<Trip[]>([]);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedChecklistTripId, setSelectedChecklistTripId] = useState<string | null>(null);
  const [selectedMemoryTripId, setSelectedMemoryTripId] = useState<string | null>(null);

  const [newTripTitle, setNewTripTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTripType, setNewTripType] = useState('🏕️ 캠핑');

  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('음식/식재료');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingMessage, setAnalyzingMessage] = useState('☁️ 클라우드 업로드 및 캡처 인식 중...');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  const [memoryImgIdx, setMemoryImgIdx] = useState<number>(0);
  const fileInputRefChecklist = useRef<HTMLInputElement>(null);
  const fileInputRefPlaceCard = useRef<HTMLInputElement>(null);
  const fileInputRefMemory = useRef<HTMLInputElement>(null);
  const fileInputRefWife = useRef<HTMLInputElement>(null);
  const fileInputRefLoginBg = useRef<HTMLInputElement>(null);
  const [targetCardId, setTargetCardId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllDataFromSheets();
    }
  }, [isAuthenticated]);

  const loadAllDataFromSheets = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([fetchChecklistFromSheets(), fetchTripsFromSheets()]);
    } catch (err) {
      console.error('데이터 로드 오류:', err);
    } finally {
      setIsSyncing(false);
      setIsInitialLoading(false);
    }
  };

  const fetchChecklistFromSheets = async () => {
    try {
      const res = await fetch('/api/sheets');
      const data = await res.json();
      if (data.checklists && Array.isArray(data.checklists)) {
        setChecklists(data.checklists);
      }
    } catch (err) {
      console.error('체크리스트 로드 실패:', err);
    }
  };

  const fetchTripsFromSheets = async () => {
    try {
      const res = await fetch('/api/sheets?type=trips');
      const data = await res.json();
      if (data.trips && Array.isArray(data.trips)) {
        setTrips(data.trips);
        setMemoryTrips(data.trips);
      }
    } catch (err) {
      console.error('여정 목록 로드 실패:', err);
    }
  };

  const handleManualSave = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklists }),
      });

      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'trips', trips }),
      });

      setHasUnsavedChanges(false);
      alert('💾 저장 완료');
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '2927') {
      setIsAuthenticated(true);
    } else {
      alert('비밀번호가 올바르지 않습니다.');
    }
  };

  const toggleCheck = (id: number) => {
    const updated = checklists.map(item => item.id === id ? { ...item, completed: !item.completed } : item);
    setChecklists(updated);
    setHasUnsavedChanges(true);
  };

  const addItem = () => {
    if (!newItemText.trim() || !selectedChecklistTripId) return;
    const updated = [...checklists, { id: Date.now(), tripId: selectedChecklistTripId, category: selectedCategory, title: newItemText, completed: false }];
    setChecklists(updated);
    setNewItemText('');
    setHasUnsavedChanges(true);
  };

  const deleteItem = (id: number) => {
    const updated = checklists.filter(item => item.id !== id);
    setChecklists(updated);
    setHasUnsavedChanges(true);
  };

  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripTitle.trim() || !newStartDate || !newEndDate) {
      alert('여행 제목과 일정을 모두 입력해 주세요.');
      return;
    }

    const createdTrip: Trip = {
      id: `trip-${Date.now()}`,
      title: newTripTitle,
      startDate: newStartDate,
      endDate: newEndDate,
      type: newTripType,
      places: [
        { id: `p-${Date.now()}`, order: 1, ampm: '오전', hour: '07', minute: '00', name: '', address: '', tip: '상호명 또는 주소를 입력해 보세요.' }
      ]
    };

    const updated = [createdTrip, ...trips];
    setTrips(updated);
    setMemoryTrips([createdTrip, ...memoryTrips]);
    setSelectedTripId(createdTrip.id);
    setIsWizardOpen(false);
    setHasUnsavedChanges(true);

    setNewTripTitle('');
    setNewStartDate('');
    setNewEndDate('');

    setActiveTab('itinerary');
  };

  const handleDeleteTrip = (tripId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const target = trips.find(t => t.id === tripId);
    const confirmMsg = target 
      ? `'${target.title}' 여정을 정말로 삭제하시겠습니까?\n(다녀온 추억 목록에는 안전하게 보관됩니다.)`
      : '이 여정을 정말 삭제하시겠습니까?';

    if (window.confirm(confirmMsg)) {
      const updatedTrips = trips.filter(t => t.id !== tripId);
      setTrips(updatedTrips);
      if (selectedTripId === tripId) {
        setSelectedTripId(null);
      }
      setHasUnsavedChanges(true);
    }
  };

  const handleDeleteMemory = (tripId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const target = memoryTrips.find(t => t.id === tripId);
    const confirmMsg = target 
      ? `'${target.title}' 추억 기록을 정말 삭제하시겠습니까?`
      : '이 추억 기록을 정말 삭제하시겠습니까?';

    if (window.confirm(confirmMsg)) {
      const updatedMemories = memoryTrips.filter(t => t.id !== tripId);
      setMemoryTrips(updatedMemories);
      if (selectedMemoryTripId === tripId) {
        setSelectedMemoryTripId(null);
      }
      setHasUnsavedChanges(true);
    }
  };

  const handleAddPlaceCard = () => {
    if (!selectedTripId) return;
    const currentTrip = trips.find(t => t.id === selectedTripId);
    const places = currentTrip?.places || [];
    
    let nextAmpm = '오전';
    let nextHour = '07';
    let nextMinute = '00';

    if (places.length > 0) {
      const lastPlace = places[places.length - 1];
      const lastAmpm = lastPlace.ampm || '오전';
      let lastHourNum = parseInt(lastPlace.hour || '10', 10);
      nextMinute = lastPlace.minute || '00';

      let totalHour24 = (lastAmpm === '오후' && lastHourNum !== 12) 
        ? lastHourNum + 12 
        : (lastAmpm === '오전' && lastHourNum === 12) ? 0 : lastHourNum;

      totalHour24 = (totalHour24 + 2) % 24;

      if (totalHour24 >= 12) {
        nextAmpm = '오후';
        const h = totalHour24 === 12 ? 12 : totalHour24 - 12;
        nextHour = h.toString().padStart(2, '0');
      } else {
        nextAmpm = '오전';
        const h = totalHour24 === 0 ? 12 : totalHour24;
        nextHour = h.toString().padStart(2, '0');
      }
    }

    const updatedTrips = trips.map(t => {
      if (t.id === selectedTripId) {
        const nextOrder = (t.places?.length || 0) + 1;
        const newCard: PlaceCard = {
          id: `p-${Date.now()}`,
          order: nextOrder,
          ampm: nextAmpm,
          hour: nextHour,
          minute: nextMinute,
          name: '',
          address: '',
          tip: '캡처 인식으로 상호나 주소를 읽어옵니다.',
        };
        return { ...t, places: [...(t.places || []), newCard] };
      }
      return t;
    });
    setTrips(updatedTrips);
    setHasUnsavedChanges(true);
  };

  const handlePlaceCardChange = (cardId: string, field: keyof PlaceCard, value: any) => {
    if (!selectedTripId) return;
    setTrips(prevTrips => {
      const updatedTrips = prevTrips.map(t => {
        if (t.id === selectedTripId) {
          const updatedPlaces = t.places.map(p => {
            if (p.id === cardId) {
              const updatedCard = { ...p, [field]: value };
              const searchQuery = updatedCard.name || updatedCard.address;
              if (searchQuery && searchQuery.trim().length > 0) {
                updatedCard.mapUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(searchQuery.trim())}`;
              } else {
                updatedCard.mapUrl = undefined;
              }
              return updatedCard;
            }
            return p;
          });
          return { ...t, places: updatedPlaces };
        }
        return t;
      });
      setHasUnsavedChanges(true);
      return updatedTrips;
    });
  };

  const handleTripTitleChange = (tripId: string, newTitle: string) => {
    const updatedTrips = trips.map(t => t.id === tripId ? { ...t, title: newTitle } : t);
    setTrips(updatedTrips);
    setHasUnsavedChanges(true);
  };

  const handleTripReviewChange = (tripId: string, newReview: string) => {
    const updatedMemories = memoryTrips.map(t => t.id === tripId ? { ...t, review: newReview } : t);
    setMemoryTrips(updatedMemories);
    setHasUnsavedChanges(true);
  };

  const handleWifePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressedFile = await compressFileBeforeUpload(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('mode', 'profile');
      const res = await fetch('/api/analyze-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) {
        setWifePhoto(data.fileUrl);
        localStorage.setItem('wta_wife_photo', data.fileUrl);
      }
    }
  };

  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressedFile = await compressFileBeforeUpload(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('mode', 'bg');
      const res = await fetch('/api/analyze-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) {
        setLoginBgPhoto(data.fileUrl);
        localStorage.setItem('wta_login_bg', data.fileUrl);
      }
    }
  };

  const generateSmartMemoryReview = (trip: Trip) => {
    const sortedPlaces = [...(trip.places || [])].sort((a, b) => {
      const timeA = (a.ampm === '오후' && a.hour !== '12' ? parseInt(a.hour) + 12 : (a.ampm === '오전' && a.hour === '12' ? 0 : parseInt(a.hour))) * 60 + parseInt(a.minute || '0');
      const timeB = (b.ampm === '오후' && b.hour !== '12' ? parseInt(b.hour) + 12 : (b.ampm === '오전' && b.hour === '12' ? 0 : parseInt(b.hour))) * 60 + parseInt(b.minute || '0');
      return timeA - timeB;
    });

    const placeNames = sortedPlaces.map(p => p.name).filter(Boolean);
    const placeRouteText = placeNames.length > 0 
      ? `${placeNames.join(' ➔ ')} 순서로 알차게 둘러보며 해당 지역의 매력을 가득 느낀 완벽한 여정이었습니다.`
      : '계획했던 다채로운 장소들을 하나씩 경험하며 잊지 못할 여유로운 시간을 보냈습니다.';

    const tripChecklist = checklists.filter(c => c.tripId === trip.id || (!c.tripId && trip.id === trips[0]?.id));
    const itemsText = tripChecklist.map(c => c.title).filter(Boolean);

    const extraChecklistText = itemsText.length > 0
      ? ` 꼼꼼히 챙긴 [${itemsText.slice(0, 3).join(', ')}] 덕분에 한층 더 즐겁고 만족스러운 여행이 되었습니다.`
      : '';

    return `${trip.title}에서 소중한 사람들과 함께한 행복한 순간! ${placeRouteText}${extraChecklistText} 다음 여행도 기대되는 순간이었습니다.`;
  };

  const handleAddMemoryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedMemoryTripId) return;

    setIsAnalyzing(true);
    setAnalyzingMessage('☁️ 클라우드 업로드 및 추억 사진 저장 중...');

    try {
      const newImagesList: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const compressedFile = await compressFileBeforeUpload(files[i]);
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('mode', 'memory');

        const res = await fetch('/api/analyze-image', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.fileUrl) {
          newImagesList.push(data.fileUrl);
        }
      }

      const updatedMemories = memoryTrips.map(t => {
        if (t.id === selectedMemoryTripId) {
          const existingImgs = t.memoriesImages || [];
          return { ...t, memoriesImages: [...existingImgs, ...newImagesList] };
        }
        return t;
      });

      setMemoryTrips(updatedMemories);
      setHasUnsavedChanges(true);
      alert(`📸 ${newImagesList.length}장의 사진이 추가되었습니다.`);
    } catch (err) {
      alert('사진 업로드 도중 에러가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeletePlaceCard = (cardId: string) => {
    if (!selectedTripId) return;
    const updatedTrips = trips.map(t => {
      if (t.id === selectedTripId) {
        const filtered = t.places.filter(p => p.id !== cardId).map((p, idx) => ({ ...p, order: idx + 1 }));
        return { ...t, places: filtered };
      }
      return t;
    });
    setTrips(updatedTrips);
    setHasUnsavedChanges(true);
  };

  const handleAnalyzeChecklistImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChecklistTripId) return;

    setIsAnalyzing(true);
    setAnalyzingMessage('☁️ 클라우드 업로드 및 캡처 인식 중...');
    try {
      const compressedFile = await compressFileBeforeUpload(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('mode', 'checklist');

      const apiRes = await fetch('/api/analyze-image', { method: 'POST', body: formData });
      const data = await apiRes.json();

      const driveImgUrl = data.fileUrl || '';

      if (data.extractedData && Array.isArray(data.extractedData) && data.extractedData.length > 0) {
        const newItems: ChecklistItem[] = data.extractedData.map((item: any, idx: number) => ({
          id: Date.now() + idx,
          tripId: selectedChecklistTripId,
          category: item.category || '음식/식재료',
          title: item.title,
          completed: false,
          imageUrl: driveImgUrl,
        }));
        const updated = [...checklists, ...newItems];
        setChecklists(updated);
        setHasUnsavedChanges(true);
        alert(`🎉 준비물 ${newItems.length}개가 추출되었습니다.`);
      } else {
        alert('이미지에서 준비물 항목을 추출하지 못했습니다.');
      }
    } catch (err) {
      alert('이미지 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeCardImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetCardId) return;

    setIsAnalyzing(true);
    setAnalyzingMessage('☁️ 클라우드 업로드 및 캡처 인식 중...');
    try {
      const compressedFile = await compressFileBeforeUpload(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('mode', 'place');

      const apiRes = await fetch('/api/analyze-image', { method: 'POST', body: formData });
      const data = await apiRes.json();

      if (data.fileUrl) {
        handlePlaceCardChange(targetCardId, 'imageUrl', data.fileUrl);
      }

      if (data.extractedData && Array.isArray(data.extractedData) && data.extractedData.length > 0) {
        const extracted = data.extractedData[0];
        const extractedName = extracted.name || '';
        const extractedAddress = extracted.address || '';

        if (extractedName) handlePlaceCardChange(targetCardId, 'name', extractedName);
        if (extractedAddress) handlePlaceCardChange(targetCardId, 'address', extractedAddress);
        if (extracted.tip) handlePlaceCardChange(targetCardId, 'tip', extracted.tip);

        const searchQuery = extractedName || extractedAddress;
        if (searchQuery) {
          handlePlaceCardChange(targetCardId, 'mapUrl', `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(searchQuery.trim())}`);
        }
      }
    } catch (err) {
      console.error('이미지 분석 오류');
    } finally {
      setIsAnalyzing(false);
      setTargetCardId(null);
    }
  };

  const prevMonth = () => {
    setCurrentCalDate(new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() - 1, 1));
    setSelectedCalTrip(null);
  };

  const nextMonth = () => {
    setCurrentCalDate(new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, 1));
    setSelectedCalTrip(null);
  };

  const getCalendarDays = () => {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDate; d++) {
      days.push(d);
    }
    return days;
  };

  const getTripForDate = (dateStr: string) => {
    return trips.find(t => t.startDate <= dateStr && dateStr <= t.endDate);
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId) || trips[0];
  const selectedChecklistTrip = trips.find(t => t.id === selectedChecklistTripId);
  const selectedMemoryTrip = memoryTrips.find(t => t.id === selectedMemoryTripId);

  const filteredChecklists = checklists.filter(item => item.tripId === selectedChecklistTripId || (!item.tripId && selectedChecklistTripId === trips[0]?.id));

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center bg-gray-100 min-h-screen">
        <main className="w-full max-w-md bg-white min-h-screen flex flex-col justify-center items-center p-6 shadow-md relative overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-500"
            style={{ backgroundImage: `url(${loginBgPhoto})` }}
          />
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px]" />

          <button 
            onClick={() => fileInputRefLoginBg.current?.click()}
            className="absolute top-4 right-4 p-2 bg-white/60 hover:bg-white/90 text-gray-700 rounded-full shadow-sm z-20 transition"
            title="제작자 전용: 로그인 배경 이미지 변경"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRefLoginBg} 
            onChange={handleLoginBgUpload} 
            className="hidden" 
          />

          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6 border-2 border-blue-400 shadow-md">
              <span className="text-2xl font-bold text-blue-600">WTA</span>
            </div>
            <h1 className="text-2xl font-bold text-black mb-1">Wany Travel Assistant</h1>
            <p className="text-sm text-gray-800 mb-8 font-medium">경완님만을 위한 전용 공간입니다.</p>

            <form onSubmit={handleLogin} className="w-full max-w-xs flex flex-col gap-3">
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 text-gray-600 w-5 h-5" />
                <input
                  type="password"
                  placeholder="비밀번호 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg text-black font-bold placeholder-gray-500 bg-white/90 shadow-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-md text-base"
              >
                접속하기
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-gray-100 min-h-screen">
      <main className="w-full max-w-md bg-white h-screen flex flex-col relative shadow-lg overflow-hidden">
        
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRefChecklist} 
          onChange={handleAnalyzeChecklistImage} 
          className="hidden" 
        />
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRefPlaceCard} 
          onChange={handleAnalyzeCardImage} 
          className="hidden" 
        />
        <input 
          type="file" 
          accept="image/*" 
          multiple
          ref={fileInputRefMemory} 
          onChange={handleAddMemoryImage} 
          className="hidden" 
        />
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRefWife} 
          onChange={handleWifePhotoUpload} 
          className="hidden" 
        />

        {/* 💡 헤더: 좌측 상단 WTA 로고 바로 옆 버전 고정 표기 (APP_VERSION) */}
        <header className="p-4 border-b border-gray-300 flex justify-between items-center bg-white sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-600">WTA</h1>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border border-blue-200">
              {APP_VERSION}
            </span>
            <span className="text-xs text-gray-700 font-medium hidden sm:inline">for 경완님</span>
          </div>
          
          <button 
            onClick={handleManualSave}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl font-bold transition shadow ${
              hasUnsavedChanges 
                ? 'bg-blue-600 text-white animate-pulse' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
            }`}
          >
            {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{hasUnsavedChanges ? '💾 저장하기' : '저장 완료'}</span>
          </button>
        </header>

        {isAnalyzing && (
          <div className="bg-purple-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2 flex-shrink-0">
            <RefreshCw className="w-4 h-4 animate-spin" /> {analyzingMessage}
          </div>
        )}

        <div className="flex-1 p-4 overflow-y-auto pb-20">
          {/* 홈 탭 */}
          {activeTab === 'home' && (
            <div className="flex flex-col gap-4">
              
              <div className="p-3.5 border-2 border-pink-200 bg-pink-50/60 rounded-2xl flex items-center gap-3 shadow-sm relative">
                <div 
                  onClick={() => fileInputRefWife.current?.click()}
                  className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-pink-400 cursor-pointer hover:opacity-80 flex-shrink-0 shadow bg-gray-200"
                  title="클릭하여 사진 변경하기"
                >
                  <img 
                    src={wifePhoto} 
                    alt="아내 프로필" 
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-pink-600 font-extrabold text-xs">
                    <Heart className="w-3.5 h-3.5 fill-pink-600" />
                    <span>My Dearest Wife</span>
                  </div>
                  <p className="text-xs font-bold text-black mt-0.5">
                    완이를 위한 WTA(Wife Travel Assistant)
                  </p>
                </div>
              </div>

              {selectedTrip ? (
                <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white shadow">
                  <p className="text-xs opacity-90 mb-1 font-medium">다음 예정된 여정</p>
                  <h2 className="text-lg font-bold mb-2">{selectedTrip.type} {selectedTrip.title}</h2>
                  <div className="flex justify-between items-center text-xs opacity-100 font-semibold">
                    <span>{selectedTrip.startDate} ~ {selectedTrip.endDate}</span>
                    <button 
                      onClick={() => { setSelectedTripId(selectedTrip.id); setActiveTab('itinerary'); }}
                      className="bg-white text-blue-700 px-3 py-1 rounded-lg font-bold shadow-sm"
                    >
                      관리하기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border-2 border-dashed border-blue-300 rounded-2xl text-center text-xs font-bold text-blue-700">
                  {isInitialLoading ? '여정을 불러오는 중입니다...' : '등록된 예정 여정이 없습니다. 아래 버튼을 눌러 여정을 만들어 보세요!'}
                </div>
              )}

              <button 
                onClick={() => setIsWizardOpen(true)}
                className="w-full p-4 bg-white border-2 border-blue-500 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-50 transition shadow-sm"
              >
                <Plus className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-bold text-blue-700">새 여정 생성하기</span>
              </button>

              <h3 className="font-bold text-black mt-1 text-sm">여행 방식 선택 (클릭 시 일정 만들기)</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['🏕️ 캠핑', '🏡 펜션', '🏨 호텔', '🏰 리조트 / 별장', '🚗 당일치기', '👶 아이 동반'].map((type) => (
                  <button 
                    key={type}
                    onClick={() => { setNewTripType(type); setIsWizardOpen(true); }} 
                    className="p-3 border-2 border-gray-200 rounded-xl bg-white hover:border-blue-500 text-left font-bold text-black shadow-sm"
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* 📅 미니 달력 */}
              <div className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm flex flex-col gap-3 mt-1 relative">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-1.5 font-bold text-black text-sm">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>{currentCalDate.getFullYear()}년 {currentCalDate.getMonth() + 1}월 달력</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600">
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-600 mb-1">
                  <span className="text-red-500">일</span>
                  <span>월</span>
                  <span>화</span>
                  <span>수</span>
                  <span>목</span>
                  <span>금</span>
                  <span className="text-blue-500">토</span>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {getCalendarDays().map((day, idx) => {
                    if (day === null) {
                      return <div key={idx} className="h-10"></div>;
                    }

                    const year = currentCalDate.getFullYear();
                    const month = currentCalDate.getMonth();
                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const holidayName = HOLIDAYS[dateKey];
                    const matchedTrip = getTripForDate(dateKey);

                    const isSunday = idx % 7 === 0;
                    const isSaturday = idx % 7 === 6;
                    const isHoliday = !!holidayName || isSunday;
                    const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

                    return (
                      <div 
                        key={idx} 
                        onClick={() => {
                          if (matchedTrip) {
                            setSelectedCalTrip({ trip: matchedTrip, dateStr: dateKey });
                          } else {
                            setSelectedCalTrip(null);
                          }
                        }}
                        className={`h-10 border rounded-lg p-0.5 flex flex-col items-center justify-between font-bold overflow-hidden cursor-pointer transition relative ${
                          matchedTrip 
                            ? 'ring-2 ring-blue-500 bg-blue-100' 
                            : isToday 
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm' 
                            : isHoliday 
                            ? 'border-red-100 bg-red-50/60' 
                            : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <span className={`text-[11px] leading-tight ${matchedTrip ? 'text-blue-800 font-extrabold' : isToday ? 'text-white' : isHoliday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-black'}`}>
                          {day}
                        </span>

                        {matchedTrip ? (
                          <span className="text-[8px] font-extrabold truncate w-full text-center px-0.5 rounded leading-tight bg-blue-600 text-white" title={matchedTrip.title}>
                            {matchedTrip.type.split(' ')[0]}
                          </span>
                        ) : holidayName ? (
                          <span className={`text-[8px] font-extrabold truncate w-full text-center px-0.5 rounded leading-tight ${isToday ? 'bg-white text-blue-700' : 'text-red-600 bg-red-100'}`} title={holidayName}>
                            {holidayName}
                          </span>
                        ) : (
                          <span className="h-2"></span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedCalTrip && (
                  <div className="mt-2 p-3 bg-blue-50 border-2 border-blue-400 rounded-xl flex justify-between items-center shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{selectedCalTrip.trip.type.split(' ')[0]}</span>
                      <div>
                        <p className="text-xs font-bold text-black">{selectedCalTrip.trip.title}</p>
                        <p className="text-[10px] text-blue-700 font-medium">
                          📅 {selectedCalTrip.trip.startDate} ~ {selectedCalTrip.trip.endDate}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setSelectedTripId(selectedCalTrip.trip.id);
                          setActiveTab('itinerary');
                        }}
                        className="bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow"
                      >
                        보기
                      </button>
                      <button onClick={() => setSelectedCalTrip(null)} className="text-gray-400 hover:text-black p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* 여정 탭 */}
          {activeTab === 'itinerary' && (
            <div className="flex flex-col gap-4">
              {selectedTripId && selectedTrip ? (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setSelectedTripId(null)}
                      className="flex items-center gap-1 text-xs text-blue-600 font-bold"
                    >
                      <ChevronLeft className="w-4 h-4" /> 전체 여정 목록으로
                    </button>

                    <button 
                      onClick={(e) => handleDeleteTrip(selectedTrip.id, e)}
                      className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 여정 삭제
                    </button>
                  </div>
                  
                  <div className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">{selectedTrip.type}</span>
                      
                      <div className="flex items-center gap-1 mt-1">
                        <input 
                          type="text" 
                          value={selectedTrip.title}
                          onChange={(e) => handleTripTitleChange(selectedTrip.id, e.target.value)}
                          className="font-bold text-base text-black bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                          placeholder="여정 제목 입력"
                        />
                        <Edit3 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      </div>

                      <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5" /> {selectedTrip.startDate} ~ {selectedTrip.endDate}
                      </p>
                    </div>

                    <button 
                      onClick={() => {
                        setSelectedChecklistTripId(selectedTrip.id);
                        setActiveTab('checklist');
                      }}
                      className="bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 shadow-sm transition flex-shrink-0"
                    >
                      <ListChecks className="w-4 h-4" /> 체크리스트
                    </button>
                  </div>

                  <div className="flex justify-between items-center mt-1">
                    <h3 className="font-bold text-black text-sm">📍 세부 동선 카드</h3>
                    <button 
                      onClick={handleAddPlaceCard}
                      className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-bold shadow flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> 카드 추가
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {selectedTrip.places && selectedTrip.places.length > 0 ? (
                      selectedTrip.places.map((place) => {
                        const searchQuery = (place.name || place.address || '').trim();
                        const effectiveMapUrl = searchQuery 
                          ? `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(searchQuery)}` 
                          : place.mapUrl;

                        return (
                          <div key={place.id} className="p-3.5 border-2 border-gray-200 rounded-2xl bg-white shadow-sm flex flex-col gap-2 relative">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 bg-blue-600 text-white text-xs font-extrabold rounded-full flex items-center justify-center shadow-sm">
                                  {place.order}
                                </span>
                                
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded-lg px-2 py-1">
                                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                                  <select 
                                    value={place.ampm || '오전'} 
                                    onChange={(e) => handlePlaceCardChange(place.id, 'ampm', e.target.value)}
                                    className="text-xs font-bold text-black bg-transparent focus:outline-none cursor-pointer"
                                  >
                                    <option value="오전">오전</option>
                                    <option value="오후">오후</option>
                                  </select>
                                  <select 
                                    value={place.hour || '07'} 
                                    onChange={(e) => handlePlaceCardChange(place.id, 'hour', e.target.value)}
                                    className="text-xs font-bold text-black bg-transparent focus:outline-none cursor-pointer"
                                  >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                                      <option key={h} value={h.toString().padStart(2, '0')}>{h}시</option>
                                    ))}
                                  </select>
                                  <span className="text-xs font-bold text-gray-500">:</span>
                                  <select 
                                    value={place.minute || '00'} 
                                    onChange={(e) => handlePlaceCardChange(place.id, 'minute', e.target.value)}
                                    className="text-xs font-bold text-black bg-transparent focus:outline-none cursor-pointer"
                                  >
                                    {['00', '10', '20', '30', '40', '50'].map((m) => (
                                      <option key={m} value={m}>{m}분</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <button 
                                onClick={() => handleDeletePlaceCard(place.id)}
                                className="text-gray-400 hover:text-red-500 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="flex flex-col gap-1.5 mt-1">
                              <input 
                                type="text"
                                value={place.name}
                                onChange={(e) => handlePlaceCardChange(place.id, 'name', e.target.value)}
                                placeholder="상호명 또는 장소명 입력"
                                className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-bold text-black focus:outline-none focus:border-blue-500"
                              />

                              <input 
                                type="text"
                                value={place.address}
                                onChange={(e) => handlePlaceCardChange(place.id, 'address', e.target.value)}
                                placeholder="주소 또는 위치 입력"
                                className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs text-black font-medium focus:outline-none focus:border-blue-500"
                              />
                            </div>

                            {effectiveMapUrl && (
                              <a 
                                href={effectiveMapUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs text-green-700 bg-green-50 border border-green-300 font-bold px-3 py-1.5 rounded-xl flex items-center justify-between hover:bg-green-100 transition mt-1 shadow-sm"
                              >
                                <span>📍 네이버 지도에서 보기</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                                  💡 장소 정보 연동 완료
                                </span>
                                <button 
                                  onClick={() => {
                                    setTargetCardId(place.id);
                                    fileInputRefPlaceCard.current?.click();
                                  }}
                                  className="text-[11px] text-purple-700 font-bold bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded-lg flex items-center gap-1 transition"
                                >
                                  <ImageIcon className="w-3 h-3" /> 📸 캡처 사진 인식
                                </button>
                              </div>

                              {place.imageUrl && (
                                <div className="flex items-center gap-2 mt-1 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                  <div 
                                    onClick={() => setPreviewImage(place.imageUrl!)}
                                    className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-300 cursor-pointer hover:opacity-80 group shadow-sm flex-shrink-0"
                                  >
                                    <img src={place.imageUrl} alt="캡처 미리보기" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition">
                                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-gray-600 font-medium">
                                    <p className="font-bold text-black">등록된 캡처 이미지</p>
                                    <p className="text-[10px] text-gray-500">클릭하여 큰 화면으로 보기</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center text-xs text-gray-500 border-2 border-dashed rounded-2xl font-medium">
                        동선 카드가 없습니다. 상단 '+ 카드 추가'를 눌러 일정을 채워보세요!
                      </div>
                    )}

                    <button 
                      onClick={handleAddPlaceCard}
                      className="w-full py-3 bg-white border-2 border-dashed border-gray-300 rounded-2xl text-xs font-bold text-gray-600 hover:border-blue-500 hover:text-blue-600 transition flex items-center justify-center gap-1 mt-1"
                    >
                      <Plus className="w-4 h-4" /> 새 동선 카드 추가
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg text-black">🗺️ 경완님의 여정 목록</h2>
                    <button 
                      onClick={() => setIsWizardOpen(true)}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-xl font-bold shadow flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> 새 여정
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {trips.length > 0 ? (
                      trips.map((trip) => (
                        <div 
                          key={trip.id}
                          onClick={() => setSelectedTripId(trip.id)}
                          className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-blue-500 cursor-pointer transition flex justify-between items-center group"
                        >
                          <div>
                            <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">{trip.type}</span>
                            <h3 className="font-bold text-sm text-black mt-1">{trip.title}</h3>
                            <p className="text-xs text-gray-600 mt-1 font-medium flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" /> {trip.startDate} ~ {trip.endDate}
                            </p>
                          </div>

                          <button 
                            onClick={(e) => handleDeleteTrip(trip.id, e)}
                            className="text-gray-400 hover:text-red-500 p-2"
                            title="여정 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-gray-500 border-2 border-dashed rounded-2xl font-medium">
                        {isInitialLoading ? '여정 데이터를 로딩 중입니다...' : '등록된 여정이 없습니다. 새 여정을 만들어 보세요!'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 체크리스트 탭 */}
          {activeTab === 'checklist' && (
            <div className="flex flex-col gap-4">
              {selectedChecklistTripId ? (
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => setSelectedChecklistTripId(null)}
                    className="flex items-center gap-1 text-xs text-purple-600 font-bold self-start"
                  >
                    <ChevronLeft className="w-4 h-4" /> 전체 체크리스트 여정 목록으로
                  </button>

                  <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                    <div>
                      <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                        {selectedChecklistTrip?.type}
                      </span>
                      <h2 className="font-bold text-base text-black mt-1">📦 {selectedChecklistTrip?.title} 짐 싸기</h2>
                    </div>

                    <button 
                      onClick={() => fileInputRefChecklist.current?.click()}
                      className="text-xs text-purple-700 font-bold border-2 border-purple-300 px-2.5 py-1.5 rounded-xl flex items-center gap-1 bg-purple-50 shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" /> 캡처 업로드
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1 w-full">
                    <select 
                      value={selectedCategory} 
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-28 border-2 border-gray-300 rounded-xl px-1.5 py-2 text-xs bg-white font-bold text-black focus:outline-none flex-shrink-0"
                    >
                      <option value="음식/식재료">🍖 음식</option>
                      <option value="아이용품">👶 아이용</option>
                      <option value="캠핑장비">🏕️ 캠핑</option>
                      <option value="의류/세면">👕 의류</option>
                      <option value="중요사항">🚨 중요</option>
                      <option value="기타">📌 기타</option>
                    </select>
                    <input
                      type="text"
                      placeholder="준비물 입력..."
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      className="flex-1 min-w-0 border-2 border-gray-300 rounded-xl px-2.5 py-2 text-xs font-bold text-black placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      onClick={addItem} 
                      className="w-14 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs shadow flex-shrink-0 text-center"
                    >
                      추가
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    {filteredChecklists.length > 0 ? (
                      filteredChecklists.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-xl bg-white shadow-sm">
                          <div className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={() => toggleCheck(item.id)}>
                            <input type="checkbox" checked={item.completed} onChange={() => {}} className="w-4 h-4 text-blue-600 rounded flex-shrink-0" />
                            <span className={`text-xs truncate ${item.completed ? 'line-through text-gray-400 font-normal' : 'text-black font-bold'}`}>
                              <strong className={`${item.category === '중요사항' ? 'text-red-600 font-black' : 'text-blue-700 font-extrabold'}`}>[{item.category}]</strong> {item.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {item.imageUrl && (
                              <div 
                                onClick={() => setPreviewImage(item.imageUrl!)}
                                className="relative w-8 h-8 rounded-lg overflow-hidden border border-purple-300 cursor-pointer hover:opacity-80 group shadow-sm flex-shrink-0 bg-gray-100"
                                title="클릭하여 원본 크게 보기"
                              >
                                <img src={item.imageUrl} alt="항목 캡처" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition">
                                  <Maximize2 className="w-2.5 h-2.5 text-white" />
                                </div>
                              </div>
                            )}

                            <button onClick={() => deleteItem(item.id)} className="text-gray-500 hover:text-red-600 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-xs text-gray-500 border-2 border-dashed rounded-2xl font-medium mt-1">
                        등록된 짐 싸기 항목이 없습니다. 준비물을 추가해 보세요!
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg text-black">📦 여정별 체크리스트 선택</h2>
                  </div>

                  <div className="flex flex-col gap-3">
                    {trips.map((trip) => {
                      const count = checklists.filter(c => c.tripId === trip.id || (!c.tripId && trip.id === trips[0]?.id)).length;
                      return (
                        <div 
                          key={trip.id}
                          onClick={() => setSelectedChecklistTripId(trip.id)}
                          className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-purple-500 cursor-pointer transition flex justify-between items-center"
                        >
                          <div>
                            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">{trip.type}</span>
                            <h3 className="font-bold text-sm text-black mt-1">{trip.title}</h3>
                            <p className="text-xs text-gray-600 mt-1 font-medium">
                              {trip.startDate} ~ {trip.endDate}
                            </p>
                          </div>

                          <div className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1">
                            <span>준비물</span>
                            <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{count}개</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 추억 탭 */}
          {activeTab === 'past' && (
            <div className="flex flex-col gap-4">
              {selectedMemoryTripId && selectedMemoryTrip ? (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setSelectedMemoryTripId(null)}
                      className="flex items-center gap-1 text-xs text-pink-600 font-bold self-start"
                    >
                      <ChevronLeft className="w-4 h-4" /> 전체 추억 목록으로
                    </button>

                    <button 
                      onClick={(e) => handleDeleteMemory(selectedMemoryTrip.id, e)}
                      className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 추억 삭제
                    </button>
                  </div>

                  <div className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-xs font-bold text-pink-600 flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 fill-pink-600" /> {selectedMemoryTrip.type} 추억
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {selectedMemoryTrip.startDate} ~ {selectedMemoryTrip.endDate}
                      </span>
                    </div>

                    <h2 className="font-bold text-base text-black">{selectedMemoryTrip.title}</h2>

                    <div className="relative w-full h-48 bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 flex items-center justify-center group">
                      {selectedMemoryTrip.memoriesImages && selectedMemoryTrip.memoriesImages.length > 0 ? (
                        <>
                          <img 
                            src={selectedMemoryTrip.memoriesImages[memoryImgIdx % selectedMemoryTrip.memoriesImages.length]} 
                            alt="추억 사진" 
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setPreviewImage(selectedMemoryTrip.memoriesImages![memoryImgIdx % selectedMemoryTrip.memoriesImages.length])}
                          />

                          {selectedMemoryTrip.memoriesImages.length > 1 && (
                            <>
                              <button 
                                onClick={() => setMemoryImgIdx(prev => (prev - 1 + selectedMemoryTrip.memoriesImages!.length) % selectedMemoryTrip.memoriesImages!.length)}
                                className="absolute left-2 bg-black/50 text-white p-1 rounded-full hover:bg-black"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setMemoryImgIdx(prev => (prev + 1) % selectedMemoryTrip.memoriesImages!.length)}
                                className="absolute right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black"
                              >
                                <ChevronRightIcon className="w-4 h-4" />
                              </button>
                              <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                {memoryImgIdx + 1} / {selectedMemoryTrip.memoriesImages.length}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="text-center text-xs text-gray-600 font-medium">
                          등록된 추억 사진이 없습니다. 아래 버튼으로 사진을 추가해 보세요!
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={() => fileInputRefMemory.current?.click()}
                      className="w-full py-2 bg-pink-50 hover:bg-pink-100 border border-pink-300 text-pink-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm transition"
                    >
                      <Camera className="w-3.5 h-3.5" /> 📸 추억 사진 추가하기 (여러 장 가능)
                    </button>

                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-black flex items-center gap-1">
                          ✍️ AI 기반 여행 추억 리뷰 (직접 수정 가능)
                        </label>
                        <button 
                          onClick={() => {
                            const smartReview = generateSmartMemoryReview(selectedMemoryTrip);
                            handleTripReviewChange(selectedMemoryTrip.id, smartReview);
                          }}
                          className="text-[10px] text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 transition"
                        >
                          <Sparkles className="w-3 h-3" /> 동선&체크리스트 기반 재생성
                        </button>
                      </div>

                      <textarea 
                        rows={4}
                        value={selectedMemoryTrip.review || generateSmartMemoryReview(selectedMemoryTrip)}
                        onChange={(e) => handleTripReviewChange(selectedMemoryTrip.id, e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-xs text-black font-medium focus:outline-none focus:border-pink-500 bg-gray-50 leading-relaxed"
                        placeholder="이 여행에 대한 특별한 감상이나 후기를 기록해 보세요."
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-lg text-black">💖 다녀온 추억 목록</h2>
                  </div>

                  <div className="flex flex-col gap-3">
                    {memoryTrips.length > 0 ? (
                      memoryTrips.map((trip) => (
                        <div 
                          key={trip.id}
                          onClick={() => {
                            setSelectedMemoryTripId(trip.id);
                            setMemoryImgIdx(0);
                          }}
                          className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-pink-500 cursor-pointer transition flex justify-between items-center group"
                        >
                          <div>
                            <span className="text-[10px] bg-pink-100 text-pink-800 font-bold px-2 py-0.5 rounded">{trip.type}</span>
                            <h3 className="font-bold text-sm text-black mt-1">{trip.title}</h3>
                            <p className="text-xs text-gray-600 mt-1 font-medium">
                              {trip.startDate} ~ {trip.endDate}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="bg-pink-50 text-pink-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-pink-200">
                              추억 보기
                            </div>
                            
                            <button 
                              onClick={(e) => handleDeleteMemory(trip.id, e)}
                              className="text-gray-400 hover:text-red-500 p-1.5"
                              title="추억 삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-gray-500 border-2 border-dashed rounded-2xl font-medium">
                        저장된 추억이 없습니다. 여행을 다녀온 후 추억을 기록해 보세요!
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 📸 공용 크게 보기 모달 */}
        {previewImage && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-sm w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 right-3 bg-black/60 text-white p-1.5 rounded-full z-10 hover:bg-black"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={previewImage} alt="원본 이미지" className="w-full max-h-[70vh] object-contain rounded-xl" />
            </div>
          </div>
        )}

        {/* 새 여정 생성 모달 */}
        {isWizardOpen && (
          <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center p-4">
            <form onSubmit={handleCreateTrip} className="bg-white w-full rounded-2xl p-5 flex flex-col gap-3 shadow-xl border">
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <h3 className="font-bold text-sm text-black">✨ 경완님 새 여행 만들기</h3>
                <button type="button" onClick={() => setIsWizardOpen(false)}><X className="w-4 h-4 text-gray-500" /></button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-black">여행 제목</label>
                <input 
                  type="text" 
                  placeholder="예: 제주도 가족 힐링 여행"
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-black focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-black">시작일</label>
                  <input 
                    type="date" 
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="border-2 border-gray-300 rounded-xl px-2 py-2 text-xs font-bold text-black focus:outline-none"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-black">종료일</label>
                  <input 
                    type="date" 
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="border-2 border-gray-300 rounded-xl px-2 py-2 text-xs font-bold text-black focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-black">여행 방식</label>
                <select 
                  value={newTripType}
                  onChange={(e) => setNewTripType(e.target.value)}
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-black focus:outline-none"
                >
                  <option value="🏕️ 캠핑">🏕️ 캠핑</option>
                  <option value="🏡 펜션">🏡 펜션</option>
                  <option value="🏨 호텔">🏨 호텔</option>
                  <option value="🏰 리조트 / 별장">🏰 리조트 / 별장</option>
                  <option value="🚗 당일치기">🚗 당일치기</option>
                  <option value="👶 아이 동반">👶 아이 동반</option>
                </select>
              </div>

              <button 
                type="submit" 
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition"
              >
                여정 생성 및 저장
              </button>
            </form>
          </div>
        )}

        <nav className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-300 flex justify-around items-center z-20 shadow-md">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center ${activeTab === 'home' ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-1">홈</span>
          </button>
          <button onClick={() => setActiveTab('itinerary')} className={`flex flex-col items-center ${activeTab === 'itinerary' ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>
            <MapPin className="w-5 h-5" />
            <span className="text-[10px] mt-1">여정</span>
          </button>
          <button onClick={() => setActiveTab('checklist')} className={`flex flex-col items-center ${activeTab === 'checklist' ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>
            <CheckSquare className="w-5 h-5" />
            <span className="text-[10px] mt-1">체크리스트</span>
          </button>
          <button onClick={() => setActiveTab('past')} className={`flex flex-col items-center ${activeTab === 'past' ? 'text-pink-600 font-bold' : 'text-gray-700'}`}>
            <Heart className="w-5 h-5" />
            <span className="text-[10px] mt-1">추억</span>
          </button>
        </nav>

      </main>
    </div>
  );
}