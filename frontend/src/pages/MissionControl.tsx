import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Target, Crosshair, TerminalSquare, BrainCircuit, Play, 
  CheckCircle2, AlertTriangle, Code, ArrowRight, Loader2, Award, Zap
} from 'lucide-react';
import { generateWarRoom, evaluateWarRoom } from '../lib/api';

type WarRoomState = 'config' | 'loading_tasks' | 'aptitude' | 'coding' | 'mock' | 'evaluating' | 'results';

export default function MissionControl() {
  const [phase, setPhase] = useState<WarRoomState>('config');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');

  // Assessment Data
  const [tasks, setTasks] = useState<any>(null);
  
  // Aptitude State
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [aptitudeScore, setAptitudeScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // Coding State
  const [code, setCode] = useState('');
  
  // Mock Interview State
  const [explanation, setExplanation] = useState('');

  // Results State
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!company || !role) {
      setError('Please provide a company and role.');
      return;
    }
    setError('');
    setPhase('loading_tasks');
    try {
      const data = await generateWarRoom(company, role);
      setTasks(data);
      setCode(data.coding_problem?.starter_code || '// Write your solution here...');
      setPhase('aptitude');
    } catch (e: any) {
      console.error(e);
      setError('Failed to generate simulation. Please try again.');
      setPhase('config');
    }
  };

  const handleAptitudeNext = () => {
    if (selectedOption === null) return;
    
    if (selectedOption === tasks.aptitude_questions[currentQuestion].correctIndex) {
      setAptitudeScore(s => s + 1);
    }
    
    if (currentQuestion < tasks.aptitude_questions.length - 1) {
      setCurrentQuestion(c => c + 1);
      setSelectedOption(null);
    } else {
      setPhase('coding');
    }
  };

  const handleSubmitEvaluation = async () => {
    setPhase('evaluating');
    try {
      const payload = {
        company,
        aptitude_score: aptitudeScore,
        total_aptitude: tasks.aptitude_questions.length,
        coding_problem: tasks.coding_problem?.description,
        code,
        explanation
      };
      const evaluation = await evaluateWarRoom(payload);
      setResults(evaluation);
      setPhase('results');
    } catch (e: any) {
      setError('Evaluation failed. Please try again.');
      setPhase('mock');
    }
  };

  // Helper handling tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      setCode(code.substring(0, start) + "  " + code.substring(end));
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Target size={22} color="#ef4444" />
        </div>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>Interview Arena</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>End-to-End Technical Interview Simulation Sandbox</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {/* CONFIGURATION */}
        {phase === 'config' && (
          <motion.div key="config" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="card" style={{ padding: 40, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
              <Crosshair size={48} color="var(--violet-light)" style={{ marginBottom: 20, margin: '0 auto', display: 'block' }} />
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Initialize Simulation</h2>
              <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
                The AI will generate a tailored 3-stage process (Aptitude, Coding, and Technical Review) designed to mimic the exact hiring bar of your target company.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32, textAlign: 'left' }}>
                <div>
                  <label className="label">Target Company</label>
                  <input className="input" placeholder="e.g. Stripe, Google, DE Shaw" value={company} onChange={e => setCompany(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="label">Target Role</label>
                  <input className="input" placeholder="e.g. Backend Engineer Intern" value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%' }} />
                </div>
              </div>

              {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}

              <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 15, background: 'var(--violet)' }} onClick={handleStart} disabled={!company || !role}>
                <Play fill="currentColor" size={16} /> Deploy Interview Arena Environment
              </button>
            </div>
          </motion.div>
        )}

        {/* LOADING TASKS */}
        {phase === 'loading_tasks' && (
          <motion.div key="loading_tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
            <Loader2 size={40} color="var(--violet)" className="animate-spin" style={{ marginBottom: 20 }} />
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Synthesizing Assessment...</h3>
            <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 8 }}>Generating technical challenges for {company}...</p>
          </motion.div>
        )}

        {/* APTITUDE STAGE */}
        {phase === 'aptitude' && tasks && (
          <motion.div key="aptitude" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BrainCircuit color="var(--cyan)" size={20} />
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Stage 1: Logical & Aptitude</h2>
              </div>
              <div className="chip">Question {currentQuestion + 1} of {tasks.aptitude_questions.length}</div>
            </div>

            <div className="card" style={{ padding: 32 }}>
              <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, marginBottom: 24 }}>
                {tasks.aptitude_questions[currentQuestion].question}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                {tasks.aptitude_questions[currentQuestion].options.map((opt: string, idx: number) => (
                  <div 
                    key={idx}
                    onClick={() => setSelectedOption(idx)}
                    style={{ 
                      padding: '16px 20px', 
                      borderRadius: 12, 
                      border: `2px solid ${selectedOption === idx ? 'var(--cyan)' : 'var(--border)'}`,
                      background: selectedOption === idx ? 'rgba(6,182,212,0.1)' : 'var(--surface-2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', gap: 12
                    }}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${selectedOption === idx ? 'var(--cyan)' : 'var(--text-3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedOption === idx && <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--cyan)' }} />}
                    </div>
                    <span style={{ fontSize: 15 }}>{opt}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" disabled={selectedOption === null} onClick={handleAptitudeNext} style={{ width: '100%', padding: 14 }}>
                {currentQuestion < tasks.aptitude_questions.length - 1 ? 'Next Question' : 'Submit & Proceed to Coding'} <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* CODING STAGE */}
        {phase === 'coding' && tasks && (
          <motion.div key="coding" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TerminalSquare color="#ec4899" size={20} />
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Stage 2: Technical Sandbox</h2>
              </div>
              <div className="chip">Aptitude Score: {aptitudeScore}/{tasks.aptitude_questions.length}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: 24 }}>
              {/* Problem Prompt */}
              <div className="card" style={{ padding: 24, height: '600px', overflowY: 'auto' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{tasks.coding_problem?.title || 'Coding Challenge'}</h3>
                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {tasks.coding_problem?.description}
                </div>
              </div>

              {/* IDE */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '600px', background: '#1e1e1e' }}>
                <div style={{ padding: '12px 20px', background: '#252526', display: 'flex', alignItems: 'center', borderBottom: '1px solid #333' }}>
                  <Code size={16} color="#4ade80" style={{ marginRight: 8 }} />
                  <span style={{ color: '#ccc', fontSize: 13, fontFamily: 'monospace' }}>solution.py</span>
                </div>
                <textarea 
                  value={code} 
                  onChange={e => setCode(e.target.value)} 
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  style={{ 
                    flex: 1, width: '100%', padding: '20px', background: 'transparent',
                    border: 'none', color: '#d4d4d4', fontFamily: 'monospace', fontSize: 14,
                    lineHeight: 1.6, outline: 'none', resize: 'none'
                  }} 
                />
                <div style={{ padding: 16, background: '#252526', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={() => setPhase('mock')} style={{ background: '#ec4899' }}>
                    Compile & Run Checks <Play fill="currentColor" size={14} style={{ marginLeft: 6 }} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* MOCK REVIEW STAGE */}
        {phase === 'mock' && (
          <motion.div key="mock" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <BrainCircuit color="var(--violet-light)" size={20} />
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Stage 3: Technical Mock Review</h2>
             </div>
             
             <div className="card" style={{ padding: 32, marginBottom: 24 }}>
                <div style={{ padding: 20, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, marginBottom: 24 }}>
                   <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--violet-light)', marginBottom: 8 }}>Hiring Manager requests:</p>
                   <p style={{ fontSize: 15, color: 'var(--text)' }}>"Great. Now could you explain the logical approach you took above? What is the Time and Space Complexity of your solution?"</p>
                </div>
                
                <textarea 
                  className="input" 
                  rows={8} 
                  placeholder="Explain your approach..." 
                  value={explanation} 
                  onChange={e => setExplanation(e.target.value)} 
                  style={{ width: '100%', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                   <button className="btn btn-primary" disabled={!explanation.trim()} onClick={handleSubmitEvaluation} style={{ padding: '12px 24px' }}>
                     Submit Assessment & Evaluate <ArrowRight size={16} />
                   </button>
                </div>
             </div>
          </motion.div>
        )}

        {/* EVALUATING STAGE */}
        {phase === 'evaluating' && (
          <motion.div key="evaluating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', padding: '100px 0' }}>
            <Loader2 size={40} color="#ec4899" className="animate-spin" style={{ marginBottom: 20 }} />
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Analyzing Submission...</h3>
            <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 8 }}>Groq AI is reviewing your code for efficiency and correctness...</p>
          </motion.div>
        )}

        {/* RESULTS STAGE */}
        {phase === 'results' && results && (
          <motion.div key="results" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
             <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: results.final_score > 70 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyItems: 'center', margin: '0 auto 20px', justifyContent: 'center' }}>
                   {results.final_score > 70 ? <Award size={40} color="#10b981" /> : <AlertTriangle size={40} color="#ef4444" />}
                </div>
                <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: results.final_score > 70 ? '#10b981' : '#ef4444' }}>
                  {results.verdict || 'Evaluation Complete'}
                </h2>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Final Score: {results.final_score}/100</div>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 32 }}>
                <div className="card" style={{ padding: 24 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                     <BrainCircuit size={16} color="var(--cyan)" /> <span className="label">Aptitude</span>
                   </div>
                   <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{results.aptitude_feedback}</p>
                </div>
                <div className="card" style={{ padding: 24 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                     <TerminalSquare size={16} color="#ec4899" /> <span className="label">Coding Quality</span>
                   </div>
                   <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{results.coding_feedback}</p>
                </div>
                <div className="card" style={{ padding: 24 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                     <Zap size={16} color="var(--violet-light)" /> <span className="label">Communication</span>
                   </div>
                   <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>{results.communication_feedback}</p>
                </div>
             </div>

             <div style={{ textAlign: 'center' }}>
               <button className="btn btn-secondary" onClick={() => setPhase('config')}>Run Another Simulation</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
