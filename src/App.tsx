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
  Award,
  Crown,
  Check
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
  type: 'english' | 'chinese';
}

interface StudyStats {
  total: number;
  mastered: number;
  unmastered: number;
}

interface PetState {
  isAdopted: boolean;
  type: 'cat' | 'dog' | 'rabbit' | 'dragon' | 'pig' | 'elephant' | 'panda' | 'penguin' | 'frog' | 'fox' | 'monkey' | 'koala' | 'tiger' | 'giraffe' | 'bear' | 'chick' | 'bee' | 'lion' | 'octopus' | 'zebra' | 'cow' | 'crab' | 'raccoon' | 'starfish' | 'axolotl' | 'none';
  stage: 'egg' | 'baby' | 'adult';
  name: string;
  sunlightCount: number;
  foodCount: number;
  waterCount: number;
  grassCount: number;
  fruitCount: number;
  level: number;
  experience: number;
  lastReaction?: 'happy' | 'eating' | 'drinking' | 'hatching' | 'sunbathing' | null;
  dailyGoalProgress: number;
  lastStudyDate: string;
  speech: string | null;
  hasChangedPet?: boolean;
  learningPower: number;
}

interface ChildProfile {
  id: 'child1' | 'child2';
  grade: number;
  pet: PetState;
  words: WordEntry[];
  points: number;
  inventory: Inventory;
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

async function evaluatePronunciation(targetText: string, audioBase64: string, type: 'english' | 'chinese'): Promise<PronunciationResult> {
  const prompt = type === 'english' 
    ? `你是一个小学英语老师。请听这段音频，并将其与目标文本 "${targetText}" 进行比较。
  
  请根据以下标准评分（0-100）：
  - 100分：发音完美，语调自然。
  - 90分以上：非常接近原音，发音清晰。
  - 80分以上：发音基本准确，有个别小瑕疵。
  - 70分以下：发音不准，需要多加练习。
  
  请返回 JSON 格式，包含 score (数字) 和 feedback (简短的中文鼓励性评价)。`
    : `你是一个小学语文老师。请听这段音频，并将其与目标汉字/词语 "${targetText}" 的发音进行比较。
  
  请根据以下标准评分（0-100）：
  - 100分：字正腔圆，发音标准。
  - 90分以上：发音清晰准确。
  - 80分以上：发音基本正确。
  - 70分以下：发音不准，需要多加练习。
  
  请返回 JSON 格式，包含 score (数字) 和 feedback (简短的中文鼓励性评价)。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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

async function extractWordsFromImage(base64Data: string, grade: number): Promise<string[]> {
  const prompt = `请识别这张图片中的所有英语单词或中文生字。这些通常是小学${grade}年级课本上的内容。请只返回单词或生字列表，用逗号隔开。`;
  
  const mimeType = base64Data.split(';')[0].split(':')[1] || 'image/jpeg';
  const base64 = base64Data.split(',')[1];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              mimeType: mimeType, 
              data: base64
            } 
          }
        ]
      }
    });

    const text = response.text;
    if (!text) return [];
    return text.split(/[,\s\n]+/).filter(w => w.trim().length > 0);
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
}

async function generateWordDetails(words: string[], grade: number): Promise<WordEntry[]> {
  if (words.length === 0) return [];
  
  const prompt = `你是一个小学老师。请为以下${grade}年级单词或生字提供详细解析。
  列表：${words.join(', ')}
  
  要求：
  1. 如果是英语单词，提供音标；如果是中文生字，提供拼音。
  2. 提供准确的中文含义（如果是英语）或英文含义/简单中文解释（如果是中文），适合${grade}年级学生理解。
  3. 提供一个简单有趣的例句，并附带翻译。
  4. 例句要贴近${grade}年级小学生的日常生活。
  5. 标记类型 type 为 'english' 或 'chinese'。
  
  请以 JSON 数组格式返回。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
              type: { type: Type.STRING, enum: ['english', 'chinese'] },
            },
            required: ["id", "word", "phonetic", "meaning", "example", "exampleTranslation", "type"],
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
  
    // Evolution milestones
    const isLevel5Plus = pet.level >= 5;
    const isLevel10Plus = pet.level >= 10;
    const isLevel15Plus = pet.level >= 15;
    const isLevel20Plus = pet.level >= 20;
    
    // Force adult visuals if level is high enough
    const isAdultVisually = isAdult || isLevel5Plus;

    const getPetIcon = (size: number) => {
      const iconSize = isAdultVisually ? size * 1.2 : size;
      switch (pet.type) {
        case 'cat': return <Heart size={iconSize * scale} fill="currentColor" />;
        case 'dog': return <Star size={iconSize * scale} fill="currentColor" />;
        case 'rabbit': return <Cloud size={iconSize * scale} fill="currentColor" />;
        case 'dragon': return <Sparkles size={iconSize * scale} fill="currentColor" />;
        case 'pig': return <Heart size={iconSize * scale} fill="currentColor" />;
        case 'elephant': return <Cloud size={iconSize * scale} fill="currentColor" />;
        case 'panda': return <Circle size={iconSize * scale} fill="currentColor" />;
        case 'penguin': return <Star size={iconSize * scale} fill="currentColor" />;
        case 'frog': return <Circle size={iconSize * scale} fill="currentColor" />;
        case 'fox': return <Sparkles size={iconSize * scale} fill="currentColor" />;
        case 'monkey': return <Circle size={iconSize * scale} fill="currentColor" />;
        case 'koala': return <Circle size={iconSize * scale} fill="currentColor" />;
        case 'tiger': return <Star size={iconSize * scale} fill="currentColor" />;
        case 'giraffe': return <Star size={iconSize * scale} fill="currentColor" />;
        case 'bear': return (
          <div className="relative flex flex-col items-center">
             <div className={cn(
               "bg-amber-100 rounded-full flex items-center justify-center",
               isAdultVisually ? "w-20 h-16" : "w-14 h-10"
             )}>
               <div className="w-2 h-2 bg-amber-950 rounded-full" />
             </div>
          </div>
        );
        case 'chick': return <Sun size={iconSize * scale} fill="currentColor" />;
        case 'bee': return <Sparkles size={iconSize * scale} fill="currentColor" />;
        default: return <Heart size={iconSize * scale} fill="currentColor" />;
      }
    };

