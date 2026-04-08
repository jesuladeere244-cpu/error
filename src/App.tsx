/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Sparkles, 
  Search, 
  Plus, 
  Trash2, 
  Volume2, 
  ChevronRight, 
  ChevronLeft,
  GraduationCap,
  Heart,
  Star,
  Cloud,
  RefreshCw,
  Loader2,
  Camera,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Circle,
  Trophy,
  PenTool,
  BarChart3,
  PlayCircle,
  ArrowRight,
  Egg,
  ShoppingBag,
  Sun,
  Utensils,
  Mic,
  MicOff,
  History,
  Award
} from 'lucide-react';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';

// --- Types ---
interface WordEntry {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
  isMastered?: boolean;
}

interface StudyStats {
  total: number;
  mastered: number;
  unmastered: number;
}

interface PetState {
  isAdopted: boolean;
  type: 'cat' | 'dog' | 'rabbit' | 'dragon' | 'none';
  stage: 'egg' | 'baby' | 'adult';
  name: string;
  sunlightCount: number;
  foodCount: number;
  waterCount: number;
  grassCount: number;
  fruitCount: number;
  level: number;
  experience: number;
  lastReaction?: 'happy' | 'eating' | 'drinking' | 'hatching' | null;
  dailyGoalProgress: number;
  lastStudyDate: string;
  speech: string | null;
}

const DAILY_GOAL = 5; // Number of study actions per day

interface Inventory {
  sunlight: number;
  food: number;
  water: number;
  grass: number;
  fruit: number;
}

interface PronunciationResult {
  score: number;
  feedback: string;
}

interface StudyList {
  id: string;
  title: string;
  words: WordEntry[];
  createdAt: number;
}

// --- Gemini Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function evaluatePronunciation(targetText: string, audioBase64: string): Promise<PronunciationResult> {
  const prompt = `你是一个小学英语老师。请听这段音频，并将其与目标文本 "${targetText}" 进行比较。
  
  请根据以下标准评分（0-100）：
  - 100分：发音完美，语调自然。
  - 90分以上：非常接近原音，发音清晰。
  - 80分以上：发音基本准确，有个别小瑕疵。
  - 70分以下：发音不准，需要多加练习。
  
  请返回 JSON 格式，包含 score (数字) 和 feedback (简短的中文鼓励性评价)。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: prompt },
        { 
          inlineData: { 
            mimeType: "audio/webm", // MediaRecorder usually outputs webm
            data: audioBase64 
          } 
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
          },
          required: ["score", "feedback"],
        },
      },
    });

    const text = response.text;
    return JSON.parse(text || '{"score": 0, "feedback": "哎呀，没听清，再试一次吧！"}');
  } catch (error) {
    console.error("Gemini Evaluation Error:", error);
    return { score: 0, feedback: "评估出错了，请稍后再试。" };
  }
}

async function extractWordsFromImage(base64Image: string): Promise<string[]> {
  const prompt = "请识别这张图片中的所有英语单词。这些通常是小学四年级课本上的单词。请只返回单词列表，用逗号隔开。";
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              mimeType: "image/jpeg", 
              data: base64Image.split(',')[1] 
            } 
          }
        ]
      }
    });

    const text = response.text;
    if (!text) return [];
    return text.split(/[,\s\n]+/).filter(w => /^[a-zA-Z]+$/.test(w.trim()));
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
}

async function generateWordDetails(words: string[]): Promise<WordEntry[]> {
  if (words.length === 0) return [];
  
  const prompt = `你是一个小学英语老师。请为以下四年级英语单词（新版人教版 PEP）提供详细解析。
  单词列表：${words.join(', ')}
  
  要求：
  1. 提供音标。
  2. 提供准确的中文含义（适合四年级学生理解）。
  3. 提供一个简单有趣的英文例句，并附带中文翻译。
  4. 例句要贴近四年级小学生的日常生活。
  
  请以 JSON 数组格式返回。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              word: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              meaning: { type: Type.STRING },
              example: { type: Type.STRING },
              exampleTranslation: { type: Type.STRING },
            },
            required: ["id", "word", "phonetic", "meaning", "example", "exampleTranslation"],
          },
        },
      },
    });

    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

// --- Components ---

// --- Components ---

