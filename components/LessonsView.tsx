
import React, { useState, useRef } from 'react';
import { Lesson, Module } from '../types';
import { INITIAL_LESSONS, COURSE_MODULES } from '../constants';
import { ArrowRight, Star, CheckCircle, Lock, Award, Download, Share2, BookOpen, GraduationCap, Check, Loader2 } from 'lucide-react';

const CERTIFICATE_LOGO = "https://i.postimg.cc/3xbzTV7k/Jam-Talk-Logo.png";

interface LessonsViewProps {
  onStartLesson: (lesson: Lesson) => void;
  completedLessonIds: string[];
}

export const LessonsView: React.FC<LessonsViewProps> = ({ onStartLesson, completedLessonIds }) => {
  const [activeTab, setActiveTab] = useState<'curriculum' | 'certificate'>('curriculum');
  const [userName, setUserName] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Ref for the hidden print version of the certificate
  const printRef = useRef<HTMLDivElement>(null);

  // Calculate Progress
  const totalLessons = INITIAL_LESSONS.length;
  const completedCount = completedLessonIds.length;
  const progressPercentage = Math.round((completedCount / totalLessons) * 100);
  const isCertified = completedCount >= totalLessons; 

  // Helper to check if a module is locked
  const isModuleLocked = (moduleOrder: number) => {
    if (moduleOrder === 1) return false;
    // Find previous module
    const prevModule = COURSE_MODULES.find(m => m.order === moduleOrder - 1);
    if (!prevModule) return false;
    
    // Check if all lessons in prev module are completed
    const prevModuleLessons = INITIAL_LESSONS.filter(l => l.moduleId === prevModule.id);
    const completedInPrev = prevModuleLessons.every(l => completedLessonIds.includes(l.id));
    
    return !completedInPrev;
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    
    setIsDownloading(true);
    try {
        // Wait a brief moment to ensure any repaints are done
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Wait for logo image to load if not ready
        const logoImg = printRef.current.querySelector('img.cert-logo') as HTMLImageElement;
        if (logoImg && !logoImg.complete) {
            await new Promise((resolve) => {
                logoImg.onload = resolve;
                logoImg.onerror = resolve; // proceed even if fail
            });
        }

        // Capture the hidden high-res print container using global html2canvas
        // @ts-ignore
        const canvas = await window.html2canvas(printRef.current, {
            scale: 2, // 2x scale for crisp text
            useCORS: true, // Allow loading the QR code and Logo image
            allowTaint: true,
            backgroundColor: '#fffdf5', // Force background color
            logging: false,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0
        });

        const imgData = canvas.toDataURL('image/png');
        
        // A4 Landscape dimensions in mm
        const pdfWidth = 297;
        const pdfHeight = 210;

        // Access global jsPDF
        // @ts-ignore
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`JamTalk_Certificate_${userName.replace(/\s+/g, '_') || 'Student'}.pdf`);

    } catch (error) {
        console.error("PDF Generation failed", error);
        alert("Could not generate PDF. Please try again.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareText = `I just earned my Certified Patois Speaker certificate on JamTalk! Big up! 🇯🇲🎓\nConnect with us: https://wa.me/233551389510`;
    
    const shareData = {
        title: 'JamTalk Certificate',
        text: shareText,
        url: "https://wa.me/233551389510" 
    };

    // Try native share first
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            return;
        } catch (err) {
            console.log('Native share cancelled or failed:', err);
        }
    }

    // Fallback: Copy to clipboard
    try {
        await navigator.clipboard.writeText(shareText);
        setShareStatus('copied');
        setTimeout(() => setShareStatus('idle'), 3000);
    } catch (err) {
        alert("Copy failed. Please manually share: +233551389510");
    }
  };

  const whatsappLink = "https://wa.me/233551389510?text=I%20am%20interested%20in%20learning%20Patois!";
  // QR Server is a reliable public API. Size 150x150 for clarity. Color dark green.
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(whatsappLink)}&color=15803d&bgcolor=fffdf5`;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      
      {/* Top Navigation Tabs */}
      <div className="bg-white border-b border-gray-100 p-2 sticky top-0 z-20">
         <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
               onClick={() => setActiveTab('curriculum')}
               className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                   activeTab === 'curriculum' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-600'
               }`}
            >
               <BookOpen size={16} /> Course
            </button>
            <button
               onClick={() => setActiveTab('certificate')}
               className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                   activeTab === 'certificate' 
                    ? 'bg-white text-green-700 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-600'
               }`}
            >
               <Award size={16} /> Certificate
               {isCertified && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            </button>
         </div>
      </div>

      {/* Main Content */}
      <div className="p-4 pb-24 max-w-2xl mx-auto space-y-6 flex-1 overflow-y-auto w-full">
        
        {/* === CURRICULUM TAB === */}
        {activeTab === 'curriculum' && (
           <div className="space-y-8 animate-in fade-in duration-300">
              {/* Progress Header */}
              <div className="bg-gradient-to-r from-green-600 to-green-500 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold">Your Progress</h1>
                    <span className="font-mono text-sm opacity-80">{completedCount}/{totalLessons} Lessons</span>
                </div>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-2">
                    <div 
                        className="h-full bg-white/90 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
                <p className="text-xs opacity-90">
                    {progressPercentage === 100 
                        ? "Congratulations! You've completed the course!" 
                        : "Keep going! Complete all lessons to get certified."}
                </p>
              </div>

              {/* Modules List */}
              <div className="space-y-8">
                 {COURSE_MODULES.map((module) => {
                     const isLocked = isModuleLocked(module.order);
                     const moduleLessons = INITIAL_LESSONS.filter(l => l.moduleId === module.id);
                     const completedInModule = moduleLessons.filter(l => completedLessonIds.includes(l.id)).length;
                     
                     return (
                         <div key={module.id} className={`relative ${isLocked ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                             <div className="flex items-center gap-3 mb-4">
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                     isLocked ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'
                                 }`}>
                                     {module.order}
                                 </div>
                                 <div>
                                     <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                         {module.title}
                                         {isLocked && <Lock size={14} className="text-gray-400" />}
                                     </h2>
                                     <p className="text-xs text-gray-500">{module.description}</p>
                                 </div>
                             </div>

                             <div className="grid gap-3 pl-4 border-l-2 border-gray-100 ml-4">
                                 {moduleLessons.map((lesson) => {
                                     const isCompleted = completedLessonIds.includes(lesson.id);
                                     
                                     return (
                                         <div 
                                            key={lesson.id}
                                            onClick={() => !isLocked && onStartLesson(lesson)}
                                            className={`relative bg-white rounded-xl p-4 border transition-all ${
                                                isLocked 
                                                    ? 'border-gray-100 cursor-not-allowed' 
                                                    : isCompleted 
                                                        ? 'border-green-200 bg-green-50 cursor-pointer hover:shadow-md' 
                                                        : 'border-gray-200 cursor-pointer hover:border-green-300 hover:shadow-md'
                                            }`}
                                         >
                                             <div className="flex justify-between items-start">
                                                 <div className="flex gap-4">
                                                     <div className="text-2xl pt-1">{lesson.emoji}</div>
                                                     <div>
                                                         <h3 className={`font-bold ${isCompleted ? 'text-green-900' : 'text-gray-800'}`}>
                                                             {lesson.title}
                                                         </h3>
                                                         <div className="flex flex-wrap gap-1 mt-1">
                                                             {lesson.topics.slice(0, 2).map(t => (
                                                                 <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                                                                     {t}
                                                                 </span>
                                                             ))}
                                                         </div>
                                                     </div>
                                                 </div>
                                                 
                                                 {isLocked ? (
                                                     <Lock size={16} className="text-gray-300 mt-2" />
                                                 ) : isCompleted ? (
                                                     <CheckCircle size={20} className="text-green-500 mt-1" />
                                                 ) : (
                                                     <div className="mt-2 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                                         <ArrowRight size={14} className="text-green-600" />
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                     );
                 })}
              </div>
           </div>
        )}

        {/* === CERTIFICATE TAB === */}
        {activeTab === 'certificate' && (
            <div className="animate-in slide-in-from-right duration-300">
                {!isCertified ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-6">
                        <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-4 relative">
                            <Lock size={48} className="text-gray-400" />
                            <div className="absolute -bottom-2 bg-gray-800 text-white text-xs px-3 py-1 rounded-full">
                                Locked
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800">Certificate Locked</h2>
                        <p className="text-gray-500 max-w-xs mx-auto">
                            Complete all {totalLessons} lessons in the curriculum to verify your skills and unlock your official Patois Speaker certificate.
                        </p>
                        
                        <div className="w-full max-w-xs bg-gray-200 h-4 rounded-full overflow-hidden mt-6">
                            <div 
                                className="h-full bg-green-500 transition-all duration-1000"
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                        <span className="text-sm font-bold text-green-600">{progressPercentage}% Completed</span>
                        
                        <button 
                           onClick={() => setActiveTab('curriculum')}
                           className="mt-8 text-green-600 font-medium hover:underline"
                        >
                            Return to Lessons
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center space-y-6">
                        <div className="text-center space-y-2">
                             <h2 className="text-2xl font-bold text-gray-900">Congratulations! 🎉</h2>
                             <p className="text-gray-600">You have officially mastered the basics of Jamaican Patois.</p>
                        </div>

                        {/* Visible Responsive Certificate Card */}
                        <div className="relative w-full aspect-[1.4] bg-[#fffdf5] border-8 border-double border-yellow-600 p-6 shadow-2xl rounded-lg text-center flex flex-col items-center overflow-hidden pb-32">
                            {/* Watermark */}
                            <div className="absolute inset-0 opacity-5 flex items-center justify-center pointer-events-none">
                                <GraduationCap size={200} />
                            </div>
                            
                            {/* Header */}
                            <div className="relative z-10 w-full border-b-2 border-yellow-600/20 pb-4 mb-2">
                                <img 
                                    src={CERTIFICATE_LOGO} 
                                    alt="JamTalk Logo" 
                                    className="h-16 mx-auto mb-3 object-contain"
                                    crossOrigin="anonymous"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                {!CERTIFICATE_LOGO && <h1 className="text-3xl font-bold text-green-700 mb-2">JamTalk</h1>}
                                
                                <div className="text-2xl sm:text-3xl font-serif text-yellow-700 font-bold tracking-widest uppercase mb-1">Certificate</div>
                                <div className="text-xs sm:text-sm font-serif text-yellow-800/60 uppercase tracking-wide">Of Completion</div>
                            </div>

                            {/* Body */}
                            <div className="relative z-10 flex-1 flex flex-col justify-center w-full py-2">
                                <p className="text-gray-500 italic font-serif mb-2 text-sm sm:text-base">This certifies that</p>
                                
                                <input 
                                    type="text" 
                                    placeholder="Enter Your Name"
                                    className="text-lg sm:text-xl font-serif font-bold text-center bg-transparent border-b-2 border-gray-300 focus:border-yellow-600 pb-2 mb-4 outline-none placeholder-gray-300 w-full text-gray-900 transition-colors"
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                />

                                <p className="text-gray-600 font-serif text-sm sm:text-lg">
                                    Has successfully completed the<br/>
                                    <span className="font-bold text-green-700">JamTalk Patois Course</span>
                                </p>
                            </div>

                            {/* Footer - Absolute Bottom */}
                            <div className="absolute bottom-0 left-6 right-6 z-10 grid grid-cols-3 items-end border-t border-yellow-600/20 pt-2 gap-2 pb-4">
                                <div className="text-left flex flex-col justify-end">
                                    <div className="text-[10px] sm:text-xs font-serif mb-1">{new Date().toLocaleDateString()}</div>
                                    <div className="w-full border-b border-gray-400 mb-1"></div>
                                    <div className="text-[8px] sm:text-[10px] text-gray-400 uppercase">Date</div>
                                </div>
                                
                                <div className="flex flex-col items-center justify-end">
                                    <img 
                                        src={qrCodeUrl} 
                                        alt="Contact QR" 
                                        className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-white shadow-sm mb-1"
                                        crossOrigin="anonymous" 
                                    />
                                </div>

                                <div className="text-right flex flex-col justify-end">
                                    <div className="text-[10px] sm:text-xs font-serif font-bold text-green-800 mb-1">JamTalk</div>
                                    <div className="w-full border-b border-gray-400 mb-1"></div>
                                    <div className="text-[8px] sm:text-[10px] text-gray-400 uppercase">Instructor</div>
                                </div>
                            </div>
                        </div>

                        {/* Hidden Print-Ready Template (A4 Landscape) */}
                        <div 
                           ref={printRef}
                           className="absolute top-0 left-[-9999px] bg-[#fffdf5] border-[16px] border-double border-[#ca8a04] flex flex-col overflow-hidden text-center"
                           style={{ width: '1123px', height: '794px', zIndex: -100, padding: '24px' }}
                        >
                            {/* Watermark */}
                            <div className="absolute inset-0 opacity-[0.05] flex items-center justify-center pointer-events-none">
                                <GraduationCap size={400} />
                            </div>

                            {/* Header - Compacted and moved UP */}
                            <div className="relative z-10 border-b-[2px] border-[#ca8a04]/20 pb-2 mb-2">
                                <img 
                                    src={CERTIFICATE_LOGO} 
                                    alt="JamTalk Logo" 
                                    className="cert-logo h-20 mx-auto mb-2 object-contain"
                                    crossOrigin="anonymous"
                                />
                                <h1 className="text-[48px] font-serif text-[#a16207] font-bold tracking-[0.15em] uppercase leading-tight mb-1">Certificate</h1>
                                <div className="text-[16px] font-serif text-[#854d0e]/60 uppercase tracking-[0.25em]">Of Completion</div>
                            </div>

                            {/* Body - Tighter Spacing and Shorter Name */}
                            <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                                <p className="text-[#6b7280] italic font-serif text-[22px] mb-2">This certifies that</p>
                                
                                <h2 className="text-[38px] font-serif font-bold text-[#111827] border-b-[3px] border-[#d1d5db] pb-1 mb-4 px-2 w-full max-w-[1000px] leading-tight mx-auto whitespace-nowrap overflow-hidden text-ellipsis">
                                    {userName || 'Student Name'}
                                </h2>
                                
                                <p className="text-[#4b5563] font-serif text-[24px] leading-normal">
                                    Has successfully completed the<br/>
                                    <span className="font-bold text-[#15803d] text-[28px]">JamTalk Patois Course</span>
                                </p>
                            </div>

                            {/* Footer - Pushed up with enough space */}
                            <div className="relative z-10 grid grid-cols-3 items-end pt-4 mt-auto mb-16 border-t-[2px] border-[#ca8a04]/20 gap-10 px-10">
                                {/* Date */}
                                <div className="text-left flex flex-col justify-end">
                                    <div className="text-[24px] font-serif text-[#1f2937] mb-1 pl-4">{new Date().toLocaleDateString()}</div>
                                    <div className="w-full border-b-[2px] border-[#9ca3af] mb-1"></div>
                                    <div className="text-[12px] text-[#9ca3af] uppercase font-bold tracking-wider pl-1">Date</div>
                                </div>
                                
                                {/* QR Code */}
                                <div className="flex flex-col items-center justify-end">
                                    <div className="bg-white p-1 border-[3px] border-[#e5e7eb] rounded-lg shadow-sm">
                                        <img 
                                            src={qrCodeUrl} 
                                            alt="Contact QR" 
                                            className="w-[90px] h-[90px]"
                                            crossOrigin="anonymous"
                                        />
                                    </div>
                                    <span className="text-[10px] text-[#15803d] font-bold uppercase tracking-widest mt-1">Scan to Connect</span>
                                </div>

                                {/* Instructor */}
                                <div className="text-right flex flex-col justify-end">
                                    <div className="text-[28px] font-serif font-bold text-[#166534] mb-1 pr-4 font-cursive">JamTalk</div>
                                    <div className="w-full border-b-[2px] border-[#9ca3af] mb-1"></div>
                                    <div className="text-[12px] text-[#9ca3af] uppercase font-bold tracking-wider pr-1">Instructor</div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-4 w-full max-w-sm">
                            <button 
                                className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
                                onClick={handleDownload}
                                disabled={isDownloading || !userName.trim()}
                            >
                                {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {isDownloading ? 'Generating...' : 'Download PDF'}
                            </button>
                            {/* Share button */}
                            <button 
                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                                    shareStatus === 'copied'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                                onClick={handleShare}
                            >
                                {shareStatus === 'copied' ? (
                                    <>
                                        <Check size={18} /> Copied!
                                    </>
                                ) : (
                                    <>
                                        <Share2 size={18} /> Share
                                    </>
                                )}
                            </button>
                        </div>
                        
                        {!userName.trim() && (
                            <p className="text-xs text-red-500 font-medium animate-pulse">
                                Please enter your name to unlock download.
                            </p>
                        )}
                        
                        {shareStatus === 'copied' && (
                            <p className="text-xs text-green-600 font-medium animate-in fade-in slide-in-from-top-1">
                                Link copied to clipboard!
                            </p>
                        )}
                    </div>
                )}
            </div>
        )}

      </div>
    </div>
  );
};