  const getPetColor = () => {
    if (isAdultVisually) {
      switch (pet.type) {
        case 'bear': return 'bg-amber-950'; // Darker for adult
        case 'cat': return 'bg-orange-600';
        case 'dog': return 'bg-blue-700';
        case 'rabbit': return 'bg-pink-400';
        default: break;
      }
    }
    switch (pet.type) {
      case 'cat': return 'bg-orange-400';
      case 'dog': return 'bg-blue-500';
      case 'rabbit': return 'bg-pink-300';
      case 'dragon': return 'bg-green-600';
      case 'pig': return 'bg-pink-200';
      case 'elephant': return 'bg-blue-300';
      case 'panda': return 'bg-white border-4 border-slate-200';
      case 'penguin': return 'bg-slate-800';
      case 'frog': return 'bg-emerald-500';
      case 'fox': return 'bg-orange-600';
      case 'monkey': return 'bg-amber-700';
      case 'koala': return 'bg-slate-400';
      case 'tiger': return 'bg-orange-500';
      case 'giraffe': return 'bg-yellow-500';
      case 'bear': return 'bg-amber-900';
      case 'chick': return 'bg-yellow-400';
      case 'bee': return 'bg-yellow-300';
      case 'lion': return 'bg-amber-500';
      case 'octopus': return 'bg-blue-400';
      case 'zebra': return 'bg-white border-4 border-slate-300';
      case 'cow': return 'bg-white border-4 border-slate-100';
      case 'crab': return 'bg-red-500';
      case 'raccoon': return 'bg-slate-500';
      case 'starfish': return 'bg-pink-400';
      case 'axolotl': return 'bg-pink-100';
      default: return 'bg-pink-100';
    }
  };

  return (
    <div className="relative flex items-center justify-center" style={{ transform: `scale(${scale})` }}>
      {/* Sun Effect */}
      <AnimatePresence>
        {pet.lastReaction === 'sunbathing' && (
          <motion.div 
            initial={{ y: -100, opacity: 0, scale: 0 }}
            animate={{ y: -180, opacity: 1, scale: 2 }}
            exit={{ y: -100, opacity: 0, scale: 0 }}
            className="absolute text-yellow-500 z-20"
          >
            <Sun size={64} className="animate-spin-slow" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level 20+ Rainbow Aura */}
      {isLevel20Plus && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 -m-20 border-[12px] border-dashed border-pink-200/30 rounded-full blur-xl"
        />
      )}

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
          scale: isLevel15Plus ? [1, 1.4, 1] : [1, 1.2, 1],
          opacity: isLevel15Plus ? [0.3, 0.6, 0.3] : [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 3, repeat: Infinity }}
        className={cn(
          "absolute inset-0 blur-3xl rounded-full",
          isEgg ? "bg-yellow-200" : isLevel15Plus ? "bg-gradient-to-tr from-pink-300 via-purple-300 to-blue-300" : getPetColor().replace('bg-', 'bg-')
        )}
      />