const PetVisual = ({ pet, scale = 1, onPet }: { pet: PetState, scale?: number, onPet?: () => void }) => {
  const isEgg = pet.stage === 'egg';
  const isBaby = pet.stage === 'baby';
  const isAdult = pet.stage === 'adult';

  const getPetIcon = (size: number) => {
    switch (pet.type) {
      case 'cat': return <Heart size={size * scale} fill="currentColor" />;
      case 'dog': return <Star size={size * scale} fill="currentColor" />;
      case 'rabbit': return <Cloud size={size * scale} fill="currentColor" />;
      case 'dragon': return <Sparkles size={size * scale} fill="currentColor" />;
      default: return <Heart size={size * scale} fill="currentColor" />;
    }
  };

  const getPetColor = () => {
    switch (pet.type) {
      case 'cat': return "bg-orange-400";
      case 'dog': return "bg-blue-400";
      case 'rabbit': return "bg-pink-400";
      case 'dragon': return "bg-green-400";
      default: return "bg-pink-400";
    }
  };

  return (
    <div className="relative flex items-center justify-center" style={{ transform: `scale(${scale})` }}>
      {/* Speech Bubble */}
      <AnimatePresence>
        {pet.speech && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: -140 * scale, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute z-50 bg-white px-6 py-3 rounded-3xl shadow-2xl border-4 border-pink-100 min-w-[200px] text-center"
          >
            <p className="text-gray-700 font-bold text-lg">{pet.speech}</p>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border-r-4 border-b-4 border-pink-100 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow Effect */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 3, repeat: Infinity }}
        className={cn(
          "absolute inset-0 blur-3xl rounded-full",
          isEgg ? "bg-yellow-200" : getPetColor().replace('bg-', 'bg-')
        )}
      />

      <motion.div
        onClick={onPet}
        animate={pet.lastReaction ? {
          y: [0, -40, 0],
          scale: [1, 1.1, 1],
        } : isEgg ? {
          rotate: [0, -5, 5, -5, 5, 0],
          scale: pet.sunlightCount > 0 ? [1, 1.05, 1] : 1
        } : {
          y: [0, -15, 0],
          scale: [1, 1.02, 1]
        }}
        transition={pet.lastReaction ? {
          duration: 0.5,
          ease: "easeOut"
        } : {
          duration: isEgg ? (pet.sunlightCount === 0 ? 5 : 2) : 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className={cn("relative z-10 cursor-pointer", !onPet && "pointer-events-none")}
      >
        {isEgg ? (
          <div className="relative">
            <motion.div
              animate={pet.sunlightCount >= 2 ? {
                scale: [1, 1.1, 1],
                filter: ["brightness(1)", "brightness(1.2)", "brightness(1)"]
              } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Egg size={140 * scale} className="text-yellow-500 drop-shadow-lg" />
            </motion.div>
            
            {/* Cracks appearing as sunlight increases */}
            {pet.sunlightCount >= 1 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-1/3 left-1/4 w-1/2 h-1/2 border-t-4 border-yellow-700/30 rounded-full rotate-45" 
              />
            )}
            {pet.sunlightCount >= 2 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-1/2 right-1/4 w-1/3 h-1/3 border-r-4 border-yellow-700/30 rounded-full -rotate-12" 
              />
            )}
            
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-28 h-6 bg-black/10 rounded-full blur-md" />
          </div>
        ) : (
          <div className="relative group">
            {/* Pet Specific Features (Ears/Horns/Wings/Tails) */}
            <div className="absolute inset-0 -top-6 flex justify-center gap-12 pointer-events-none">
              {pet.type === 'rabbit' && (
                <>
                  <motion.div 
                    animate={{ rotate: [-10, 10, -10], y: [0, -5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-6 h-20 bg-pink-300 rounded-full border-4 border-pink-400 origin-bottom" 
                  />
                  <motion.div 
                    animate={{ rotate: [10, -10, 10], y: [0, -5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-6 h-20 bg-pink-300 rounded-full border-4 border-pink-400 origin-bottom" 
                  />
                </>
              )}
              {pet.type === 'cat' && (
                <>
                  <div className="w-10 h-10 bg-orange-500 rotate-45 rounded-sm border-4 border-orange-600 -mt-2" />
                  <div className="w-10 h-10 bg-orange-500 rotate-45 rounded-sm border-4 border-orange-600 -mt-2" />
                </>
              )}
              {pet.type === 'dog' && (
                <>
                  <motion.div 
                    animate={{ rotate: [-20, 0, -20] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-10 h-14 bg-blue-500 rounded-b-full border-4 border-blue-600 origin-top" 
                  />
                  <motion.div 
                    animate={{ rotate: [20, 0, 20] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-10 h-14 bg-blue-500 rounded-b-full border-4 border-blue-600 origin-top" 
                  />
                </>
              )}
              {pet.type === 'dragon' && (
                <>
                  <div className="w-8 h-12 bg-green-600 rounded-t-full border-2 border-green-700" />
                  <div className="w-8 h-12 bg-green-600 rounded-t-full border-2 border-green-700" />
                  {/* Wings */}
                  <motion.div 
                    animate={{ rotateY: [0, 60, 0], x: [-60, -80, -60] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute top-10 left-0 w-24 h-16 bg-green-500/80 rounded-full border-4 border-green-600 origin-right -z-10"
                  />
                  <motion.div 
                    animate={{ rotateY: [0, -60, 0], x: [60, 80, 60] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute top-10 right-0 w-24 h-16 bg-green-500/80 rounded-full border-4 border-green-600 origin-left -z-10"
                  />
                </>
              )}
            </div>

            {/* Tails */}
            <div className="absolute inset-0 flex justify-center items-end pointer-events-none">
              {pet.type === 'cat' && (
                <motion.div 
                  animate={{ rotate: [-20, 20, -20] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-4 h-24 bg-orange-500 rounded-full border-4 border-orange-600 origin-top absolute -bottom-16 right-4"
                />
              )}
              {pet.type === 'dog' && (
                <motion.div 
                  animate={{ rotate: [-30, 30, -30] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="w-4 h-16 bg-blue-500 rounded-full border-4 border-blue-600 origin-top absolute -bottom-8 right-8"
                />
              )}
              {pet.type === 'dragon' && (
                <motion.div 
                  animate={{ rotate: [-10, 10, -10], scale: [1, 1.1, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="w-8 h-32 bg-green-600 rounded-full border-4 border-green-700 origin-top absolute -bottom-24 right-0"
                />
              )}
              {pet.type === 'rabbit' && (
                <div className="w-8 h-8 bg-pink-300 rounded-full border-4 border-pink-400 absolute -bottom-2 right-8" />
              )}
            </div>

            <div className={cn(
              "rounded-[3rem] flex items-center justify-center text-white shadow-2xl relative overflow-hidden",
              isBaby ? "w-36 h-36" : "w-48 h-48",
              getPetColor()
            )}>
              {/* Internal Shine */}
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
              
              {getPetIcon(isBaby ? 72 : 96)}

              {/* Eyes */}
              <div className="absolute top-1/3 left-0 w-full flex justify-center gap-8">
                <motion.div 
                  animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                  transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
                  className="w-3 h-3 bg-white rounded-full" 
                  style={{ width: 3 * scale, height: 3 * scale }}
                />
                <motion.div 
                  animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                  transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
                  className="w-3 h-3 bg-white rounded-full" 
                  style={{ width: 3 * scale, height: 3 * scale }}
                />
              </div>

              {/* Blushed Cheeks */}
              <div className="absolute top-1/2 left-0 w-full flex justify-center gap-16 opacity-40">
                <div className="w-4 h-2 bg-pink-200 rounded-full blur-[2px]" style={{ width: 4 * scale, height: 2 * scale }} />
                <div className="w-4 h-2 bg-pink-200 rounded-full blur-[2px]" style={{ width: 4 * scale, height: 2 * scale }} />
              </div>
            </div>

            {/* Level Badge */}
            <motion.div 
              whileHover={{ scale: 1.2 }}
              className="absolute -top-4 -right-4 bg-yellow-400 text-white px-4 py-2 rounded-2xl text-lg font-black shadow-lg border-4 border-white"
              style={{ fontSize: 18 * scale }}
            >
              Lv.{pet.level}
            </motion.div>

            {/* Adult Crown/Award */}
            {isAdult && (
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute -top-10 left-1/2 -translate-x-1/2 text-yellow-500 drop-shadow-md"
              >
                <Award size={48 * scale} fill="currentColor" />
              </motion.div>
            )}

            {/* Shadow */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-6 bg-black/10 rounded-full blur-md" />
            
            {/* Reaction Emoji */}
            <AnimatePresence>
              {pet.lastReaction && (
                <motion.div
                  initial={{ opacity: 0, y: 0, scale: 0 }}
                  animate={{ opacity: 1, y: -100, scale: 1.5 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 text-4xl z-50"
                >
                  {pet.lastReaction === 'happy' && "❤️"}
                  {pet.lastReaction === 'eating' && "😋"}
                  {pet.lastReaction === 'drinking' && "💧"}
                  {pet.lastReaction === 'hatching' && "✨"}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Particles */}
            <AnimatePresence>
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0], 
                    scale: [0, 1, 0],
                    x: (i - 1) * 40 * scale,
                    y: (-60 - (i * 20)) * scale
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    delay: i * 0.6,
                    ease: "easeOut"
                  }}
                  className="absolute top-1/2 left-1/2 text-white/50"
                >
                  <Sparkles size={16 * scale} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white rounded-3xl shadow-xl border-4 border-pink-100 overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  isLoading
}: { 
  children: React.ReactNode; 
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; 
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}) => {
  const variants = {
    primary: "bg-pink-400 hover:bg-pink-500 text-white shadow-pink-200",
    secondary: "bg-blue-400 hover:bg-blue-500 text-white shadow-blue-200",
    ghost: "bg-transparent hover:bg-pink-50 text-pink-500",
    danger: "bg-red-400 hover:bg-red-500 text-white shadow-red-200",
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "px-6 py-3 rounded-full font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </button>
  );
};

export default function App() {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentList, setCurrentList] = useState<WordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'list' | 'flashcard' | 'practice' | 'dashboard' | 'pet' | 'shop'>('dashboard');
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);
  const [practiceInput, setPracticeInput] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Gamification State
  const [points, setPoints] = useState(0);
  const [pet, setPet] = useState<PetState>({
    isAdopted: false,
    type: 'none',
    stage: 'egg',
    name: '未命名',
    sunlightCount: 0,
    foodCount: 0,
    waterCount: 0,
    grassCount: 0,
    fruitCount: 0,
    level: 1,
    experience: 0,
    dailyGoalProgress: 0,
    lastStudyDate: new Date().toISOString().split('T')[0],
    speech: null
  });
  const [inventory, setInventory] = useState<Inventory>({
    sunlight: 0,
    food: 0,
    water: 0,
    grass: 0,
    fruit: 0
  });

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<PronunciationResult | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stats: StudyStats = {
    total: currentList.length,
    mastered: currentList.filter(w => w.isMastered).length,
    unmastered: currentList.filter(w => !w.isMastered).length
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedWords = localStorage.getItem('moemoe_words');
    if (savedWords) {
      try {
        const parsed = JSON.parse(savedWords);
        setCurrentList(parsed);
      } catch (e) {
        console.error("Failed to load saved words", e);
      }
    }

    const savedPoints = localStorage.getItem('moemoe_points');
    if (savedPoints) setPoints(parseInt(savedPoints));

    const savedPet = localStorage.getItem('moemoe_pet');
    if (savedPet) setPet(JSON.parse(savedPet));

    const savedInventory = localStorage.getItem('moemoe_inventory');
    if (savedInventory) setInventory(JSON.parse(savedInventory));
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (currentList.length > 0) localStorage.setItem('moemoe_words', JSON.stringify(currentList));
  }, [currentList]);

  useEffect(() => {
    localStorage.setItem('moemoe_points', points.toString());
  }, [points]);

  useEffect(() => {
    localStorage.setItem('moemoe_pet', JSON.stringify(pet));
  }, [pet]);

  useEffect(() => {
    localStorage.setItem('moemoe_inventory', JSON.stringify(inventory));
  }, [inventory]);

  const addPoints = (amount: number) => {
    setPoints(prev => prev + amount);
  };

  const completeStudyAction = (pointsAmount: number) => {
    addPoints(pointsAmount);
    setPet(prev => {
      const newProgress = prev.dailyGoalProgress + 1;
      let speech = prev.speech;
      if (newProgress === DAILY_GOAL) {
        speech = "太棒了！今天的学习目标完成啦！奖励你一个大大的拥抱！";
      } else if (newProgress < DAILY_GOAL) {
        speech = `加油！再完成 ${DAILY_GOAL - newProgress} 个练习就达到今天的目标了！`;
      }
      return { ...prev, dailyGoalProgress: newProgress, speech };
    });
    // Clear speech after 5 seconds
    setTimeout(() => {
      setPet(prev => ({ ...prev, speech: null }));
    }, 5000);
  };

  const petThePet = () => {
    if (!pet.isAdopted) return;
    const messages = [
      "摸摸头，真舒服呀！",
      "主人最棒了，我们一起加油学习吧！",
      "今天也要元气满满哦！",
      "你读单词的声音真好听！",
      "别忘了完成今天的学习目标哦！"
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    setPet(prev => ({ 
      ...prev, 
      lastReaction: 'happy',
      speech: randomMessage 
    }));
    
    setTimeout(() => {
      setPet(prev => ({ ...prev, lastReaction: null, speech: null }));
    }, 3000);
  };

  // Daily reset logic
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (pet.lastStudyDate !== today) {
      setPet(prev => ({
        ...prev,
        dailyGoalProgress: 0,
        lastStudyDate: today,
        speech: "新的一天开始啦！今天要也要加油学习哦！"
      }));
      setTimeout(() => {
        setPet(prev => ({ ...prev, speech: null }));
      }, 5000);
    }
  }, [pet.lastStudyDate]);

  const startRecording = async (target: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setLastRecordingUrl(url);
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setIsLoading(true);
          const result = await evaluatePronunciation(target, base64Audio);
          setEvaluationResult(result);
          setIsLoading(false);
          
          // Award points based on score
          if (result.score >= 60) {
            completeStudyAction(3);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      setRecordingTarget(target);
      setEvaluationResult(null);
      setLastRecordingUrl(null);
      setIsRecording(true);
      mediaRecorder.start();
    } catch (err) {
      console.error("Microphone error:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('dismissed')) {
        alert("麦克风权限被拒绝或取消了。请在浏览器地址栏点击锁形图标，开启麦克风权限，然后刷新页面重试。");
      } else {
        alert("无法访问麦克风，请检查权限。");
      }
    }
  };

  const playLastRecording = () => {
    if (lastRecordingUrl) {
      const audio = new Audio(lastRecordingUrl);
      audio.play();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const buyItem = (item: keyof Inventory, cost: number) => {
    if (points >= cost) {
      setPoints(prev => prev - cost);
      setInventory(prev => ({ ...prev, [item]: prev[item] + 1 }));
    } else {
      alert("积分不足哦，快去学习赚取积分吧！");
    }
  };

  const useItem = (item: keyof Inventory) => {
    if (inventory[item] > 0) {
      setInventory(prev => ({ ...prev, [item]: prev[item] - 1 }));
      
      const triggerReaction = (reaction: PetState['lastReaction']) => {
        setPet(prev => ({ ...prev, lastReaction: reaction }));
        setTimeout(() => {
          setPet(prev => ({ ...prev, lastReaction: null }));
        }, 2000);
      };

      if (item === 'sunlight') {
        setPet(prev => {
          const newSunlight = prev.sunlightCount + 1;
          let newStage = prev.stage;
          if (newSunlight >= 3 && prev.stage === 'egg') {
            newStage = 'baby';
            triggerReaction('hatching');
            alert("哇！宠物蛋孵化啦！变成小可爱了！");
          } else {
            triggerReaction('happy');
          }
          return { ...prev, sunlightCount: newSunlight, stage: newStage };
        });
      } else if (item === 'food' || item === 'grass' || item === 'fruit') {
        triggerReaction('eating');
        setPet(prev => {
          const expGain = item === 'food' ? 20 : item === 'grass' ? 10 : 30;
          const newExperience = prev.experience + expGain;
          let newLevel = prev.level;
          let newStage = prev.stage;
          if (newExperience >= 100) {
            newLevel += 1;
            if (newLevel >= 5 && prev.stage === 'baby') {
              newStage = 'adult';
              alert("恭喜！你的宠物长大了！");
            }
            return { ...prev, level: newLevel, experience: 0, stage: newStage };
          }
          return { ...prev, experience: newExperience };
        });
      } else if (item === 'water') {
        triggerReaction('drinking');
        setPet(prev => ({ ...prev, waterCount: prev.waterCount + 1 }));
        alert("宠物喝了水，感觉很有精神！");
      }
    }
  };

  const adoptPet = (type: PetState['type'], name: string) => {
    if (points >= 10) {
      setPoints(prev => prev - 10);
      setPet(prev => ({
        ...prev,
        isAdopted: true,
        type,
        name,
        stage: 'egg'
      }));
    } else {
      alert("积分不足，领养宠物需要 10 积分哦！快去学习吧！");
    }
  };

  const speak = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        // Gemini TTS returns raw 16-bit PCM at 24kHz
        const pcmData = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          float32Data[i] = pcmData[i] / 32768.0;
        }

        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
    }
  };

  const toggleMastery = (id: string) => {
    setCurrentList(prev => prev.map(w => w.id === id ? { ...w, isMastered: !w.isMastered } : w));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      let wordsToProcess: string[] = [];
      
      if (selectedImage) {
        const base64 = selectedImage.split(',')[1];
        wordsToProcess = await extractWordsFromImage(base64);
      } else if (inputText.trim()) {
        wordsToProcess = inputText.split(/[,\s\n]+/).filter(w => w.trim().length > 0);
      }

      if (wordsToProcess.length > 0) {
        const details = await generateWordDetails(wordsToProcess);
        setCurrentList(prev => {
          const existingWords = new Set(prev.map(w => w.word.toLowerCase()));
          const newWords = details.filter(d => !existingWords.has(d.word.toLowerCase()));
          return [...prev, ...newWords];
        });
        setViewMode('list');
        setInputText('');
        setSelectedImage(null);
      }
    } catch (error) {
      alert("生成失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePracticeSubmit = () => {
    const currentWord = currentList.filter(w => !w.isMastered)[flashcardIndex];
    if (practiceInput.trim().toLowerCase() === currentWord.word.toLowerCase()) {
      setPracticeFeedback('correct');
      completeStudyAction(5); // Correct spelling awards 5 points
    } else {
      setPracticeFeedback('wrong');
    }
  };

  const nextPractice = () => {
    const unmastered = currentList.filter(w => !w.isMastered);
    if (flashcardIndex < unmastered.length - 1) {
      setFlashcardIndex(prev => prev + 1);
      setPracticeInput('');
      setPracticeFeedback(null);
    } else {
      // Finished practice
      setViewMode('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF5F7] font-sans text-gray-800 p-4 md:p-8 selection:bg-pink-200">
      {/* Background Decorations */}
      <div className="fixed top-10 left-10 text-pink-200 -z-10 animate-bounce duration-[3s]">
        <Cloud size={80} fill="currentColor" />
      </div>
      <div className="fixed bottom-20 right-10 text-blue-100 -z-10 animate-pulse duration-[4s]">
        <Star size={100} fill="currentColor" />
      </div>
      <div className="fixed top-1/2 right-20 text-yellow-100 -z-10">
        <Heart size={60} fill="currentColor" />
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block"
          >
            <div className="flex items-center justify-center gap-3 mb-2">
              <Sparkles className="text-pink-500 w-8 h-8" />
              <h1 className="text-4xl md:text-5xl font-black text-pink-600 tracking-tight">
                萌萌单词本
              </h1>
              <Sparkles className="text-pink-500 w-8 h-8" />
            </div>
            <p className="text-pink-400 font-medium text-lg">
              四年级英语（新版人教版）学习好帮手 ✨
            </p>
          </motion.div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-2 md:gap-4 mb-8">
          <Button 
            variant={viewMode === 'dashboard' ? 'primary' : 'ghost'} 
            onClick={() => setViewMode('dashboard')}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <BarChart3 className="w-4 h-4 md:w-5 md:h-5" /> 进度
          </Button>
          <Button 
            variant={viewMode === 'list' ? 'primary' : 'ghost'} 
            onClick={() => setViewMode('list')}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <BookOpen className="w-4 h-4 md:w-5 md:h-5" /> 列表
          </Button>
          <Button 
            variant={viewMode === 'practice' ? 'secondary' : 'ghost'} 
            onClick={() => {
              if (stats.unmastered === 0) {
                alert("太棒了！你已经掌握了所有单词，快去添加新单词吧！");
                return;
              }
              setViewMode('practice');
              setFlashcardIndex(0);
              setPracticeInput('');
              setPracticeFeedback(null);
            }}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <PenTool className="w-4 h-4 md:w-5 md:h-5" /> 默写
          </Button>
          <Button 
            variant={viewMode === 'pet' ? 'secondary' : 'ghost'} 
            onClick={() => setViewMode('pet')}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <Heart className="w-4 h-4 md:w-5 md:h-5" /> 宠物
          </Button>
          <Button 
            variant={viewMode === 'shop' ? 'secondary' : 'ghost'} 
            onClick={() => setViewMode('shop')}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <ShoppingBag className="w-4 h-4 md:w-5 md:h-5" /> 超市
          </Button>
          <Button 
            variant={viewMode === 'input' ? 'primary' : 'ghost'} 
            onClick={() => setViewMode('input')}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <Plus className="w-4 h-4 md:w-5 md:h-5" /> 添加
          </Button>
        </div>

        {/* Points Display */}
        <div className="flex justify-center mb-6">
          <div className="bg-white px-6 py-2 rounded-full border-4 border-yellow-100 shadow-sm flex items-center gap-2">
            <Star className="text-yellow-400" fill="currentColor" size={20} />
            <span className="font-black text-yellow-600 text-xl">{points} 积分</span>
          </div>
        </div>

        <main>
          <AnimatePresence mode="wait">
            {/* Dashboard View */}
            {viewMode === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="p-6 bg-white flex flex-col items-center text-center">
                    <div className="bg-blue-100 p-4 rounded-full text-blue-500 mb-4">
                      <BookOpen size={32} />
                    </div>
                    <h3 className="text-gray-500 font-bold mb-1">总单词数</h3>
                    <p className="text-4xl font-black text-blue-600">{stats.total}</p>
                  </Card>
                  <Card className="p-6 bg-white flex flex-col items-center text-center">
                    <div className="bg-green-100 p-4 rounded-full text-green-500 mb-4">
                      <Trophy size={32} />
                    </div>
                    <h3 className="text-gray-500 font-bold mb-1">已掌握</h3>
                    <p className="text-4xl font-black text-green-600">{stats.mastered}</p>
                  </Card>
                  <Card className="p-6 bg-white flex flex-col items-center text-center">
                    <div className="bg-pink-100 p-4 rounded-full text-pink-500 mb-4">
                      <Star size={32} />
                    </div>
                    <h3 className="text-gray-500 font-bold mb-1">待复习</h3>
                    <p className="text-4xl font-black text-pink-600">{stats.unmastered}</p>
                  </Card>
                </div>

                {/* Pet Summary Card */}
                <Card className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
                  {!pet.isAdopted ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-pink-300 shadow-inner">
                          <Heart size={32} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-yellow-800">还没有领养宠物哦</h3>
                          <p className="text-yellow-600 text-sm">快去领养一只可爱的小伙伴吧！</p>
                        </div>
                      </div>
                      <Button variant="secondary" onClick={() => setViewMode('pet')}>
                        去领养
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
                        <PetVisual pet={pet} scale={0.5} onPet={petThePet} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-black text-yellow-700">{pet.name} (Lv.{pet.level})</h3>
                        <p className="text-yellow-600 text-sm mb-2">
                          {pet.stage === 'egg' ? `还需要 ${3 - pet.sunlightCount} 次日照孵化` : 
                           pet.stage === 'baby' ? `成长进度: ${pet.experience}%` : 
                           "已经长成大可爱啦！"}
                        </p>
                        <div className="w-full h-3 bg-white/50 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${pet.stage === 'egg' ? (pet.sunlightCount / 3) * 100 : pet.experience}%` }}
                            className="h-full bg-yellow-400"
                          />
                        </div>
                      </div>
                      <Button variant="secondary" onClick={() => setViewMode('pet')}>
                        去照看它
                      </Button>
                    </div>
                  )}
                </Card>

                {stats.total === 0 ? (
                  <Card className="p-12 text-center">
                    <div className="bg-pink-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-pink-300">
                      <Plus size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">还没有单词哦</h2>
                    <p className="text-gray-500 mb-8">快去拍照或手动输入你想要学习的单词吧！</p>
                    <Button onClick={() => setViewMode('input')} className="px-12">
                      去添加单词
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <BarChart3 className="text-pink-500" /> 学习建议
                      </h2>
                    </div>
                    
                    {stats.unmastered > 0 ? (
                      <Card className="p-8 bg-gradient-to-br from-pink-50 to-white border-pink-200">
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-pink-600 mb-2">加油！还有 {stats.unmastered} 个单词没掌握</h3>
                            <p className="text-gray-600 mb-6">建议先通过“闪卡复习”熟悉含义，再进行“默写练习”巩固记忆。</p>
                            <div className="flex gap-4">
                              <Button variant="secondary" onClick={() => setViewMode('practice')}>
                                开始默写练习 <ArrowRight size={18} />
                              </Button>
                            </div>
                          </div>
                          <div className="w-32 h-32 relative">
                            <svg className="w-full h-full" viewBox="0 0 36 36">
                              <path
                                className="text-pink-100"
                                strokeDasharray="100, 100"
                                strokeWidth="3"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className="text-pink-500"
                                strokeDasharray={`${(stats.mastered / stats.total) * 100}, 100`}
                                strokeWidth="3"
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-black text-pink-600">
                              {Math.round((stats.mastered / stats.total) * 100)}%
                            </div>
                          </div>
                        </div>
                      </Card>
                    ) : (
                      <Card className="p-12 text-center bg-green-50 border-green-200">
                        <Trophy className="text-yellow-500 w-16 h-16 mx-auto mb-4 animate-bounce" />
                        <h3 className="text-2xl font-bold text-green-700 mb-2">太棒了！全满贯！</h3>
                        <p className="text-green-600">你已经掌握了当前列表中的所有单词。继续保持哦！</p>
                      </Card>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Pet View */}
            {viewMode === 'pet' && (
              <motion.div
                key="pet"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center w-full"
              >
                {!pet.isAdopted ? (
                  <Card className="w-full max-w-2xl p-8 md:p-12 text-center bg-white">
                    <div className="bg-pink-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-pink-400">
                      <Heart size={48} fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-black text-gray-800 mb-4">领养你的小宠物</h2>
                    <p className="text-gray-500 mb-8">领养一只可爱的小宠物陪你一起学习吧！领养需要消耗 <span className="text-pink-500 font-bold">10 积分</span>。</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                      {[
                        { type: 'cat', name: '小猫咪', icon: <Heart size={32} fill="currentColor" />, color: 'bg-orange-100 text-orange-500' },
                        { type: 'dog', name: '小狗狗', icon: <Star size={32} fill="currentColor" />, color: 'bg-blue-100 text-blue-500' },
                        { type: 'rabbit', name: '小兔子', icon: <Cloud size={32} fill="currentColor" />, color: 'bg-pink-100 text-pink-500' },
                        { type: 'dragon', name: '小恐龙', icon: <Sparkles size={32} fill="currentColor" />, color: 'bg-green-100 text-green-500' },
                      ].map((p) => (
                        <button
                          key={p.type}
                          onClick={() => adoptPet(p.type as any, p.name)}
                          className={cn(
                            "p-6 rounded-3xl flex flex-col items-center gap-3 transition-all hover:scale-105 active:scale-95 border-4 border-transparent hover:border-pink-200",
                            p.color
                          )}
                        >
                          {p.icon}
                          <span className="font-bold">{p.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-2 text-yellow-600 font-bold">
                      <Star fill="currentColor" size={20} /> 当前积分: {points}
                    </div>
                  </Card>
                ) : (
                  <Card className="w-full max-w-2xl p-12 text-center bg-gradient-to-b from-blue-50 to-white overflow-hidden">
                    <div className="relative mb-16 py-8">
                      <PetVisual pet={pet} onPet={petThePet} />
                    </div>

                    <div className="flex items-center justify-center gap-3 mb-2">
                      <h2 className="text-3xl font-black text-gray-800">{pet.name}</h2>
                      <button 
                        onClick={() => {
                          const newName = prompt("给你的宠物起个新名字吧：", pet.name);
                          if (newName) setPet(prev => ({ ...prev, name: newName }));
                        }}
                        className="text-gray-400 hover:text-pink-500 transition-colors"
                      >
                        <PenTool size={18} />
                      </button>
                    </div>
                    <p className="text-gray-500 mb-8">
                      {pet.stage === 'egg' ? "它还在蛋壳里睡觉呢，需要日照来孵化哦！" : 
                       pet.stage === 'baby' ? "它饿了，快给它喂点好吃的吧！" : 
                       "它已经长成大可爱了，继续学习让它更强大！"}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-3xl border-4 border-yellow-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <Sun className="text-yellow-500" size={20} />
                          <span className="font-bold text-yellow-600">x{inventory.sunlight}</span>
                        </div>
                        <Button 
                          variant="secondary" 
                          disabled={inventory.sunlight === 0 || pet.stage !== 'egg'}
                          onClick={() => useItem('sunlight')}
                          className="w-full py-2 text-sm"
                        >
                          晒太阳
                        </Button>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border-4 border-green-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <Utensils className="text-green-500" size={20} />
                          <span className="font-bold text-green-600">x{inventory.food}</span>
                        </div>
                        <Button 
                          variant="primary" 
                          disabled={inventory.food === 0 || pet.stage === 'egg'}
                          onClick={() => useItem('food')}
                          className="w-full py-2 text-sm bg-green-500 hover:bg-green-600"
                        >
                          喂粮食
                        </Button>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border-4 border-blue-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <Cloud className="text-blue-500" size={20} />
                          <span className="font-bold text-blue-600">x{inventory.water}</span>
                        </div>
                        <Button 
                          variant="secondary" 
                          disabled={inventory.water === 0 || pet.stage === 'egg'}
                          onClick={() => useItem('water')}
                          className="w-full py-2 text-sm bg-blue-400 hover:bg-blue-500"
                        >
                          喝点水
                        </Button>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border-4 border-emerald-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <Plus className="text-emerald-500" size={20} />
                          <span className="font-bold text-emerald-600">x{inventory.grass}</span>
                        </div>
                        <Button 
                          variant="secondary" 
                          disabled={inventory.grass === 0 || pet.stage === 'egg'}
                          onClick={() => useItem('grass')}
                          className="w-full py-2 text-sm bg-emerald-500 hover:bg-emerald-600"
                        >
                          吃青草
                        </Button>
                      </div>
                      <div className="bg-white p-4 rounded-3xl border-4 border-red-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <Heart className="text-red-500" size={20} />
                          <span className="font-bold text-red-600">x{inventory.fruit}</span>
                        </div>
                        <Button 
                          variant="secondary" 
                          disabled={inventory.fruit === 0 || pet.stage === 'egg'}
                          onClick={() => useItem('fruit')}
                          className="w-full py-2 text-sm bg-red-500 hover:bg-red-600"
                        >
                          吃水果
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Shop View */}
            {viewMode === 'shop' && (
              <motion.div
                key="shop"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <h2 className="text-3xl font-black text-pink-600 flex items-center justify-center gap-3">
                    <ShoppingBag /> 萌萌积分超市
                  </h2>
                  <p className="text-gray-500 mt-2">用你的努力换取宠物的成长物资吧！</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className="p-8 flex flex-col items-center text-center hover:border-blue-200 transition-all">
                    <div className="bg-blue-100 p-6 rounded-full text-blue-500 mb-6">
                      <Cloud size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">清凉饮水</h3>
                    <p className="text-gray-500 mb-6">宠物口渴时的解渴良药，让它更有精神。</p>
                    <div className="mt-auto w-full">
                      <div className="flex items-center justify-center gap-2 mb-4 text-blue-600 font-black text-xl">
                        <Star fill="currentColor" size={20} /> 10 积分
                      </div>
                      <Button onClick={() => buyItem('water', 10)} className="w-full bg-blue-500 hover:bg-blue-600">
                        立即兑换
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-8 flex flex-col items-center text-center hover:border-yellow-200 transition-all">
                    <div className="bg-yellow-100 p-6 rounded-full text-yellow-500 mb-6">
                      <Sun size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">温暖日照</h3>
                    <p className="text-gray-500 mb-6">帮助宠物蛋孵化的必备物资，暖洋洋的阳光。</p>
                    <div className="mt-auto w-full">
                      <div className="flex items-center justify-center gap-2 mb-4 text-yellow-600 font-black text-xl">
                        <Star fill="currentColor" size={20} /> 20 积分
                      </div>
                      <Button onClick={() => buyItem('sunlight', 20)} className="w-full">
                        立即兑换
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-8 flex flex-col items-center text-center hover:border-green-200 transition-all">
                    <div className="bg-green-100 p-6 rounded-full text-green-500 mb-6">
                      <Utensils size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">营养粮食</h3>
                    <p className="text-gray-500 mb-6">让宠物快速升级的美味食物，营养均衡。</p>
                    <div className="mt-auto w-full">
                      <div className="flex items-center justify-center gap-2 mb-4 text-green-600 font-black text-xl">
                        <Star fill="currentColor" size={20} /> 30 积分
                      </div>
                      <Button onClick={() => buyItem('food', 30)} className="w-full bg-green-500 hover:bg-green-600">
                        立即兑换
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-8 flex flex-col items-center text-center hover:border-emerald-200 transition-all">
                    <div className="bg-emerald-100 p-6 rounded-full text-emerald-500 mb-6">
                      <Plus size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">鲜嫩青草</h3>
                    <p className="text-gray-500 mb-6">宠物最爱的小零食，虽然经验加得少但很开心。</p>
                    <div className="mt-auto w-full">
                      <div className="flex items-center justify-center gap-2 mb-4 text-emerald-600 font-black text-xl">
                        <Star fill="currentColor" size={20} /> 30 积分
                      </div>
                      <Button onClick={() => buyItem('grass', 30)} className="w-full bg-emerald-500 hover:bg-emerald-600">
                        立即兑换
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-8 flex flex-col items-center text-center hover:border-red-200 transition-all">
                    <div className="bg-red-100 p-6 rounded-full text-red-500 mb-6">
                      <Heart size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">甜美水果</h3>
                    <p className="text-gray-500 mb-6">高级成长物资，能提供大量的成长经验。</p>
                    <div className="mt-auto w-full">
                      <div className="flex items-center justify-center gap-2 mb-4 text-red-600 font-black text-xl">
                        <Star fill="currentColor" size={20} /> 30 积分
                      </div>
                      <Button onClick={() => buyItem('fruit', 30)} className="w-full bg-red-500 hover:bg-red-600">
                        立即兑换
                      </Button>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {/* Input View */}
            {viewMode === 'input' && (
              <motion.div
                key="input"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
              >
                <Card className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-pink-100 p-3 rounded-2xl">
                      <Plus className="text-pink-500 w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">添加单词</h2>
                      <p className="text-gray-500 text-sm">拍照识别或手动输入单词</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Image Upload Area */}
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "relative h-48 rounded-3xl border-4 border-dashed border-pink-100 bg-pink-50/30 flex flex-col items-center justify-center cursor-pointer hover:border-pink-200 transition-all overflow-hidden group",
                        selectedImage && "border-solid border-pink-300"
                      )}
                    >
                      {selectedImage ? (
                        <>
                          <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-white font-bold">点击更换图片</p>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImage(null);
                            }}
                            className="absolute top-2 right-2 p-1 bg-white rounded-full text-pink-500 shadow-md hover:scale-110 transition-transform"
                          >
                            <X size={20} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="bg-white p-4 rounded-full shadow-lg text-pink-400 mb-3 group-hover:scale-110 transition-transform">
                            <Camera size={32} />
                          </div>
                          <p className="text-pink-400 font-bold">点击拍照或上传图片</p>
                          <p className="text-pink-300 text-xs mt-1">自动识别课本中的单词</p>
                        </>
                      )}
                    </div>

                    {/* Text Input Area */}
                    <div className="flex flex-col">
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="或者在这里手动输入单词..."
                        className="flex-1 p-6 rounded-3xl border-4 border-pink-50 focus:border-pink-200 outline-none transition-all text-lg font-medium resize-none bg-pink-50/30 placeholder:text-pink-200"
                      />
                    </div>
                  </div>

                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                  />
                  
                  <div className="flex justify-center">
                    <Button 
                      onClick={handleGenerate} 
                      isLoading={isLoading}
                      disabled={!inputText.trim() && !selectedImage}
                      className="text-xl px-12 py-4"
                    >
                      {selectedImage ? "识别并生成 ✨" : "开始生成原件 ✨"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <motion.div
                key="list"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="space-y-6"
              >
                {/* Evaluation Result Overlay */}
                <AnimatePresence>
                  {evaluationResult && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
                      onClick={() => setEvaluationResult(null)}
                    >
                      <Card className="w-full max-w-sm p-8 text-center bg-white shadow-2xl border-pink-200">
                        <div className={cn(
                          "w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-white text-3xl font-black shadow-lg",
                          evaluationResult.score >= 90 ? "bg-green-500" :
                          evaluationResult.score >= 80 ? "bg-blue-500" :
                          evaluationResult.score >= 60 ? "bg-yellow-500" : "bg-red-500"
                        )}>
                          {evaluationResult.score}
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">
                          {evaluationResult.score >= 90 ? "太棒了！" :
                           evaluationResult.score >= 80 ? "很不错哦！" :
                           evaluationResult.score >= 60 ? "加油！" : "再试一次吧"}
                        </h3>
                        <p className="text-gray-500 mb-6">{evaluationResult.feedback}</p>
                        <div className="flex items-center justify-center gap-2 text-yellow-600 font-bold mb-6">
                          <Star fill="currentColor" size={20} /> +1 积分
                        </div>
                        <div className="flex flex-col gap-3">
                          {lastRecordingUrl && (
                            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); playLastRecording(); }} className="w-full">
                              <Volume2 size={20} /> 回听我的发音
                            </Button>
                          )}
                          <Button onClick={() => setEvaluationResult(null)} className="w-full">
                            知道了
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>

                {currentList.map((entry, idx) => (
                  <motion.div
                    key={entry.id || entry.word}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="p-6 hover:border-pink-200 transition-colors group">
                      <div className="flex flex-col md:flex-row md:items-start gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <h3 className="text-3xl font-black text-pink-600">{entry.word}</h3>
                            <span className="text-gray-400 font-mono text-lg">[{entry.phonetic}]</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => speak(entry.word)}
                                disabled={isSpeaking}
                                title="朗读单词"
                                className={cn(
                                  "p-2 rounded-full transition-colors",
                                  isSpeaking ? "bg-gray-100 text-gray-300" : "bg-pink-50 text-pink-400 hover:bg-pink-100"
                                )}
                              >
                                {isSpeaking ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                              </button>
                              <button 
                                onClick={() => isRecording ? stopRecording() : startRecording(entry.word)}
                                className={cn(
                                  "p-2 rounded-full transition-colors",
                                  isRecording && recordingTarget === entry.word ? "bg-red-500 text-white animate-pulse" : "bg-blue-50 text-blue-400 hover:bg-blue-100"
                                )}
                                title="跟着朗读"
                              >
                                {isRecording && recordingTarget === entry.word ? <MicOff size={20} /> : <Mic size={20} />}
                              </button>
                            </div>
                          </div>
                          <p className="text-xl font-bold text-gray-700 mb-4">
                            {entry.meaning}
                          </p>
                          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 relative group/sentence">
                            <p className="text-blue-700 font-medium italic mb-1 pr-10">
                              "{entry.example}"
                            </p>
                            <p className="text-blue-500 text-sm">
                              {entry.exampleTranslation}
                            </p>
                            <button 
                              onClick={() => speak(entry.example)}
                              disabled={isSpeaking}
                              title="朗读句子"
                              className={cn(
                                "absolute top-4 right-4 p-2 rounded-full transition-opacity hover:bg-blue-200",
                                isSpeaking ? "bg-gray-100 text-gray-300 opacity-100" : "bg-blue-100 text-blue-500 opacity-0 group-hover/sentence:opacity-100"
                              )}
                            >
                              {isSpeaking ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} />}
                            </button>
                            <button 
                              onClick={() => isRecording ? stopRecording() : startRecording(entry.example)}
                              className={cn(
                                "absolute bottom-4 right-4 p-2 rounded-full transition-opacity hover:bg-blue-200",
                                isRecording && recordingTarget === entry.example ? "bg-red-500 text-white animate-pulse opacity-100" : "bg-blue-50 text-blue-400 opacity-0 group-hover/sentence:opacity-100"
                              )}
                              title="跟着朗读句子"
                            >
                              {isRecording && recordingTarget === entry.example ? <MicOff size={20} /> : <Mic size={20} />}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-row md:flex-col items-center justify-center gap-4">
                          <button 
                            onClick={() => toggleMastery(entry.id)}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all",
                              entry.isMastered 
                                ? "bg-green-100 text-green-600 border-2 border-green-200" 
                                : "bg-gray-100 text-gray-400 border-2 border-gray-200 hover:border-pink-200 hover:text-pink-400"
                            )}
                          >
                            {entry.isMastered ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                            {entry.isMastered ? "已掌握" : "未掌握"}
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm("确定要删除这个单词吗？")) {
                                setCurrentList(prev => prev.filter(w => w.id !== entry.id));
                              }
                            }}
                            className="p-2 text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
                
                <div className="flex justify-center pt-8">
                  <Button variant="ghost" onClick={() => setViewMode('input')}>
                    <RefreshCw className="w-5 h-5" /> 重新输入
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Practice View */}
            {viewMode === 'practice' && (
              <motion.div
                key="practice"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                {currentList.filter(w => !w.isMastered).length > 0 ? (
                  <div className="w-full max-w-2xl">
                    <Card className="p-8 md:p-12 text-center">
                      <div className="mb-8">
                        <span className="bg-pink-100 text-pink-500 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-widest">
                          默写练习
                        </span>
                        <h2 className="text-4xl font-black text-gray-800 mt-4 mb-2">
                          {currentList.filter(w => !w.isMastered)[flashcardIndex].meaning}
                        </h2>
                        <div className="flex justify-center gap-4">
                          <button 
                            onClick={() => speak(currentList.filter(w => !w.isMastered)[flashcardIndex].word)}
                            disabled={isSpeaking}
                            className="flex items-center gap-2 text-pink-400 hover:text-pink-600 font-bold disabled:opacity-50"
                          >
                            {isSpeaking ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />} 听发音
                          </button>
                          <button 
                            onClick={() => speak(currentList.filter(w => !w.isMastered)[flashcardIndex].example)}
                            disabled={isSpeaking}
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-600 font-bold disabled:opacity-50"
                          >
                            {isSpeaking ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} />} 听例句
                          </button>
                        </div>
                      </div>

                      <div className="relative mb-8">
                        <input
                          type="text"
                          value={practiceInput}
                          onChange={(e) => setPracticeInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePracticeSubmit()}
                          placeholder="在这里输入英文单词..."
                          className={cn(
                            "w-full p-6 rounded-3xl border-4 outline-none transition-all text-3xl font-black text-center tracking-wider",
                            practiceFeedback === 'correct' ? "border-green-400 bg-green-50 text-green-600" :
                            practiceFeedback === 'wrong' ? "border-red-400 bg-red-50 text-red-600" :
                            "border-pink-100 focus:border-pink-300 bg-pink-50/30"
                          )}
                          autoFocus
                        />
                        {practiceFeedback === 'correct' && (
                          <motion.div 
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="absolute -top-4 -right-4 bg-green-500 text-white p-2 rounded-full shadow-lg"
                          >
                            <CheckCircle2 size={32} />
                          </motion.div>
                        )}
                      </div>

                      {practiceFeedback === 'wrong' && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 font-bold mb-6">
                          哎呀，写错了哦！正确答案是: <span className="text-2xl">{currentList.filter(w => !w.isMastered)[flashcardIndex].word}</span>
                        </motion.p>
                      )}

                      <div className="flex justify-center gap-4">
                        {practiceFeedback === null ? (
                          <Button onClick={handlePracticeSubmit} className="px-12 py-4 text-xl">
                            检查拼写
                          </Button>
                        ) : (
                          <div className="flex gap-4">
                            {practiceFeedback === 'correct' && (
                              <Button 
                                variant="secondary" 
                                onClick={() => {
                                  const wordId = currentList.filter(w => !w.isMastered)[flashcardIndex].id;
                                  toggleMastery(wordId);
                                  nextPractice();
                                }}
                              >
                                掌握了，下一个！
                              </Button>
                            )}
                            <Button variant="ghost" onClick={nextPractice}>
                              {practiceFeedback === 'wrong' ? "记住了，下一个" : "跳过"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                    
                    <div className="mt-8 text-center text-pink-400 font-bold flex items-center justify-center gap-6">
                      <span>进度: {flashcardIndex + 1} / {currentList.filter(w => !w.isMastered).length}</span>
                      <Button variant="ghost" onClick={() => setViewMode('dashboard')} className="text-gray-400">
                        暂时退出
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Card className="p-12 text-center">
                    <Trophy className="text-yellow-500 w-20 h-20 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-gray-800 mb-4">全部完成啦！</h2>
                    <p className="text-gray-500 mb-8">你已经默写完了所有待复习的单词。太棒了！</p>
                    <Button onClick={() => setViewMode('dashboard')}>
                      回到进度页面
                    </Button>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Flashcard View */}
            {viewMode === 'flashcard' && (
              <motion.div
                key="flashcard"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <div className="w-full max-w-md perspective-1000">
                  <motion.div
                    animate={{ rotateY: showFlashcardBack ? 180 : 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="relative w-full h-96 preserve-3d cursor-pointer"
                    onClick={() => setShowFlashcardBack(!showFlashcardBack)}
                  >
                    {/* Front */}
                    <div className={cn(
                      "absolute inset-0 backface-hidden bg-white rounded-[3rem] shadow-2xl border-8 border-pink-100 flex flex-col items-center justify-center p-8",
                      showFlashcardBack && "pointer-events-none"
                    )}>
                      <Star className="text-yellow-400 mb-6 w-12 h-12 animate-pulse" fill="currentColor" />
                      <h2 className="text-6xl font-black text-pink-600 mb-4">
                        {currentList[flashcardIndex].word}
                      </h2>
                      <p className="text-gray-400 font-mono text-xl">
                        [{currentList[flashcardIndex].phonetic}]
                      </p>
                      <p className="mt-8 text-pink-300 text-sm font-bold uppercase tracking-widest">
                        点击翻面查看含义
                      </p>
                    </div>

                    {/* Back */}
                    <div className={cn(
                      "absolute inset-0 backface-hidden bg-pink-500 rounded-[3rem] shadow-2xl border-8 border-pink-400 flex flex-col items-center justify-center p-8 text-white rotate-y-180",
                      !showFlashcardBack && "pointer-events-none"
                    )}>
                      <h2 className="text-4xl font-bold mb-6">
                        {currentList[flashcardIndex].meaning}
                      </h2>
                      <div className="text-center space-y-4">
                        <p className="text-lg italic opacity-90">
                          "{currentList[flashcardIndex].example}"
                        </p>
                        <p className="text-sm opacity-75">
                          {currentList[flashcardIndex].exampleTranslation}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        className="mt-8 text-white hover:bg-white/20"
                        disabled={isSpeaking}
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(currentList[flashcardIndex].word);
                        }}
                      >
                        {isSpeaking ? <Loader2 className="animate-spin" /> : <Volume2 />} 发音
                      </Button>
                    </div>
                  </motion.div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-8 mt-12">
                  <button 
                    onClick={() => {
                      setFlashcardIndex(prev => Math.max(0, prev - 1));
                      setShowFlashcardBack(false);
                    }}
                    disabled={flashcardIndex === 0}
                    className="p-4 rounded-full bg-white shadow-lg text-pink-500 disabled:opacity-30 active:scale-90 transition-all"
                  >
                    <ChevronLeft size={32} />
                  </button>
                  
                  <div className="text-pink-600 font-black text-2xl">
                    {flashcardIndex + 1} / {currentList.length}
                  </div>

                  <button 
                    onClick={() => {
                      setFlashcardIndex(prev => Math.min(currentList.length - 1, prev + 1));
                      setShowFlashcardBack(false);
                    }}
                    disabled={flashcardIndex === currentList.length - 1}
                    className="p-4 rounded-full bg-white shadow-lg text-pink-500 disabled:opacity-30 active:scale-90 transition-all"
                  >
                    <ChevronRight size={32} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer Info */}
        <footer className="mt-20 text-center text-pink-300 text-sm pb-10">
          <p>由 AI 老师精心准备 • 祝你学习进步！加油鸭！🦆</p>
        </footer>
      </div>

      {/* Global Styles for Flashcard Flip */}
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