      <motion.div
        onClick={onPet}
        animate={pet.lastReaction === 'happy' ? {
          y: [0, -40, 0],
          scale: [1, 1.1, 1],
        } : pet.lastReaction === 'sunbathing' ? {
          scale: [1, 0.95, 1],
          y: [0, 5, 0]
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
            {/* Level 10+ Crown */}
            {isLevel10Plus && (
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 text-yellow-400 drop-shadow-lg"
              >
                <Crown size={40 * scale} fill="currentColor" />
              </motion.div>
            )}

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
              {pet.type === 'pig' && (
                <>
                  <div className="w-8 h-8 bg-pink-200 rounded-full border-4 border-pink-300 -mt-2" />
                  <div className="w-8 h-8 bg-pink-200 rounded-full border-4 border-pink-300 -mt-2" />
                </>
              )}
              {pet.type === 'elephant' && (
                <>
                  <div className="w-16 h-16 bg-blue-200 rounded-full border-4 border-blue-300 absolute -left-8 top-4" />
                  <div className="w-16 h-16 bg-blue-200 rounded-full border-4 border-blue-300 absolute -right-8 top-4" />
                </>
              )}
              {pet.type === 'panda' && (
                <>
                  <div className="w-10 h-10 bg-slate-800 rounded-full border-4 border-black -mt-2" />
                  <div className="w-10 h-10 bg-slate-800 rounded-full border-4 border-black -mt-2" />
                </>
              )}
              {pet.type === 'fox' && (
                <>
                  <div className="w-12 h-12 bg-orange-600 rotate-45 rounded-sm border-4 border-orange-700 -mt-4" />
                  <div className="w-12 h-12 bg-orange-600 rotate-45 rounded-sm border-4 border-orange-700 -mt-4" />
                </>
              )}
              {pet.type === 'bear' && (
                <>
                  <div className="w-10 h-10 bg-amber-900 rounded-full border-4 border-amber-950 -mt-2" />
                  <div className="w-10 h-10 bg-amber-900 rounded-full border-4 border-amber-950 -mt-2" />
                </>
              )}
              {pet.type === 'koala' && (
                <>
                  <div className="w-14 h-14 bg-slate-400 rounded-full border-4 border-slate-500 absolute -left-6 top-2" />
                  <div className="w-14 h-14 bg-slate-400 rounded-full border-4 border-slate-500 absolute -right-6 top-2" />
                </>
              )}
              {pet.type === 'lion' && (
                <div className="absolute -inset-4 bg-orange-400 rounded-full border-4 border-orange-500 -z-10" />
              )}
              {pet.type === 'giraffe' && (
                <>
                  <div className="w-4 h-12 bg-yellow-500 rounded-full border-2 border-yellow-600 -mt-8" />
                  <div className="w-4 h-12 bg-yellow-500 rounded-full border-2 border-yellow-600 -mt-8" />
                </>
              )}
              {(pet.type === 'dragon' || isLevel15Plus) && (
                <>
                  {/* Wings */}
                  <motion.div 
                    animate={{ rotateY: [0, 60, 0], x: [-60, -80, -60] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className={cn(
                      "absolute top-10 left-0 w-24 h-16 rounded-full border-4 origin-right -z-10",
                      pet.type === 'dragon' ? "bg-green-500/80 border-green-600" : "bg-white/60 border-pink-200"
                    )}
                  />
                  <motion.div 
                    animate={{ rotateY: [0, -60, 0], x: [60, 80, 60] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className={cn(
                      "absolute top-10 right-0 w-24 h-16 rounded-full border-4 origin-left -z-10",
                      pet.type === 'dragon' ? "bg-green-500/80 border-green-600" : "bg-white/60 border-pink-200"
                    )}
                  />
                </>
              )}
              {pet.type === 'dragon' && (
                <>
                  <div className="w-8 h-12 bg-green-600 rounded-t-full border-2 border-green-700" />
                  <div className="w-8 h-12 bg-green-600 rounded-t-full border-2 border-green-700" />
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
              "rounded-[3rem] flex items-center justify-center text-white shadow-2xl relative overflow-hidden transition-all duration-700",
              isBaby ? "w-36 h-36" : "w-48 h-48",
              isAdultVisually && "scale-110 ring-4 ring-white/50",
              getPetColor(),
              isLevel20Plus && "ring-8 ring-yellow-300 ring-offset-4 ring-offset-white"
            )}>
              {/* Evolution Aura for Adults */}
              {isAdultVisually && (
                <motion.div 
                  animate={{ opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent"
                />
              )}
              {/* Internal Shine */}
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
              
              {/* Internal Patterns/Features */}
              {pet.type === 'panda' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-full h-1/2 bg-white absolute top-0" />
                  <div className="w-full h-1/2 bg-slate-800 absolute bottom-0" />
                  <div className="absolute top-1/3 left-1/4 w-8 h-10 bg-slate-900 rounded-full rotate-12 blur-[1px]" />
                  <div className="absolute top-1/3 right-1/4 w-8 h-10 bg-slate-900 rounded-full -rotate-12 blur-[1px]" />
                </div>
              )}
              {pet.type === 'penguin' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3/4 h-3/4 bg-white rounded-full mt-8" />
                </div>
              )}
              {pet.type === 'tiger' && (
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-4 left-0 w-12 h-2 bg-black rounded-r-full" />
                  <div className="absolute top-12 left-0 w-8 h-2 bg-black rounded-r-full" />
                  <div className="absolute top-4 right-0 w-12 h-2 bg-black rounded-l-full" />
                  <div className="absolute top-12 right-0 w-8 h-2 bg-black rounded-l-full" />
                </div>
              )}
              {pet.type === 'bee' && (
                <div className="absolute inset-0 flex flex-col justify-around py-4 opacity-30">
                  <div className="w-full h-4 bg-black" />
                  <div className="w-full h-4 bg-black" />
                  <div className="w-full h-4 bg-black" />
                </div>
              )}
              {pet.type === 'pig' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-12 h-8 bg-pink-400 rounded-2xl border-2 border-pink-500 flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-pink-600 rounded-full" />
                  <div className="w-2 h-2 bg-pink-600 rounded-full" />
                </div>
              )}
              {pet.type === 'elephant' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-8 h-16 bg-blue-300 rounded-b-full border-2 border-blue-400 origin-top" />
              )}
              {pet.type === 'chick' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-6 h-4 bg-orange-400 rounded-full border-2 border-orange-500" />
              )}
              
              <div className="mt-8">
                {getPetIcon(isBaby ? 72 : 96)}
              </div>

              {/* Eyes - Moved AFTER the icon and positioned carefully */}
              <div className="absolute top-[25%] left-0 w-full flex justify-center gap-10 z-20">
                {pet.lastReaction === 'sunbathing' ? (
                  <>
                    {/* Sunglasses */}
                    <div className="w-10 h-6 bg-black rounded-full border-2 border-slate-700" />
                    <div className="w-10 h-6 bg-black rounded-full border-2 border-slate-700" />
                    <div className="absolute top-3 w-12 h-1 bg-black" />
                  </>
                ) : (
                  <>
                    <motion.div 
                      animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                      transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
                      className={cn(
                        "rounded-full", 
                        (isLevel15Plus || pet.type === 'frog') ? "bg-yellow-200 shadow-[0_0_10px_rgba(255,255,255,0.8)]" : "bg-white"
                      )} 
                      style={{ 
                        width: (isAdultVisually ? 8 : 4) * scale, 
                        height: (isAdultVisually ? 8 : 4) * scale,
                        backgroundColor: pet.type === 'bear' ? '#000' : undefined // Bear has black eyes
                      }}
                    />
                    <motion.div 
                      animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
                      transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
                      className={cn(
                        "rounded-full", 
                        (isLevel15Plus || pet.type === 'frog') ? "bg-yellow-200 shadow-[0_0_10px_rgba(255,255,255,0.8)]" : "bg-white"
                      )} 
                      style={{ 
                        width: (isAdultVisually ? 8 : 4) * scale, 
                        height: (isAdultVisually ? 8 : 4) * scale,
                        backgroundColor: pet.type === 'bear' ? '#000' : undefined // Bear has black eyes
                      }}
                    />
                  </>
                )}
              </div>

              {/* Blushed Cheeks */}
              <div className="absolute top-1/2 left-0 w-full flex justify-center gap-20 opacity-40">
                <div className="w-6 h-3 bg-pink-200 rounded-full blur-[2px]" style={{ width: 6 * scale, height: 3 * scale }} />
                <div className="w-6 h-3 bg-pink-200 rounded-full blur-[2px]" style={{ width: 6 * scale, height: 3 * scale }} />
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
            {isAdultVisually && (
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute -top-10 left-1/2 -translate-x-1/2 text-yellow-500 drop-shadow-md z-30"
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
                  {pet.lastReaction === 'sunbathing' && "☀️"}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Particles */}
            <AnimatePresence>
              {[...Array(isLevel5Plus ? 6 : 3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0], 
                    scale: [0, 1, 0],
                    x: (i - (isLevel5Plus ? 2.5 : 1)) * 40 * scale,
                    y: (-60 - (i * 20)) * scale
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    delay: i * 0.4,
                    ease: "easeOut"
                  }}
                  className={cn("absolute top-1/2 left-1/2", isLevel5Plus ? "text-yellow-300" : "text-white/50")}
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
  const [activeChildId, setActiveChildId] = useState<'child1' | 'child2'>('child1');
  
  const [child1, setChild1] = useState<ChildProfile>(() => {
    const saved = localStorage.getItem('moemoe_child1');
    if (saved) return JSON.parse(saved);
    return {
      id: 'child1',
      grade: 2,
      pet: {
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
        speech: null,
        learningPower: 100
      },
      words: [],
      points: 0,
      inventory: { sunlight: 0, food: 0, water: 0, grass: 0, fruit: 0 }
    };
  });

  const [child2, setChild2] = useState<ChildProfile>(() => {
    const saved = localStorage.getItem('moemoe_child2');
    if (saved) return JSON.parse(saved);
    return {
      id: 'child2',
      grade: 4,
      pet: {
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
        speech: null,
        learningPower: 100
      },
      words: [],
      points: 0,
      inventory: { sunlight: 0, food: 0, water: 0, grass: 0, fruit: 0 }
    };
  });

  const activeChild = activeChildId === 'child1' ? child1 : child2;
  const otherChild = activeChildId === 'child1' ? child2 : child1;
  const { pet, words, points, inventory } = activeChild;
  const buddy = otherChild.pet.isAdopted ? otherChild.pet : null;
  
  const updateActiveChild = (updates: Partial<ChildProfile>) => {
    if (activeChildId === 'child1') {
      setChild1(prev => ({ ...prev, ...updates }));
    } else {
      setChild2(prev => ({ ...prev, ...updates }));
    }
  };

  const updateActivePet = (updates: Partial<PetState>) => {
    if (activeChildId === 'child1') {
      setChild1(prev => ({ ...prev, pet: { ...prev.pet, ...updates } }));
    } else {
      setChild2(prev => ({ ...prev, pet: { ...prev.pet, ...updates } }));
    }
  };

  const updateActiveInventory = (updates: Partial<Inventory>) => {
    if (activeChildId === 'child1') {
      setChild1(prev => ({ ...prev, inventory: { ...prev.inventory, ...updates } }));
    } else {
      setChild2(prev => ({ ...prev, inventory: { ...prev.inventory, ...updates } }));
    }
  };

  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'list' | 'flashcard' | 'practice' | 'dashboard' | 'pet' | 'shop' | 'challenge' | 'quiz'>('dashboard');
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);
  const [practiceInput, setPracticeInput] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('moemoe_sound');
    return saved === null ? true : saved === 'true';
  });
  
  // Quiz Mode State
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Challenge Mode State
  const [challengeStreak, setChallengeStreak] = useState(0);
  const [challengeWord, setChallengeWord] = useState<WordEntry | null>(null);
  const [challengeType, setChallengeType] = useState<'word' | 'sentence'>('word');
  const [challengeFeedback, setChallengeFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [challengeInput, setChallengeInput] = useState('');

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<PronunciationResult | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stats: StudyStats = {
    total: activeChild.words.length,
    mastered: activeChild.words.filter(w => w.isMastered).length,
    unmastered: activeChild.words.filter(w => !w.isMastered).length
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('moemoe_child1', JSON.stringify(child1));
  }, [child1]);

  useEffect(() => {
    localStorage.setItem('moemoe_child2', JSON.stringify(child2));
  }, [child2]);

  useEffect(() => {
    localStorage.setItem('moemoe_sound', isSoundEnabled.toString());
  }, [isSoundEnabled]);

  const encouragements = [
    "太棒了！你真聪明！✨",
    "继续加油，你是最棒的！🚀",
    "哇，这个单词你掌握得真快！👏",
    "学习让你变得更有魅力！❤️",
    "每天进步一点点，就是伟大的成就！🌟",
    "你的努力我全都看在眼里哦！💪",
    "你是学习小天才吗？太厉害了！🌈",
    "坚持就是胜利，再来一个！🔥"
  ];

  const playSound = (type: 'correct' | 'wrong' | 'levelup' | 'click') => {
    if (!isSoundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (type === 'correct') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
        oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
      } else if (type === 'wrong') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(220, audioCtx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      } else if (type === 'levelup') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2);
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
      } else if (type === 'click') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.05);
      }
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  const getRandomEncouragement = () => encouragements[Math.floor(Math.random() * encouragements.length)];

  const renamePet = () => {
    const newName = prompt("给你的宠物起个新名字吧：", activeChild.pet.name);
    if (newName && newName.trim()) {
      updateActivePet({ name: newName.trim() });
      playSound('click');
    }
  };

  const changePet = (newType: PetState['type']) => {
    if (activeChild.pet.hasChangedPet) {
      alert("你已经更换过一次宠物了，不能再换啦！");
      return;
    }
    if (activeChild.points < 50) {
      alert("更换宠物需要 50 积分哦！");
      return;
    }
    if (confirm(`确定要花费 50 积分更换为 ${newType} 吗？每个账号只能更换一次哦！`)) {
      updateActiveChild({ points: activeChild.points - 50 });
      updateActivePet({ type: newType, hasChangedPet: true });
      playSound('levelup');
    }
  };

  const inviteBuddy = () => {
    if (confirm("确定要为另一位孩子开启宠物陪伴吗？两位孩子可以一起学习比拼哦！")) {
      setActiveChildId(activeChildId === 'child1' ? 'child2' : 'child1');
      playSound('levelup');
    }
  };

  const addPoints = (amount: number) => {
    updateActiveChild({ points: activeChild.points + amount });
  };

  const completeStudyAction = (pointsAmount: number) => {
    addPoints(pointsAmount);
    playSound('correct');
    const newProgress = activeChild.pet.dailyGoalProgress + 1;
    const newExp = activeChild.pet.experience + 5;
    let experience = newExp;
    let level = activeChild.pet.level;
    let stage = activeChild.pet.stage;
    let speech = getRandomEncouragement();

    if (experience >= 100) {
      level += 1;
      experience -= 100;
      speech = `太棒了！我升级到 Lv.${level} 啦！感觉充满了力量！✨`;
      playSound('levelup');
      
      // Evolution logic
      if (level >= 5 && stage === 'baby') {
        stage = 'adult';
        speech = "哇！我长大了！现在我是大可爱啦！🦁";
      }
    }

    if (newProgress === DAILY_GOAL) {
      speech = "太棒了！今天的学习目标完成啦！奖励你一个大大的拥抱！";
    }

    updateActivePet({ 
      dailyGoalProgress: newProgress, 
      speech,
      level,
      experience,
      stage,
      learningPower: level * 100 + experience
    });
    
    // Clear speech after 5 seconds
    setTimeout(() => {
      updateActivePet({ speech: null });
    }, 5000);
  };

  const petThePet = () => {
    if (!activeChild.pet.isAdopted) return;
    playSound('click');
    const messages = [
      "摸摸头，真舒服呀！",
      "主人最棒了，我们一起加油学习吧！",
      "今天也要元气满满哦！",
      "你读单词的声音真好听！",
      "别忘了完成今天的学习目标哦！"
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    updateActivePet({ 
      lastReaction: 'happy',
      speech: randomMessage 
    });
    
    setTimeout(() => {
      updateActivePet({ lastReaction: null, speech: null });
    }, 3000);
  };

  // Daily reset logic
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (activeChild.pet.lastStudyDate !== today) {
      updateActivePet({
        dailyGoalProgress: 0,
        lastStudyDate: today,
        speech: "新的一天开始啦！今天要也要加油学习哦！"
      });
      setTimeout(() => {
        updateActivePet({ speech: null });
      }, 5000);
    }
  }, [activeChild.pet.lastStudyDate]);

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
          const result = await evaluatePronunciation(target, base64Audio, 'english');
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
    if (activeChild.points >= cost) {
      updateActiveChild({ points: activeChild.points - cost });
      updateActiveInventory({ [item]: activeChild.inventory[item] + 1 });
      playSound('click');
    } else {
      alert("积分不足哦，快去学习赚取积分吧！");
      playSound('wrong');
    }
  };

  const useItem = (item: keyof Inventory) => {
    if (activeChild.inventory[item] > 0) {
      updateActiveInventory({ [item]: activeChild.inventory[item] - 1 });
      playSound('click');
      
      const triggerReaction = (reaction: PetState['lastReaction']) => {
        updateActivePet({ lastReaction: reaction });
        setTimeout(() => {
          updateActivePet({ lastReaction: null });
        }, 2000);
      };

      if (item === 'sunlight') {
        const newSunlight = activeChild.pet.sunlightCount + 1;
        let newStage = activeChild.pet.stage;
        let speech = "戴上墨镜，晒太阳，吸收钙，好舒服！😎☀️";
        if (newSunlight >= 3 && activeChild.pet.stage === 'egg') {
          newStage = 'baby';
          triggerReaction('hatching');
          speech = "哇！我出生啦！主人你好呀！🐣";
          playSound('levelup');
        } else {
          triggerReaction('sunbathing');
        }
        updateActivePet({ sunlightCount: newSunlight, stage: newStage, speech, learningPower: (activeChild.pet.level * 100) + activeChild.pet.experience + 2 });
      } else if (item === 'food' || item === 'grass' || item === 'fruit') {
        triggerReaction('eating');
        const expGain = item === 'food' ? 20 : item === 'grass' ? 10 : 30;
        const newExperience = activeChild.pet.experience + expGain;
        let newLevel = activeChild.pet.level;
        let newStage = activeChild.pet.stage;
        let speech = item === 'food' ? "真好吃！谢谢主人！😋" : item === 'grass' ? "脆脆的，味道不错！🌿" : "太甜了！我最喜欢吃水果了！🍎";
        
        if (newExperience >= 100) {
          newLevel += 1;
          speech = `升级啦！我现在是 Lv.${newLevel} 啦！✨`;
          playSound('levelup');
          if (newLevel >= 5 && activeChild.pet.stage === 'baby') {
            newStage = 'adult';
            speech = "哇！我长大了！现在我是大可爱啦！🦁";
          }
          updateActivePet({ level: newLevel, experience: 0, stage: newStage, speech, learningPower: newLevel * 100 });
        } else {
          updateActivePet({ experience: newExperience, speech, learningPower: activeChild.pet.level * 100 + newExperience });
        }
      } else if (item === 'water') {
        triggerReaction('drinking');
        updateActivePet({ 
          waterCount: activeChild.pet.waterCount + 1, 
          speech: "咕嘟咕嘟...解渴了！💧",
          learningPower: (activeChild.pet.level * 100) + activeChild.pet.experience + 1
        });
      }
    }
  };

  const adoptPet = (type: PetState['type'], name: string) => {
    if (activeChild.points >= 10) {
      updateActiveChild({ points: activeChild.points - 10 });
      playSound('levelup');
      updateActivePet({
        isAdopted: true,
        type,
        name,
        stage: 'egg',
        learningPower: 100
      });
    } else {
      alert("积分不足，领养宠物需要 10 积分哦！快去学习吧！");
      playSound('wrong');
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
    updateActiveChild({
      words: activeChild.words.map(w => w.id === id ? { ...w, isMastered: !w.isMastered } : w)
    });
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
    if (!selectedImage && !inputText.trim()) {
      alert("请先拍照或输入单词哦！");
      return;
    }
    
    setIsLoading(true);
    try {
      let wordsToProcess: string[] = [];
      
      if (selectedImage) {
        wordsToProcess = await extractWordsFromImage(selectedImage, activeChild.grade);
      } else if (inputText.trim()) {
        wordsToProcess = inputText.split(/[,\s\n]+/).filter(w => w.trim().length > 0);
      }

      if (wordsToProcess.length > 0) {
        const details = await generateWordDetails(wordsToProcess, activeChild.grade);
        updateActiveChild({
          words: [
            ...activeChild.words,
            ...details.filter(d => !activeChild.words.some(w => w.word.toLowerCase() === d.word.toLowerCase()))
          ]
        });
        setViewMode('list');
        setInputText('');
        setSelectedImage(null);
      } else {
        alert("未能从图片中识别到单词，请尝试换个角度拍照或手动输入。");
      }
    } catch (error) {
      console.error("Generate Error:", error);
      alert("生成失败，可能是网络问题或图片不够清晰，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePracticeSubmit = () => {
    const currentWord = activeChild.words.filter(w => !w.isMastered)[flashcardIndex];
    if (practiceInput.trim().toLowerCase() === currentWord.word.toLowerCase()) {
      setPracticeFeedback('correct');
      completeStudyAction(5); // Correct spelling awards 5 points
    } else {
      setPracticeFeedback('wrong');
      playSound('wrong');
    }
  };

  const nextPractice = () => {
    const unmastered = activeChild.words.filter(w => !w.isMastered);
    if (flashcardIndex < unmastered.length - 1) {
      setFlashcardIndex(prev => prev + 1);
      setPracticeInput('');
      setPracticeFeedback(null);
    } else {
      // Finished practice
      setViewMode('dashboard');
    }
  };

  const startChallenge = () => {
    if (activeChild.words.length === 0) {
      alert("请先添加一些单词吧！");
      return;
    }
    const randomWord = activeChild.words[Math.floor(Math.random() * activeChild.words.length)];
    const type = Math.random() > 0.5 ? 'sentence' : 'word';
    setChallengeWord(randomWord);
    setChallengeType(type);
    setChallengeInput('');
    setChallengeFeedback(null);
    setViewMode('challenge');
  };

  const handleChallengeSubmit = () => {
    if (!challengeWord) return;
    const target = challengeType === 'word' ? challengeWord.word : challengeWord.example;
    const cleanInput = challengeInput.trim().toLowerCase().replace(/[.?!,]/g, '');
    const cleanTarget = target.toLowerCase().replace(/[.?!,]/g, '');

      if (cleanInput === cleanTarget) {
        setChallengeFeedback('correct');
        setChallengeStreak(prev => prev + 1);
        const basePoints = challengeType === 'sentence' ? 20 : 10;
        completeStudyAction(basePoints + Math.min(challengeStreak * 2, 20)); // Bonus points for streak
        
        // Pet reaction
        updateActivePet({
          speech: challengeType === 'sentence' ? `哇！句子都写对了！奖励翻倍！连击 x${challengeStreak + 1}！` : `太棒了！连击 x${challengeStreak + 1}！继续挑战吧！`
        });
      } else {
        setChallengeFeedback('wrong');
        playSound('wrong');
        setChallengeStreak(0);
        updateActivePet({
          speech: "哎呀，没关系，再试一次！"
        });
      }
  };

  const nextChallenge = () => {
    const randomWord = activeChild.words[Math.floor(Math.random() * activeChild.words.length)];
    const type = Math.random() > 0.5 ? 'sentence' : 'word';
    setChallengeWord(randomWord);
    setChallengeType(type);
    setChallengeInput('');
    setChallengeFeedback(null);
  };

  const startQuiz = () => {
    if (activeChild.words.length < 4) {
      alert("至少需要 4 个单词才能开始选择题练习哦！");
      return;
    }
    const unmastered = activeChild.words.filter(w => !w.isMastered);
    const target = unmastered.length > 0 ? unmastered[0] : activeChild.words[Math.floor(Math.random() * activeChild.words.length)];
    
    // Generate options
    const otherWords = activeChild.words.filter(w => w.id !== target.id);
    const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
    const options = [target.word, ...shuffledOthers.slice(0, 3).map(w => w.word)].sort(() => 0.5 - Math.random());
    
    setFlashcardIndex(activeChild.words.indexOf(target));
    setQuizOptions(options);
    setQuizFeedback(null);
    setSelectedOption(null);
    setViewMode('quiz');
  };

  const handleQuizSubmit = (option: string) => {
    const target = activeChild.words[flashcardIndex];
    setSelectedOption(option);
    if (option === target.word) {
      setQuizFeedback('correct');
      completeStudyAction(3);
    } else {
      setQuizFeedback('wrong');
      playSound('wrong');
    }
  };

  const nextQuiz = () => {
    const unmastered = activeChild.words.filter(w => !w.isMastered);
    if (unmastered.length === 0) {
      setViewMode('dashboard');
      return;
    }
    
    const target = unmastered[Math.floor(Math.random() * unmastered.length)];
    const otherWords = activeChild.words.filter(w => w.id !== target.id);
    const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
    const options = [target.word, ...shuffledOthers.slice(0, 3).map(w => w.word)].sort(() => 0.5 - Math.random());
    
    setFlashcardIndex(activeChild.words.indexOf(target));
    setQuizOptions(options);
    setQuizFeedback(null);
    setSelectedOption(null);
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
        <header className="text-center mb-12 relative">
          <div className="absolute top-0 right-0 flex gap-2">
            {/* Profile Switcher */}
            <div className="flex bg-pink-50 rounded-2xl p-1 mr-2">
              <button 
                onClick={() => setActiveChildId('child1')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-black transition-all",
                  activeChildId === 'child1' ? "bg-white text-pink-500 shadow-md" : "text-gray-400 hover:text-gray-600"
                )}
              >
                2年级
              </button>
              <button 
                onClick={() => setActiveChildId('child2')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-black transition-all",
                  activeChildId === 'child2' ? "bg-white text-pink-500 shadow-md" : "text-gray-400 hover:text-gray-600"
                )}
              >
                4年级
              </button>
            </div>

            <Button 
              variant="ghost" 
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              className="p-2"
            >
              {isSoundEnabled ? <Volume2 className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </Button>
          </div>
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
              {activeChild.grade}年级学习好帮手 ✨
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
            variant={viewMode === 'challenge' ? 'secondary' : 'ghost'} 
            onClick={startChallenge}
            className="px-4 md:px-6 py-2 text-sm md:text-base border-2 border-yellow-400 text-yellow-600 hover:bg-yellow-50"
          >
            <Trophy className="w-4 h-4 md:w-5 md:h-5" /> 挑战模式
          </Button>
          <Button 
            variant={viewMode === 'quiz' ? 'secondary' : 'ghost'} 
            onClick={startQuiz}
            className="px-4 md:px-6 py-2 text-sm md:text-base"
          >
            <PenTool className="w-4 h-4 md:w-5 md:h-5" /> 选择题
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
            <span className="font-black text-yellow-600 text-xl">{activeChild.points} 积分</span>
          </div>
        </div>

        <main>
          <AnimatePresence mode="wait">
            {/* Challenge Mode View */}
            {viewMode === 'challenge' && challengeWord && (
              <motion.div
                key="challenge"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <Card className="w-full max-w-2xl p-8 md:p-12 text-center relative overflow-hidden">
                  {/* Streak Badge */}
                  <div className="absolute top-4 right-4 bg-orange-500 text-white px-4 py-2 rounded-full font-black shadow-lg animate-bounce">
                    连击 x{challengeStreak}
                  </div>

                  <div className="mb-8">
                    <span className="text-sm font-bold text-pink-400 uppercase tracking-widest">
                      {challengeType === 'word' ? '单词挑战' : '句子挑战 (双倍积分!)'}
                    </span>
                    <h2 className="text-4xl font-black text-gray-800 mt-2">
                      {challengeType === 'word' ? challengeWord.meaning : challengeWord.exampleTranslation}
                    </h2>
                    {challengeType === 'sentence' && (
                      <div className="mt-4 flex justify-center gap-2">
                        <button onClick={() => speak(challengeWord.example)} className="text-blue-400 hover:text-blue-600 flex items-center gap-1 font-bold">
                          <Volume2 size={18} /> 听句子
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="relative">
                      {challengeType === 'word' ? (
                        <input
                          type="text"
                          value={challengeInput}
                          onChange={(e) => setChallengeInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !challengeFeedback && handleChallengeSubmit()}
                          placeholder="输入英文单词..."
                          disabled={!!challengeFeedback}
                          className={cn(
                            "w-full px-8 py-6 rounded-3xl text-3xl font-bold text-center border-4 outline-none transition-all",
                            challengeFeedback === 'correct' ? "border-green-400 bg-green-50 text-green-600" :
                            challengeFeedback === 'wrong' ? "border-red-400 bg-red-50 text-red-600 animate-shake" :
                            "border-pink-100 focus:border-pink-300 bg-pink-50/30"
                          )}
                          autoFocus
                        />
                      ) : (
                        <textarea
                          value={challengeInput}
                          onChange={(e) => setChallengeInput(e.target.value)}
                          placeholder="输入完整的英文句子..."
                          disabled={!!challengeFeedback}
                          rows={3}
                          className={cn(
                            "w-full px-8 py-6 rounded-3xl text-2xl font-bold text-center border-4 outline-none transition-all resize-none",
                            challengeFeedback === 'correct' ? "border-green-400 bg-green-50 text-green-600" :
                            challengeFeedback === 'wrong' ? "border-red-400 bg-red-50 text-red-600 animate-shake" :
                            "border-pink-100 focus:border-pink-300 bg-pink-50/30"
                          )}
                          autoFocus
                        />
                      )}
                      {challengeFeedback === 'correct' && (
                        <motion.div 
                          initial={{ scale: 0 }}
                          animate={{ scale: 1.2 }}
                          className="absolute -right-4 -top-4 bg-green-500 text-white p-3 rounded-full shadow-lg z-10"
                        >
                          <Check size={32} />
                        </motion.div>
                      )}
                    </div>

                    {!challengeFeedback ? (
                      <Button 
                        onClick={handleChallengeSubmit} 
                        className="w-full py-6 text-2xl"
                        disabled={!challengeInput.trim()}
                      >
                        提交答案
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-6 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                          <p className="text-sm text-gray-400 mb-1">正确答案是：</p>
                          <p className="text-2xl md:text-3xl font-black text-gray-800">
                            {challengeType === 'word' ? challengeWord.word : challengeWord.example}
                          </p>
                          <div className="flex justify-center gap-4 mt-4">
                            <Button variant="ghost" onClick={() => speak(challengeType === 'word' ? challengeWord.word : challengeWord.example)}>
                              <Volume2 /> 听发音
                            </Button>
                          </div>
                        </div>
                        
                        <Button 
                          onClick={nextChallenge} 
                          className="w-full py-6 text-2xl bg-yellow-400 hover:bg-yellow-500"
                        >
                          {challengeFeedback === 'correct' ? "继续挑战！" : "再试一个"} <ArrowRight className="ml-2" />
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          onClick={() => setViewMode('dashboard')}
                          className="w-full"
                        >
                          结束挑战
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Pet Encouragement */}
                  <div className="mt-12 flex items-center justify-center gap-4 p-4 bg-pink-50 rounded-2xl border-2 border-pink-100">
                    <div className="w-16 h-16">
                      <PetVisual pet={pet} scale={0.3} />
                    </div>
                    <p className="text-pink-600 font-bold italic">
                      {challengeFeedback === 'correct' ? "你太棒了！积分哗哗地涨！" : 
                       challengeFeedback === 'wrong' ? "没关系，失败是成功之母！" : 
                       "加油！看看你能连击多少次？"}
                    </p>
                  </div>
                </Card>
              </motion.div>
            )}

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
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-10 max-h-[400px] overflow-y-auto p-2">
                      {[
                        { type: 'cat', name: '小猫咪', icon: <Heart size={32} fill="currentColor" />, color: 'bg-orange-100 text-orange-500' },
                        { type: 'dog', name: '小狗狗', icon: <Star size={32} fill="currentColor" />, color: 'bg-blue-100 text-blue-500' },
                        { type: 'rabbit', name: '小兔子', icon: <Cloud size={32} fill="currentColor" />, color: 'bg-pink-100 text-pink-500' },
                        { type: 'dragon', name: '小恐龙', icon: <Sparkles size={32} fill="currentColor" />, color: 'bg-green-100 text-green-500' },
                        { type: 'pig', name: '小猪猪', icon: <Heart size={32} fill="currentColor" />, color: 'bg-pink-100 text-pink-400' },
                        { type: 'elephant', name: '小象', icon: <Cloud size={32} fill="currentColor" />, color: 'bg-blue-100 text-blue-400' },
                        { type: 'panda', name: '小熊猫', icon: <Circle size={32} fill="currentColor" />, color: 'bg-gray-100 text-gray-800' },
                        { type: 'penguin', name: '小企鹅', icon: <Star size={32} fill="currentColor" />, color: 'bg-slate-200 text-slate-800' },
                        { type: 'frog', name: '小青蛙', icon: <Circle size={32} fill="currentColor" />, color: 'bg-emerald-100 text-emerald-500' },
                        { type: 'fox', name: '小狐狸', icon: <Sparkles size={32} fill="currentColor" />, color: 'bg-orange-100 text-orange-600' },
                        { type: 'monkey', name: '小猴子', icon: <Circle size={32} fill="currentColor" />, color: 'bg-amber-100 text-amber-700' },
                        { type: 'koala', name: '考拉', icon: <Circle size={32} fill="currentColor" />, color: 'bg-slate-100 text-slate-500' },
                        { type: 'tiger', name: '小老虎', icon: <Star size={32} fill="currentColor" />, color: 'bg-orange-100 text-orange-500' },
                        { type: 'giraffe', name: '长颈鹿', icon: <Star size={32} fill="currentColor" />, color: 'bg-yellow-100 text-yellow-600' },
                        { type: 'bear', name: '小熊', icon: <Circle size={32} fill="currentColor" />, color: 'bg-amber-100 text-amber-800' },
                        { type: 'chick', name: '小鸡', icon: <Sun size={32} fill="currentColor" />, color: 'bg-yellow-100 text-yellow-500' },
                        { type: 'bee', name: '小蜜蜂', icon: <Sparkles size={32} fill="currentColor" />, color: 'bg-yellow-100 text-yellow-600' },
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
                      <Star fill="currentColor" size={20} /> 当前积分: {activeChild.points}
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
                        onClick={renamePet}
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

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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

                    {/* Change Pet Button */}
                    {!pet.hasChangedPet && (
                      <div className="mt-4">
                        <Button 
                          variant="ghost" 
                          onClick={() => {
                            const types: PetState['type'][] = ['panda', 'koala', 'fox', 'tiger', 'penguin', 'dragon', 'cat', 'dog', 'rabbit'];
                            const randomType = types[Math.floor(Math.random() * types.length)];
                            changePet(randomType);
                          }}
                          className="text-xs text-gray-400 underline mx-auto"
                        >
                          更换宠物 (50 积分，限一次)
                        </Button>
                      </div>
                    )}

                    {/* Buddy Competition Section */}
                    {buddy ? (
                      <div className="mt-12 p-8 bg-gradient-to-br from-purple-50 to-blue-50 rounded-[3rem] border-4 border-purple-100 shadow-inner">
                        <div className="flex items-center justify-center gap-4 mb-8">
                          <Trophy className="text-yellow-500" size={32} />
                          <h3 className="text-2xl font-black text-purple-700">学习力大比拼</h3>
                        </div>
                        <div className="flex flex-col md:flex-row items-center justify-around gap-8">
                          {/* My Pet */}
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-lg">
                              <PetVisual pet={pet} scale={0.6} />
                            </div>
                            <div className="text-center">
                              <p className="font-black text-gray-700">{pet.name}</p>
                              <p className="text-sm text-gray-500">学习力: {pet.learningPower}</p>
                            </div>
                          </div>

                          {/* VS */}
                          <div className="text-4xl font-black text-purple-300 italic">VS</div>

                          {/* Buddy Pet */}
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-lg">
                              <PetVisual pet={buddy} scale={0.6} />
                            </div>
                            <div className="text-center">
                              <p className="font-black text-gray-700">{buddy.name}</p>
                              <p className="text-sm text-gray-500">学习力: {buddy.learningPower}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-8 text-center">
                          <div className="inline-block px-6 py-2 bg-white rounded-full border-2 border-purple-200 text-purple-600 font-bold">
                            {pet.learningPower >= buddy.learningPower ? "🎉 你暂时领先哦！继续保持！" : "💪 小伙伴超前啦！快去背单词追上它！"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-12 p-8 bg-gray-50 rounded-[3rem] border-4 border-dashed border-gray-200 text-center">
                        <p className="text-gray-500 mb-4 font-bold">一个人学习太孤单？邀请小伙伴一起来比拼吧！</p>
                        <Button variant="secondary" onClick={inviteBuddy} className="bg-purple-500 hover:bg-purple-600 mx-auto">
                          邀请小伙伴 (免费)
                        </Button>
                      </div>
                    )}
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

                {activeChild.words.map((entry, idx) => (
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
                                updateActiveChild({
                                  words: activeChild.words.filter(w => w.id !== entry.id)
                                });
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

            {/* Quiz View */}
            {viewMode === 'quiz' && (
              <motion.div
                key="quiz"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <Card className="w-full max-w-2xl p-8 md:p-12 text-center">
                  <div className="mb-8">
                    <span className="bg-blue-100 text-blue-500 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-widest">
                      选择题练习
                    </span>
                    <h2 className="text-4xl font-black text-gray-800 mt-4 mb-2">
                      {activeChild.words[flashcardIndex].meaning}
                    </h2>
                    <p className="text-gray-400 italic">“{activeChild.words[flashcardIndex].exampleTranslation}”</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {quizOptions.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => !quizFeedback && handleQuizSubmit(option)}
                        disabled={!!quizFeedback}
                        className={cn(
                          "p-6 rounded-3xl text-xl font-bold border-4 transition-all transform active:scale-95",
                          selectedOption === option ? (
                            quizFeedback === 'correct' ? "border-green-400 bg-green-50 text-green-600" : "border-red-400 bg-red-50 text-red-600"
                          ) : (
                            quizFeedback === 'correct' && option === words[flashcardIndex].word ? "border-green-400 bg-green-50 text-green-600" : "border-pink-100 hover:border-pink-200 bg-white"
                          ),
                          quizFeedback && option !== words[flashcardIndex].word && selectedOption !== option && "opacity-50"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  {quizFeedback && (
                    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8">
                      {quizFeedback === 'correct' ? (
                        <p className="text-green-600 font-black text-2xl flex items-center justify-center gap-2">
                          <CheckCircle2 /> 太棒了！答对了！
                        </p>
                      ) : (
                        <div className="text-red-500">
                          <p className="font-black text-2xl mb-2">哎呀，选错了哦！</p>
                          <p className="text-lg">正确答案是：<span className="font-black text-2xl underline">{activeChild.words[flashcardIndex].word}</span></p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {quizFeedback && (
                    <div className="flex flex-col gap-4">
                      <Button onClick={nextQuiz} className="w-full py-4 text-xl">
                        下一个 <ArrowRight className="ml-2" />
                      </Button>
                      <Button variant="ghost" onClick={() => setViewMode('dashboard')}>
                        结束练习
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {/* Practice View - Replaced by Quiz */}

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
                        {activeChild.words[flashcardIndex].word}
                      </h2>
                      <p className="text-gray-400 font-mono text-xl">
                        [{activeChild.words[flashcardIndex].phonetic}]
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
                        {activeChild.words[flashcardIndex].meaning}
                      </h2>
                      <div className="text-center space-y-4">
                        <p className="text-lg italic opacity-90">
                          "{activeChild.words[flashcardIndex].example}"
                        </p>
                        <p className="text-sm opacity-75">
                          {activeChild.words[flashcardIndex].exampleTranslation}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        className="mt-8 text-white hover:bg-white/20"
                        disabled={isSpeaking}
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(activeChild.words[flashcardIndex].word);
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
                    {flashcardIndex + 1} / {activeChild.words.length}
                  </div>

                  <button 
                    onClick={() => {
                      setFlashcardIndex(prev => Math.min(activeChild.words.length - 1, prev + 1));
                      setShowFlashcardBack(false);
                    }}
                    disabled={flashcardIndex === activeChild.words.length - 1}
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
